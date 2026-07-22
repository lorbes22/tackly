import { createClientFromRequest } from "npm:@base44/sdk";

// Tier-1 classification: consumes one batch of unprocessed utterances per call.
// The frontend keeps invoking until { done: true }, so each call stays fast and
// the board fills in incrementally.
const BATCH_SIZE = 12;
const NODE_TYPES = ["idea", "fact", "question", "decision", "risk", "action"];
const OPEN_STATUS_TYPES = new Set(["question", "risk", "action"]);

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

Node types:
- idea: a proposal, suggestion, or possibility raised
- fact: a stated, verifiable piece of information
- question: something raised but not yet answered
- decision: something the group or person has committed to
- risk: a concern, blocker, or potential problem
- action: a task or follow-up, with an owner if known

Existing nodes in this session (id, type, title, summary):
${nodesBlock}

New utterances (index, speaker, text):
${utterancesBlock}

For EACH utterance index, decide exactly one:
- "skip" — filler, small talk, logistics, or content already fully captured by an existing node
- "new" — a distinct thought worth its own node; give type, a punchy title (max 8 words), a 1-2 sentence summary, and confidence 0-1
- "attach" — restates or supports an existing node without adding new information; give that node_id
- "expand" — adds meaningful new detail to an existing node; give node_id and an updated summary that merges the old summary with the new detail

Rules:
- Most utterances in casual conversation are "skip". Be selective — a node should be worth pinning to a wall.
- Prefer "attach"/"expand" over creating a near-duplicate node. node_id must come from the existing nodes list.
- For action nodes, put the owner in the title when stated (e.g. "Maya: draft launch email").
- A single utterance containing several distinct thoughts should still produce only its single strongest node.`;
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

    const pending = await base44.entities.Utterance.filter(
      { session_id, processed: false },
      "start_ms",
      BATCH_SIZE,
    );

    if (pending.length === 0) {
      if (session.status !== "complete") {
        await base44.entities.Session.update(session_id, {
          status: "complete",
          ended_at: new Date().toISOString(),
        });
      }
      return Response.json({ done: true, created: 0, processed: 0 });
    }

    if (session.status !== "processing") {
      await base44.entities.Session.update(session_id, { status: "processing" });
    }

    const existingNodes = await base44.entities.Node.filter(
      { session_id },
      "created_date",
      200,
    );
    const openList = existingNodes.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      summary: (n.summary || "").slice(0, 160),
    }));

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
        },
        required: ["decisions"],
      },
    });

    let created = 0;
    const links: { node_id: string; utterance_id: string }[] = [];
    const events: Record<string, unknown>[] = [];

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
        created++;
        links.push({ node_id: node.id, utterance_id: utt.id });
        events.push({
          user_id: user.id,
          event_type: "node_created",
          meta: { session_id, node_id: node.id, type: d.type },
        });
      } else if ((d.action === "attach" || d.action === "expand") && d.node_id) {
        const target = existingNodes.find((n) => n.id === d.node_id);
        if (!target) continue;
        if (d.action === "expand" && d.summary) {
          await base44.entities.Node.update(target.id, {
            summary: d.summary.slice(0, 600),
          });
        }
        links.push({ node_id: target.id, utterance_id: utt.id });
        events.push({
          user_id: user.id,
          event_type: "node_linked",
          meta: { session_id, node_id: target.id, action: d.action },
        });
      }
    }

    if (links.length) {
      await base44.entities.NodeUtteranceLink.bulkCreate(links);
    }
    if (events.length) {
      await base44.entities.UsageEvent.bulkCreate(events);
    }

    await base44.entities.Utterance.bulkUpdate(
      pending.map((u) => ({ id: u.id, processed: true })),
    );

    const nextPending = await base44.entities.Utterance.filter(
      { session_id, processed: false },
      "start_ms",
      1,
    );
    const done = nextPending.length === 0;
    if (done) {
      await base44.entities.Session.update(session_id, {
        status: "complete",
        ended_at: new Date().toISOString(),
      });
    }

    return Response.json({ done, created, processed: pending.length });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
