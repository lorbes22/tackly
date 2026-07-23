import { createClientFromRequest } from "npm:@base44/sdk";

// Tier-1 classification. Emits a discrete SessionOp (create_node /
// attach_node) the instant each decision is applied — the ops log is what
// the frontend subscribes to; it never re-fetches the board (PLAN.md
// "Realtime delivery"). Live sessions classify ONE utterance per call so
// ops stream per-utterance with no batching; imports batch utterances into
// one LLM call for throughput but still emit ops per decision.
const IMPORT_BATCH_SIZE = 12;
const NODE_TYPES = ["idea", "fact", "opinion", "question", "decision", "risk", "action", "aside"];
const OPEN_STATUS_TYPES = new Set(["question", "risk", "action"]);
const RELATIONS = ["expands", "answers", "blocks", "relates_to"];

// Loose grid with jitter so notes feel placed, not machine-gridded
function placeNode(index: number) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  const jitter = () => Math.random() * 44 - 22;
  return {
    position_x: 80 + col * 280 + jitter(),
    position_y: 80 + row * 230 + jitter(),
    rotation_deg: Math.round((Math.random() * 5 - 2.5) * 10) / 10,
  };
}

function buildPrompt(
  sessionType: string,
  openList: { id: string; type: string; title: string; summary: string }[],
  batch: { speaker_label?: string; text: string }[],
) {
  const nodesBlock = openList.length
    ? JSON.stringify(openList, null, 1)
    : "none yet";
  const utterancesBlock = batch
    .map((u, i) => `${i}. [${u.speaker_label || "Speaker"}]: ${u.text}`)
    .join("\n");

  return `You are the classification engine for Tackly, a tool that turns ${
    sessionType === "meeting" ? "meeting transcripts" : "spoken thinking"
  } into a map of thought nodes.

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

Existing nodes in this session (id, type, title, summary):
${nodesBlock}

New utterances (index, speaker, text):
${utterancesBlock}

For EACH utterance index, decide exactly one action. First choose the bucket:
1. SKIP — true filler with no content: "um", "okay", "let's see", "right", greetings, acknowledgements, dead air. Drop these entirely.
2. ASIDE — has some content or a genuine reaction but is off-topic or personal, no analytical weight ("ha, my coffee's gone cold", "this reminds me of my last job"). Keep as an "aside"-type node.
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

ALSO return "edges": connections between a node you are creating THIS turn and an existing node (or another new one from this turn). Look actively for these — a good map is richly connected, and noticing that a new thought relates to something said earlier is the whole point. Relations:
- "answers": a fact/decision/idea/opinion that answers an open question
- "blocks": a risk that threatens a decision/action/idea
- "expands": builds on or adds detail to another node
- "relates_to": a strong thematic link that isn't one of the above
Reference nodes by "from" and "to": use an existing node's id, or "new:N" to reference the node created by decision index N this turn. Only propose edges you're genuinely confident about, but don't be stingy — err toward surfacing a real connection over missing it. No self-edges, no duplicates of edges already implied by the existing map.`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { session_id } = await req.json();
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
    const batchSize = isLive ? 1 : IMPORT_BATCH_SIZE;

    const pending = await base44.entities.Utterance.filter(
      { session_id, processed: false },
      "start_ms",
      batchSize,
    );

    if (pending.length === 0) {
      if (!isLive && session.status !== "complete") {
        await base44.entities.Session.update(session_id, {
          status: "complete",
          ended_at: new Date().toISOString(),
        });
      }
      return Response.json({ done: true, created: 0, processed: 0 });
    }

    // Independent reads run in parallel — nodes for context, last seq for the
    // ops counter. Hidden nodes are excluded as re-attach targets (the user
    // deliberately hid them) but still count for placement offset.
    const [existingNodes, lastOps] = await Promise.all([
      base44.entities.Node.filter({ session_id }, "created_date", 200),
      base44.entities.SessionOp.filter({ session_id }, "-seq", 1),
    ]);
    const visibleNodes = existingNodes.filter((n) => !n.hidden);
    const openList = visibleNodes.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      summary: (n.summary || "").slice(0, 160),
    }));

    // Ops are appended with an incrementing per-session sequence number
    let seq = lastOps[0]?.seq ?? 0;
    const appendOp = (op_type: string, payload: Record<string, unknown>) =>
      base44.entities.SessionOp.create({
        session_id,
        seq: ++seq,
        op_type,
        payload,
        owner_email: session.owner_email || undefined,
      });

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: buildPrompt(session.type, openList, pending),
      response_json_schema: {
        type: "object",
        properties: {
          decisions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                index: { type: "integer" },
                action: {
                  type: "string",
                  enum: ["skip", "new", "attach", "expand"],
                },
                type: { type: "string", enum: NODE_TYPES },
                title: { type: "string" },
                summary: { type: "string" },
                node_id: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["index", "action"],
            },
          },
          edges: {
            type: "array",
            items: {
              type: "object",
              properties: {
                from: { type: "string" },
                to: { type: "string" },
                relation: { type: "string", enum: RELATIONS },
              },
              required: ["from", "to", "relation"],
            },
          },
        },
        required: ["decisions"],
      },
    });

    let created = 0;
    const links: { node_id: string; utterance_id: string }[] = [];
    const events: Record<string, unknown>[] = [];
    // Map decision index -> created node id, so edges can reference "new:N"
    const newNodeByIndex = new Map<number, string>();

    for (const d of result?.decisions ?? []) {
      const utt = pending[d.index];
      if (!utt || d.action === "skip") continue;

      if (d.action === "new" && d.type && NODE_TYPES.includes(d.type) && d.title) {
        const node = await base44.entities.Node.create({
          owner_user_id: user.id,
          session_id,
          type: d.type,
          title: d.title.slice(0, 90),
          summary: (d.summary || "").slice(0, 600),
          status: OPEN_STATUS_TYPES.has(d.type) ? "open" : "na",
          confidence: typeof d.confidence === "number" ? d.confidence : undefined,
          ...placeNode(existingNodes.length + created),
        });
        newNodeByIndex.set(d.index, node.id);
        created++;
        // Push the op the moment the node exists — no waiting for the batch
        await appendOp("create_node", { node });
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
        });
        links.push({ node_id: target.id, utterance_id: utt.id });
        events.push({
          user_id: user.id,
          event_type: "node_linked",
          meta: { session_id, node_id: target.id, action: d.action },
        });
      }
    }

    // Resolve "new:N" / existing-id references to real node ids, then emit
    // create_edge ops live — the same per-utterance path as create_node.
    const resolveRef = (ref: unknown): string | null => {
      if (typeof ref !== "string") return null;
      if (ref.startsWith("new:")) {
        return newNodeByIndex.get(Number(ref.slice(4))) ?? null;
      }
      if (newNodeByIndex.has(Number(ref))) return newNodeByIndex.get(Number(ref))!;
      return visibleNodes.some((n) => n.id === ref) ||
        [...newNodeByIndex.values()].includes(ref)
        ? ref
        : null;
    };
    let edgesCreated = 0;
    for (const e of result?.edges ?? []) {
      const from = resolveRef(e.from);
      const to = resolveRef(e.to);
      if (!from || !to || from === to || !RELATIONS.includes(e.relation)) continue;
      const edge = await base44.entities.NodeEdge.create({
        from_node_id: from,
        to_node_id: to,
        relation: e.relation,
        cross_session: false,
      });
      await appendOp("create_edge", { edge });
      edgesCreated++;
    }

    // Tail writes are independent — run them together
    await Promise.all([
      links.length ? base44.entities.NodeUtteranceLink.bulkCreate(links) : null,
      events.length ? base44.entities.UsageEvent.bulkCreate(events) : null,
      base44.entities.Utterance.bulkUpdate(
        pending.map((u) => ({ id: u.id, processed: true })),
      ),
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

    return Response.json({ done, created, edges: edgesCreated, processed: pending.length });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
