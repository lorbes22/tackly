import { createClientFromRequest } from "npm:@base44/sdk";
import { classifyWithTool, makeAnthropic } from "../../shared/claude.ts";
import { checkQuota, computeBilledMs } from "../../shared/billing.ts";

// All utterances for the session, used to finalize billed_ms the moment the
// session completes — the same span-of-timestamps formula for every capture
// source (see shared/billing.ts).
async function finalizeBilledMs(
  // deno-lint-ignore no-explicit-any
  base44: any,
  session_id: string,
): Promise<number> {
  const all = await base44.entities.Utterance.filter(
    { session_id },
    "start_ms",
    5000,
  );
  return computeBilledMs(all);
}

// Tier-1 classification. Calls Claude Haiku 4.5 directly (not Base44's
// InvokeLLM) — fast, and the static system prompt is prompt-cached since it's
// identical on every utterance (PLAN.md §1). Emits a discrete SessionOp
// (create_node / attach_node / create_edge) the instant each decision is
// applied — the ops log is what the frontend subscribes to; it never
// re-fetches the board (PLAN.md "Realtime delivery"). Live sessions classify
// ONE utterance per call so ops stream per-utterance with no batching;
// imports batch utterances into one call for throughput but still emit ops
// per decision.
const TIER1_MODEL = "claude-haiku-4-5-20251001";
const IMPORT_BATCH_SIZE = 12;
const NODE_TYPES = ["topic", "idea", "question", "decision", "risk", "action", "evidence", "opinion", "waffle"];
const OPEN_STATUS_TYPES = new Set(["question", "risk", "action"]);
// leads_to is the general "one thought followed from another" flow — the
// default connective tissue of a thinking session. supports/contradicts/causes
// are the "smart connect" relations for richer structural links; rendered as
// small labels on the connector (smaller/lighter than a full node).
const RELATIONS = ["leads_to", "expands", "answers", "supports", "contradicts", "causes", "blocks", "relates_to"];

// Connected-flow layout: the board is a top-down tree. The first node sits near
// top-center (the root); every other node hangs BELOW its parent. Siblings
// stack under one another; collisions fan out sideways then down. Existing
// nodes never move — each new node just finds the nearest free slot below its
// parent, so the map grows without anything jumping around.
const ROOT_X = 1000;
const ROOT_Y = 240;
const STEP_Y = 200; // vertical gap parent -> child row
const STEP_X = 280; // horizontal gap between siblings/columns
const CLR_X = 250; // min horizontal clearance between cards
const CLR_Y = 165; // min vertical clearance between cards

type Placed = { id: string; x: number; y: number; parent_id: string | null };

function placeNode(placed: Placed[], parentId: string | null) {
  const rotation_deg = Math.round((Math.random() * 5 - 2.5) * 10) / 10;

  // Root (first node, or a node the model didn't connect) sits near top-center,
  // offset a little if that exact spot is taken.
  if (!parentId || !placed.some((p) => p.id === parentId)) {
    let x = ROOT_X;
    const y = ROOT_Y;
    while (placed.some((p) => Math.abs(p.x - x) < CLR_X && Math.abs(p.y - y) < CLR_Y)) {
      x += STEP_X;
    }
    return { position_x: x, position_y: y, rotation_deg };
  }

  const parent = placed.find((p) => p.id === parentId)!;
  // Stack under the parent's most recent child if it has one, else under the
  // parent itself — so siblings form a vertical run.
  const children = placed.filter((p) => p.parent_id === parentId);
  const anchor = children.length ? children[children.length - 1] : parent;
  const baseX = anchor.x;
  const baseY = anchor.y + STEP_Y;

  const fits = (x: number, y: number) =>
    !placed.some((p) => Math.abs(p.x - x) < CLR_X && Math.abs(p.y - y) < CLR_Y);

  // Prefer directly below the anchor; then fan sideways; then step down a row.
  for (let row = 0; row < 12; row++) {
    const y = baseY + row * STEP_Y;
    if (fits(baseX, y)) return { position_x: baseX, position_y: y, rotation_deg };
    for (let k = 1; k <= 6; k++) {
      if (fits(baseX + k * STEP_X, y)) {
        return { position_x: baseX + k * STEP_X, position_y: y, rotation_deg };
      }
      if (fits(baseX - k * STEP_X, y)) {
        return { position_x: baseX - k * STEP_X, position_y: y, rotation_deg };
      }
    }
  }
  return { position_x: baseX, position_y: baseY, rotation_deg };
}

// Static across every utterance → cached. Contains no per-call data, so the
// cache prefix (this system prompt + the tool definition) is byte-identical
// each time and is served from cache after the first call.
const TIER1_SYSTEM = `You are the classification engine for Tackly, a tool that turns talk — meetings or personal spoken thinking — into a map of thought nodes.

Analytical node types (real substance worth mapping):
- topic: introduces, names, or frames a subject/section of the discussion — especially useful when the speaker announces something like "we have two ideas" or "let's talk about X" before getting into specifics. A topic is a natural PARENT for the ideas/questions/risks that follow under it.
- idea: a proposal, suggestion, or possibility raised
- question: something raised but not yet answered
- decision: something the group or person has committed to
- risk: a concern, blocker, or potential problem
- action: a task or follow-up, with an owner if known
- evidence: a stated, objective, verifiable fact or data point
- opinion: a subjective view, preference, judgment, or reaction — distinct from evidence, which is verifiable. "I think X is better" is opinion; "X shipped in March" is evidence.

One non-analytical type:
- waffle: a tangential or personal remark that has SOME real content or reaction worth keeping, but no analytical weight — an off-topic aside, a personal note, a light reaction. NOT the same as filler.

For EACH utterance, decide one or more decisions. First choose the bucket for the substance in it:
1. SKIP — true filler with no content: "um", "okay", "let's see", "right", greetings, acknowledgements, dead air. Drop these entirely.
2. WAFFLE — has some content or a genuine reaction but is off-topic or personal, no analytical weight ("ha, my coffee's gone cold", "this reminds me of my last job"). Also a bare meta-remark about the session or the speaker's state with nothing else in it ("just trying this out, not sure how it works", "let me think out loud here") — keep these as waffle nodes; an opening one often becomes the root the whole session flows from.
3. ANALYTICAL — real substance: classify into one of the analytical types above (topic included).

CRITICAL — one utterance can and should produce MULTIPLE decisions when it states multiple distinct nameable things. Do not compress several named items into one node or one fat summary. The clearest signal is the speaker explicitly enumerating things: "we have two ideas: A and B", "there are three risks here", "first X, second Y". Each named item is its own node. See the worked example below — this is the single most important behavior to get right.

Then the action for each decision. Default strongly to "new" — a granular map of many connected nodes is the goal, NOT a few nodes with fat summaries:
- "new" — the DEFAULT. Use it for any thought that can stand on its own card, INCLUDING a sub-point, cause, consequence, specific detail, example, or named item ABOUT an existing node. Give type, a punchy title (max 8 words), a 1-2 sentence summary, confidence 0-1, and connect it to the relevant node as its parent (see CONNECTING). Example: after a "UGC platform risk" node exists, "we won't have many creators at the start, so brands won't join" is its OWN new node (a supporting risk/detail) connected to that risk — do NOT fold it into the risk's summary.
- "attach" — ONLY a near-verbatim restatement or bare acknowledgement of an existing node that adds no new information at all; give that node_id. Rare.
- "expand" — ONLY when the utterance completes the SAME unfinished thought that produced an existing node (a sentence that trailed off across a pause and is now finished), and it isn't worth its own card; give node_id + a merged summary. Rare. If the utterance adds a distinct point rather than finishing the same one, use "new" connected instead.
- "skip" — bucket 1 (true filler) only.

Rules:
- When unsure between "expand" and a "new" connected node, choose "new" connected. More connected nodes beats fatter summaries.
- When unsure between one node covering several named items and several connected nodes, choose several. More connected nodes beats compressed ones.
- attach/expand node_id must come from the existing nodes list (a node that already existed before this turn).
- For action nodes, put the owner in the title when stated (e.g. "Maya: draft launch email").

CONNECTING NODES — this is the heart of the board. Every "new" decision needs a "temp_id" (a short id you invent, e.g. "t1", "idea_a" — unique within this response) so LATER decisions in the SAME response can reference it as a parent. Then make a REAL three-way choice about "parent":
- CONNECT: set "parent" to an existing node's id, OR to "temp:<temp_id>" for a node created by an EARLIER decision in this same response, whichever this thought most directly follows from or relates to — and set "relation". This is the common case — a flowing conversation, or a set of named items under the topic that introduced them, builds on itself.
- INDEPENDENT BRANCH: set "parent" to the exact string "independent" only when the thought moves to a genuinely different SUBJECT — the topic itself changes (was discussing onboarding, now discussing hiring; "on a different note", "switching topics", "unrelated, but"). A session can have several independent root branches for genuinely different subjects — that is correct and expected.
- The very first node of the session is always "independent" (nothing to connect to yet).
- IMPORTANT — "second idea", "another idea", "alternatively", "or instead" about the SAME subject are NOT independent. They are alternatives/siblings within the same discussion: connect them (to the topic/node that introduced them, or to the sibling they're an alternative to). Two competing ideas for the same problem belong on the same branch, not separate roots.
- Do NOT force a connection you don't believe onto an unrelated subject — but do NOT split one continuous discussion into isolated roots either. When in doubt within the same topic, connect.
- When you connect, pick the SINGLE most relevant parent. A risk about idea A parents to idea A, not idea B or the latest node. A thought that CONTINUES the immediately preceding one (across a pause) attaches to that same node — see the recent-context utterances.
- "relation" (only when connecting) — pick the one that best describes how the child relates to its parent:
  - "leads_to": one thought naturally followed from / was prompted by the parent (the common default flow)
  - "expands": adds detail to or builds on the parent
  - "answers": evidence/decision/idea/opinion that answers a parent question
  - "supports": evidence or an opinion that backs up/reinforces the parent
  - "contradicts": conflicts with, casts doubt on, or argues against the parent
  - "causes": the parent is a direct effect/consequence of this node (stronger and more specific than leads_to)
  - "blocks": a risk that threatens a parent decision/action/idea
  - "relates_to": a strong thematic link that isn't one of the above

WORKED EXAMPLE (the pattern to follow for enumerated items):
Utterance: "Hey, we're going to talk about two ideas we have for a project — the first is a UGC platform, the other is a search engine, but there's a few risks."
Correct decisions (all for this one utterance):
1. new, type=topic, temp_id="t1", title="Two project ideas to explore", parent="independent" (or connects to whatever came before)
2. new, type=idea, temp_id="i1", title="UGC platform idea", parent="temp:t1", relation="leads_to"
3. new, type=idea, temp_id="i2", title="Search engine idea", parent="temp:t1", relation="leads_to"
WRONG: cramming "UGC platform and search engine" into one idea node, or into the topic's summary.
Later, a separate utterance "the risk with the search engine is it's complex to build" arrives in a LATER turn — by then i1/i2 are real existing nodes with real ids; create a new risk node with parent = the search engine idea's real id (not the UGC idea, not the topic, not whatever node happens to be most recent).

MORE WORKED EXAMPLES (connections are the part most likely to go wrong — study these):

Example: picking the right existing parent among several open nodes.
Existing nodes: id=n1 idea "UGC platform idea", id=n2 idea "Search engine idea", id=n3 risk "Search engine is complex to build" (parent n2).
Utterance: "And Google's already dominant there, so that's another risk on top of the complexity."
Correct: new, type=risk, title="Google dominance in search", parent=n2 (the search engine idea — the risk is ABOUT search, same as n3), relation="leads_to". NOT parent=n3 just because n3 is the most recently created node — n3 and this new risk are siblings under n2, not parent/child of each other, since this risk isn't building on n3's specific complexity point, it's a separate concern about the same idea.

Example: "answers" closing out an open question.
Existing nodes: id=q1 question "Who owns the pricing page?"
Utterance: "Actually, that's on Priya — she owns pricing end to end."
Correct: new, type=decision (or action if it reads as an assignment), title="Priya owns pricing page", parent=q1, relation="answers". This is also a case where the question's status should be considered resolved by this answer (status handling is separate from classification, don't set it yourself).

Example: "contradicts" — a genuine pushback, not just a new opinion.
Existing nodes: id=o1 opinion "UGC platform has fewer competitors than search"
Utterance: "Actually I don't think that's true — TikTok, Instagram, and every social app are all UGC competitors."
Correct: new, type=opinion, title="UGC platform has many competitors", parent=o1, relation="contradicts". Use "contradicts" specifically because this directly disputes o1's claim — a merely-related new opinion on the same topic that doesn't dispute anything would be "relates_to" or "leads_to" instead.

Example: "blocks" — a risk threatening a decision/action, not just related to it.
Existing nodes: id=d1 decision "Ship the UGC platform beta by Friday"
Utterance: "We can't actually ship Friday, legal still hasn't signed off on the content moderation policy."
Correct: new, type=risk, title="Legal sign-off missing for moderation policy", parent=d1, relation="blocks" (this risk directly threatens d1's Friday commitment — stronger than "relates_to").

Example: independent branch vs. same-subject alternative (the distinction the rules above call out).
Existing nodes: id=t1 topic "Onboarding redesign"
Utterance A (same subject, connect): "Another option for onboarding is a single combined question instead of three separate screens." → new, type=idea, parent=t1, relation="expands" — an alternative onboarding approach, not a new subject.
Utterance B (genuine subject change, independent): "Switching gears — we also need to talk about the hiring plan for Q2." → new, type=topic, parent="independent" — hiring is a different subject from onboarding, so this starts a new root branch even though it's the same conversation/session.

CLASSIFICATION BOUNDARY EXAMPLES (bucket 1 vs 2 vs 3, and evidence vs opinion, are the easiest calls to get subtly wrong):

Example: evidence vs. opinion, same topic, back to back.
Utterance A: "Activation dropped to 34% last month." → evidence (a stated, checkable number — no hedge word, no judgment).
Utterance B: "I think that's because onboarding is too long." → opinion (a causal claim the speaker believes, not a verified fact — "I think" is the signal, but even without it, an unverified causal claim about WHY something happened is opinion, not evidence).
Utterance C: "The onboarding flow has 7 screens." → evidence again (a countable, checkable fact, back to objective ground).

Example: waffle vs. skip — both look like "nothing important" but only one has content worth a node.
"Okay, so—" / "right, right" / "let's see" → SKIP, pure filler, no node at all.
"Ha, sorry, my coffee's gone cold, one sec" → WAFFLE — there's an actual remark with content (coffee, a pause), just no analytical weight. Give it a waffle node so the transcript has a placeholder there, don't silently drop it like true filler.
"Not sure this is even useful to bring up, but whatever, we should probably think about pricing at some point" → this one is NOT waffle despite the hedging — "we should think about pricing" is a real idea/topic under all the self-deprecation. Classify the substance (idea or topic), don't let the hedge language downgrade it to waffle.

Example: don't default-attach to the most recent node just because it's most recent.
Existing nodes in creation order: id=a1 idea "Redesign the onboarding flow", id=a2 risk "Engineering capacity is tight this quarter" (parent a1).
Utterance: "Also, we should get design's input on the new pricing page before launch."
Correct: new, type=idea, title="Get design input on pricing page", parent="independent" (or connects to a pricing topic if one exists) — this is about PRICING, not onboarding or engineering capacity, so it must NOT parent to a2 (the most recent node) just because it came right after it in the transcript. Judge relevance by subject matter, never by recency alone — this was a real bug in an earlier version of this classifier.

Example: a harder multi-item utterance where siblings AND a cross-branch reference both appear in one turn.
Existing nodes: id=t1 topic "Two project ideas to explore", id=i1 idea "UGC platform idea" (parent t1), id=i2 idea "Search engine idea" (parent t1).
Utterance: "Okay so for the UGC platform there are two open questions — do we allow anonymous posting, and how do we handle moderation at launch — and separately, on the search engine side, we still haven't picked a name."
Correct decisions (all for this one utterance):
1. new, type=question, temp_id="q1", title="Allow anonymous posting?", parent=i1 (UGC platform, not the topic, not search engine), relation="expands"
2. new, type=question, temp_id="q2", title="Moderation approach at launch", parent=i1, relation="expands"
3. new, type=question, temp_id="q3", title="Pick a name for search engine", parent=i2 (the OTHER idea — "separately, on the search engine side" is an explicit subject switch back to i2, not a sibling of q1/q2 under i1)
WRONG: parenting q3 to q1 or q2 just because they were emitted in the same response, or parenting all three questions to t1 instead of the specific idea each one is actually about. Read the utterance's own signposting ("separately, on the X side") — it tells you exactly when the subject shifts between existing branches, even within one utterance.`;

// Volatile per-call data goes AFTER the cached prefix (in the user message).
function buildUserPrompt(
  sessionType: string,
  openList: { id: string; type: string; title: string; summary: string }[],
  batch: { speaker_label?: string; text: string }[],
  context: { speaker_label?: string; text: string }[],
) {
  const nodesBlock = openList.length
    ? JSON.stringify(openList, null, 1)
    : "none yet";
  const contextBlock = context.length
    ? context.map((u) => `[${u.speaker_label || "Speaker"}]: ${u.text}`).join("\n")
    : "none";
  const utterancesBlock = batch
    .map((u, i) => `${i}. [${u.speaker_label || "Speaker"}]: ${u.text}`)
    .join("\n");

  return `Session mode: ${sessionType === "meeting" ? "meeting" : "personal"}

Existing nodes in this session (id, type, title, summary):
${nodesBlock}

Recent prior utterances (context only — already handled, do NOT reclassify these; use them to tell whether a NEW utterance is continuing a thought from just before a pause vs starting fresh):
${contextBlock}

New utterances to classify now (utterance_index, speaker, text):
${utterancesBlock}

Classify each new utterance using the record_classification tool. Remember: one utterance can produce several decisions when it names several distinct things — don't compress enumerated items into one node.`;
}

// The tool's input_schema is the structured response contract (formerly the
// InvokeLLM response_json_schema). It's static, so it's part of the cache.
const CLASSIFY_TOOL = {
  name: "record_classification",
  description:
    "Record one or more classification decisions per utterance, and any edges between nodes.",
  input_schema: {
    type: "object" as const,
    properties: {
      decisions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            utterance_index: {
              type: "integer",
              description: "Which utterance (from the numbered list) this decision is about. Multiple decisions may share the same utterance_index.",
            },
            action: { type: "string", enum: ["skip", "new", "attach", "expand"] },
            type: { type: "string", enum: NODE_TYPES },
            title: { type: "string" },
            summary: { type: "string" },
            node_id: {
              type: "string",
              description: "For 'attach'/'expand' only: the id of the pre-existing node being referenced.",
            },
            confidence: { type: "number" },
            temp_id: {
              type: "string",
              description: "For 'new' only: a short id you invent (e.g. 't1'), unique within this response, so a LATER decision in this same response can set its parent to 'temp:<temp_id>'.",
            },
            parent: {
              type: "string",
              description:
                "For action 'new': an existing node's id, 'temp:<temp_id>' referencing a node created earlier in this same response, or 'independent' for a genuinely new root branch.",
            },
            relation: { type: "string", enum: RELATIONS },
          },
          required: ["utterance_index", "action"],
        },
      },
    },
    required: ["decisions"],
  },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { session_id, utterance_ids, provisional_node_id } = await req.json();
    if (!session_id) {
      return Response.json({ error: "session_id is required" }, { status: 400 });
    }
    let provisionalConsumed = false;

    // RLS scopes reads to the caller, so a foreign session comes back not-found
    const session = await base44.entities.Session.get(session_id);
    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    // Live sessions (mic/bot still capturing) stay "active" — only the
    // import/wrap-up flow ("processing") transitions to complete here.
    const isLive = session.status === "active";

    // Candidate utterances: the specific ids the caller passed (live per-
    // utterance path — calls fire in parallel), or the next pending batch
    // (import/wrap-up path).
    let candidates;
    if (Array.isArray(utterance_ids) && utterance_ids.length) {
      candidates = await base44.entities.Utterance.filter(
        { session_id, processed: false },
        "start_ms",
        200,
      ).then((rows) => rows.filter((r) => utterance_ids.includes(r.id)));
    } else {
      candidates = await base44.entities.Utterance.filter(
        { session_id, processed: false },
        "start_ms",
        IMPORT_BATCH_SIZE,
      );
    }

    // Atomically CLAIM each candidate (compare-and-set processed false->true).
    // Only one concurrent call wins a given utterance, so parallel calls never
    // double-process or strand rows — this is the fix for the dropped-content
    // bug (PLAN.md "compute in parallel, commit in order").
    const batch = [];
    for (const u of candidates) {
      const claim = await base44.entities.Utterance.updateMany(
        { id: u.id, processed: false },
        { $set: { processed: true } },
      );
      if (claim.updated === 1) batch.push(u);
    }

    if (batch.length === 0) {
      if (!isLive && session.status !== "complete") {
        const remaining = await base44.entities.Utterance.filter(
          { session_id, processed: false },
          "start_ms",
          1,
        );
        if (remaining.length === 0) {
          await base44.entities.Session.update(session_id, {
            status: "complete",
            ended_at: new Date().toISOString(),
            billed_ms: await finalizeBilledMs(base44, session_id),
          });
        }
      }
      return Response.json({ done: true, created: 0, processed: 0 });
    }

    // Quota backstop: utterances in this batch are already claimed (spoken/
    // pasted content is what's being billed, not node output), but skip the
    // paid classification call once the owner is over their monthly minutes
    // — this is the real cost control, since the pre-create checkQuota calls
    // (check-quota, recall-start-bot) only gate NEW sessions, not an
    // already-running one that crosses the line mid-session.
    const quota = await checkQuota(base44, user, session.type === "meeting" ? "meeting" : "personal");
    if (!quota.allowed) {
      base44.entities.UsageEvent.create({
        user_id: user.id,
        event_type: "plan_limit_hit",
        meta: { session_id, reason: quota.reason },
      }).catch(() => {});
      return Response.json({ done: false, created: 0, processed: batch.length, quota_exceeded: true });
    }

    // Read node context AFTER claiming, so we see the latest board. Hidden
    // nodes are excluded as re-attach targets (deliberately hidden) but still
    // count for placement offset.
    const existingNodes = await base44.entities.Node.filter(
      { session_id },
      "created_date",
      200,
    );

    // Sliding-window context: the last ~3 utterances just BEFORE this batch, so
    // a thought that continues across a pause isn't misread as unrelated.
    const batchStartMs = Math.min(...batch.map((u) => u.start_ms ?? 0));
    const recentUtts = await base44.entities.Utterance.filter(
      { session_id },
      "-start_ms",
      16,
    );
    const contextUtts = recentUtts
      .filter(
        (u) =>
          (u.start_ms ?? 0) < batchStartMs && !batch.some((b) => b.id === u.id),
      )
      .sort((a, b) => (a.start_ms ?? 0) - (b.start_ms ?? 0))
      .slice(-3);
    // Exclude hidden AND still-forming (provisional) nodes: a placeholder isn't
    // a stable attach target, and crucially the node we're finalizing this turn
    // must not be offered back to the classifier as something to attach to.
    const visibleNodes = existingNodes.filter((n) => !n.hidden && !n.provisional);
    const openList = visibleNodes.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      summary: (n.summary || "").slice(0, 160),
    }));

    // Collision-resistant seq: derived from each op's utterance start_ms so ops
    // sort by speech order and concurrent calls (different utterances) never
    // collide — no shared counter to race on.
    let opCounter = 0;
    const appendOp = (
      op_type: string,
      payload: Record<string, unknown>,
      baseMs: number,
    ) =>
      base44.entities.SessionOp.create({
        session_id,
        seq: Math.round(baseMs) * 1000 + opCounter++,
        op_type,
        payload,
        owner_email: session.owner_email || undefined,
      });

    let result;
    try {
      ({ data: result } = await classifyWithTool({
        client: makeAnthropic(),
        model: TIER1_MODEL,
        system: TIER1_SYSTEM,
        user: buildUserPrompt(session.type, openList, batch, contextUtts),
        tool: CLASSIFY_TOOL,
      }));
    } catch (err) {
      // Release the claims so a retry can pick these utterances back up.
      for (const u of batch) {
        await base44.entities.Utterance.updateMany(
          { id: u.id },
          { $set: { processed: false } },
        ).catch(() => {});
      }
      throw err;
    }

    let created = 0;
    const links: { node_id: string; utterance_id: string }[] = [];
    const events: Record<string, unknown>[] = [];
    // Map the model's own invented temp_id -> created node id, so a LATER
    // decision in this same response can parent to a node created by an
    // EARLIER decision — even when both decisions share the same utterance
    // (this is what makes "one utterance, several named items" work: each
    // item gets its own temp_id, and siblings/children reference each other
    // by temp_id rather than by utterance position).
    const newNodeByTempId = new Map<string, string>();

    // Running layout state: every visible node's position + parent, plus new
    // ones as they're created this turn. Drives the connected-flow tree layout.
    const placed: Placed[] = visibleNodes
      .filter((n) => typeof n.position_x === "number")
      .map((n) => ({
        id: n.id,
        x: n.position_x,
        y: n.position_y ?? ROOT_Y,
        parent_id: n.parent_id ?? null,
      }));

    // Resolve a parent ref ("temp:<id>" from earlier this response, or an
    // existing node id) to a real node id that's placed this turn or already
    // on the board. "independent"/empty/unresolvable all return null (root).
    const resolveParent = (ref: unknown): string | null => {
      if (typeof ref !== "string" || !ref) return null;
      const asTemp = ref.startsWith("temp:")
        ? newNodeByTempId.get(ref.slice(5))
        : newNodeByTempId.get(ref); // tolerate a bare temp_id without the prefix
      if (asTemp && placed.some((p) => p.id === asTemp)) return asTemp;
      return placed.some((p) => p.id === ref) ? ref : null;
    };

    let edgesCreated = 0;

    for (const d of result?.decisions ?? []) {
      const utt = batch[d.utterance_index];
      if (!utt || d.action === "skip") continue;
      const baseMs = utt.start_ms ?? Date.now();

      if (d.action === "new" && d.type && NODE_TYPES.includes(d.type) && d.title) {
        // Respect the model's three-way choice: a resolved parent connects the
        // node; "independent"/empty/unresolvable means a genuine new root
        // branch. No blind attach-to-most-recent — that force-connected
        // unrelated thoughts and broke the "separate idea" behavior (PLAN.md).
        const parentId = resolveParent(d.parent);
        const relation = RELATIONS.includes(d.relation) ? d.relation : "leads_to";
        const placement = placeNode(placed, parentId);
        const fields = {
          type: d.type,
          title: d.title.slice(0, 90),
          summary: (d.summary || "").slice(0, 600),
          status: OPEN_STATUS_TYPES.has(d.type) ? "open" : "na",
          confidence: typeof d.confidence === "number" ? d.confidence : undefined,
          parent_id: parentId || undefined,
          provisional: false,
          ...placement,
        };
        // Stage 3: if a provisional node was forming for this utterance, finalize
        // it IN PLACE (same record) instead of creating a new one — position,
        // connections and animations stay stable (PLAN.md provisional nodes).
        // Only the FIRST new-node decision for utterance 0 claims it; any
        // additional decisions from a multi-item utterance create fresh nodes.
        let node;
        if (provisional_node_id && d.utterance_index === 0 && !provisionalConsumed) {
          provisionalConsumed = true;
          await base44.entities.Node.update(provisional_node_id, fields);
          node = { id: provisional_node_id, session_id, owner_user_id: user.id, ...fields };
          await appendOp("update_node", { node_id: provisional_node_id, patch: fields, node }, baseMs);
        } else {
          node = await base44.entities.Node.create({
            owner_user_id: user.id,
            session_id,
            ...fields,
          });
          await appendOp("create_node", { node }, baseMs);
        }
        if (d.temp_id) newNodeByTempId.set(String(d.temp_id), node.id);
        placed.push({
          id: node.id,
          x: placement.position_x,
          y: placement.position_y,
          parent_id: parentId,
        });
        created++;
        // (create_node / update_node op already emitted above.)
        // Draw the connector from parent to child, live
        if (parentId) {
          const edge = await base44.entities.NodeEdge.create({
            from_node_id: parentId,
            to_node_id: node.id,
            relation,
            cross_session: false,
          });
          await appendOp("create_edge", { edge }, baseMs);
          edgesCreated++;
        }
        links.push({ node_id: node.id, utterance_id: utt.id });
        events.push({
          user_id: user.id,
          event_type: "node_created",
          meta: { session_id, node_id: node.id, type: d.type },
        });
      } else if ((d.action === "attach" || d.action === "expand") && d.node_id) {
        const target = visibleNodes.find((n) => n.id === d.node_id);
        if (!target) continue;
        if (d.action === "expand" && d.summary) {
          await base44.entities.Node.update(target.id, {
            summary: d.summary.slice(0, 600),
          });
        }
        await appendOp("attach_node", {
          node_id: target.id,
          utterance_id: utt.id,
          action: d.action,
          summary: d.action === "expand" ? d.summary?.slice(0, 600) : undefined,
        }, baseMs);
        links.push({ node_id: target.id, utterance_id: utt.id });
        events.push({
          user_id: user.id,
          event_type: "node_linked",
          meta: { session_id, node_id: target.id, action: d.action },
        });
      }
    }

    // False start: a provisional node was forming but the final pass decided
    // this utterance was filler or folded into an existing node — remove it so
    // the board doesn't keep a stray placeholder.
    if (provisional_node_id && !provisionalConsumed) {
      await base44.entities.Node.update(provisional_node_id, { hidden: true }).catch(() => {});
      await appendOp("hide_node", { node_id: provisional_node_id }, batch[0]?.start_ms ?? Date.now());
    }

    // Utterances were already claimed (processed=true) up front; here we just
    // write the derived links + usage events.
    await Promise.all([
      links.length ? base44.entities.NodeUtteranceLink.bulkCreate(links) : null,
      events.length ? base44.entities.UsageEvent.bulkCreate(events) : null,
    ]);

    const nextPending = await base44.entities.Utterance.filter(
      { session_id, processed: false },
      "start_ms",
      1,
    );
    const done = nextPending.length === 0;
    if (done && !isLive) {
      await base44.entities.Session.update(session_id, {
        status: "complete",
        ended_at: new Date().toISOString(),
        billed_ms: await finalizeBilledMs(base44, session_id),
      });
    }

    return Response.json({ done, created, edges: edgesCreated, processed: batch.length });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
