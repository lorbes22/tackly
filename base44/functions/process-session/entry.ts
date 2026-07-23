import { createClientFromRequest } from "npm:@base44/sdk";
import { classifyWithTool, makeAnthropic } from "../../shared/claude.ts";

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
const NODE_TYPES = ["idea", "fact", "opinion", "question", "decision", "risk", "action", "aside"];
const OPEN_STATUS_TYPES = new Set(["question", "risk", "action"]);
// leads_to is the general "one thought followed from another" flow — the
// default connective tissue of a thinking session.
const RELATIONS = ["leads_to", "expands", "answers", "blocks", "relates_to"];

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
- idea: a proposal, suggestion, or possibility raised
- fact: a stated, objective, verifiable piece of information
- opinion: a subjective view, preference, judgment, or reaction — distinct from fact, which is verifiable. "I think X is better" is opinion; "X shipped in March" is fact.
- question: something raised but not yet answered
- decision: something the group or person has committed to
- risk: a concern, blocker, or potential problem
- action: a task or follow-up, with an owner if known

One non-analytical type:
- aside: a tangential or personal remark that has SOME real content or reaction worth keeping, but no analytical weight — an off-topic aside, a personal note, a light reaction. NOT the same as filler.

For EACH utterance index, decide exactly one action. First choose the bucket:
1. SKIP — true filler with no content: "um", "okay", "let's see", "right", greetings, acknowledgements, dead air. Drop these entirely.
2. ASIDE — has some content or a genuine reaction but is off-topic or personal, no analytical weight ("ha, my coffee's gone cold", "this reminds me of my last job"). Also a meta-remark about the session or the speaker's state ("just trying this out, not sure how it works", "let me think out loud here", "not sure where to start") — keep these as aside nodes; an opening one often becomes the root the whole session flows from. Keep as an "aside"-type node.
3. ANALYTICAL — real substance: classify into one of the analytical types above.

Then the action:
- "skip" — bucket 1 only, OR content already fully captured by an existing node
- "new" — a distinct thought (aside or analytical) worth its own node; give type, a punchy title (max 8 words), a 1-2 sentence summary, and confidence 0-1
- "attach" — restates or supports an existing node without adding new information; give that node_id
- "expand" — adds meaningful new detail to an existing node; give node_id and an updated summary that merges the old summary with the new detail

Rules:
- Be selective with analytical nodes — a node should be worth pinning to a wall. But an aside with real content is worth keeping as an aside rather than dropped.
- Prefer "attach"/"expand" over creating a near-duplicate node. node_id must come from the existing nodes list.
- For action nodes, put the owner in the title when stated (e.g. "Maya: draft launch email").
- A single utterance containing several distinct thoughts should still produce only its single strongest node.

CONNECTING NODES — this is the heart of the board. For each new node make a REAL three-way choice about its "parent":
- CONNECT: set "parent" to the existing node's id (or "new:N" for a node you create earlier this turn) that this thought most directly follows from or relates to, and set "relation". This is the common case — a flowing conversation builds on itself.
- INDEPENDENT BRANCH: set "parent" to the exact string "independent" only when the thought moves to a genuinely different SUBJECT — the topic itself changes (was discussing onboarding, now discussing hiring; "on a different note", "switching topics", "unrelated, but"). A session can have several independent root branches for genuinely different subjects — that is correct and expected.
- The very first node of the session is always "independent" (nothing to connect to yet).
- IMPORTANT — "second idea", "another idea", "alternatively", "or instead" about the SAME subject are NOT independent. They are alternatives/siblings within the same discussion: connect them (to the node that introduced the topic, or to the sibling they're an alternative to, usually with "relates_to" or "leads_to"). Two competing ideas for the same problem belong on the same branch, not separate roots.
- Do NOT force a connection you don't believe onto an unrelated subject — but do NOT split one continuous discussion into isolated roots either. When in doubt within the same topic, connect.
- When you connect, pick the SINGLE most relevant parent. A risk about idea 1 parents to idea 1, not idea 2 or the latest node. A thought that CONTINUES the immediately preceding one (across a pause) attaches to that same node — see the recent-context utterances.
- "relation" (only when connecting):
  - "leads_to": one thought naturally followed from / was prompted by the parent (common)
  - "expands": adds detail to or builds on the parent
  - "answers": a fact/decision/idea/opinion that answers a parent question
  - "blocks": a risk that threatens a parent decision/action/idea
  - "relates_to": a strong thematic link that isn't one of the above`;

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

New utterances to classify now (index, speaker, text):
${utterancesBlock}

Classify each new utterance and choose each new node's parent (or "independent") using the record_classification tool.`;
}

// The tool's input_schema is the structured response contract (formerly the
// InvokeLLM response_json_schema). It's static, so it's part of the cache.
const CLASSIFY_TOOL = {
  name: "record_classification",
  description:
    "Record the classification decision for each utterance and any edges between nodes.",
  input_schema: {
    type: "object" as const,
    properties: {
      decisions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            action: { type: "string", enum: ["skip", "new", "attach", "expand"] },
            type: { type: "string", enum: NODE_TYPES },
            title: { type: "string" },
            summary: { type: "string" },
            node_id: { type: "string" },
            confidence: { type: "number" },
            parent: {
              type: "string",
              description:
                "For action 'new': the parent node's id, or 'new:N', or empty for the session's first node.",
            },
            relation: { type: "string", enum: RELATIONS },
          },
          required: ["index", "action"],
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

    const { session_id, utterance_ids } = await req.json();
    if (!session_id) {
      return Response.json({ error: "session_id is required" }, { status: 400 });
    }

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
          });
        }
      }
      return Response.json({ done: true, created: 0, processed: 0 });
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
    const visibleNodes = existingNodes.filter((n) => !n.hidden);
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
    // Map decision index -> created node id, so edges can reference "new:N"
    const newNodeByIndex = new Map<number, string>();

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

    // Resolve a parent ref ("new:N", a bare index, or an existing id) to a real
    // node id that's already placed this turn or already on the board.
    const resolveParent = (ref: unknown): string | null => {
      if (typeof ref !== "string" || !ref) return null;
      const asNew = ref.startsWith("new:")
        ? newNodeByIndex.get(Number(ref.slice(4)))
        : newNodeByIndex.get(Number(ref));
      if (asNew && placed.some((p) => p.id === asNew)) return asNew;
      return placed.some((p) => p.id === ref) ? ref : null;
    };

    let edgesCreated = 0;

    for (const d of result?.decisions ?? []) {
      const utt = batch[d.index];
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
        const node = await base44.entities.Node.create({
          owner_user_id: user.id,
          session_id,
          type: d.type,
          title: d.title.slice(0, 90),
          summary: (d.summary || "").slice(0, 600),
          status: OPEN_STATUS_TYPES.has(d.type) ? "open" : "na",
          confidence: typeof d.confidence === "number" ? d.confidence : undefined,
          parent_id: parentId || undefined,
          ...placement,
        });
        newNodeByIndex.set(d.index, node.id);
        placed.push({
          id: node.id,
          x: placement.position_x,
          y: placement.position_y,
          parent_id: parentId,
        });
        created++;
        // Push the op the moment the node exists — no waiting for the batch
        await appendOp("create_node", { node }, baseMs);
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
      });
    }

    return Response.json({ done, created, edges: edgesCreated, processed: batch.length });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
