import { createClientFromRequest } from "npm:@base44/sdk";
import { makeAnthropic, reasonForJson } from "../../shared/claude.ts";

// Tier-2 consolidation: a heavier pass over the whole session map, calling
// Claude Sonnet 5 directly (not Base44's InvokeLLM) with adaptive thinking on
// — no tight latency budget here, and the deeper reasoning is worth it
// (PLAN.md §1). Merges near-duplicate nodes and proposes the connector edges
// between nodes that Tier-1's narrow per-utterance context can't see.

const TIER2_MODEL = "claude-sonnet-5";
const RELATIONS = ["expands", "answers", "blocks", "relates_to"];

const TIER2_SYSTEM = `You are the consolidation engine for Tackly, a tool that maps spoken thought into nodes. You are given the full node map for one session. Your job:

1. "merges" — find pairs that are the SAME thought captured twice (near-duplicates). For each, pick the better node to keep and write a merged 1-2 sentence summary. Only merge true duplicates of the same type — related-but-distinct thoughts stay separate.

2. "edges" — propose meaningful connections:
- "expands": A adds detail or builds on B
- "answers": A (a fact/decision/idea) answers question B
- "blocks": A (usually a risk) blocks or threatens B
- "relates_to": strong thematic link (use sparingly)

Rules:
- Use only node ids from the provided list.
- A good map is sparse — prefer a handful of high-signal edges over a hairball.
- Never propose an edge for a pair you are merging, an edge already listed as existing, or a self-edge.

Return ONLY a JSON object (no prose, no markdown fences) of exactly this shape:
{"merges":[{"keep_id":"<id>","remove_id":"<id>","merged_summary":"<text>"}],"edges":[{"from_id":"<id>","to_id":"<id>","relation":"expands|answers|blocks|relates_to"}]}
merged_summary is optional. Both arrays may be empty.`;

function buildUserPrompt(
  nodes: { id: string; type: string; title: string; summary: string; status: string }[],
  existingEdges: { from_node_id: string; to_node_id: string }[],
) {
  const maxEdges = Math.max(3, Math.round(nodes.length * 1.2));
  return `Propose at most ${maxEdges} edges.

Nodes:
${JSON.stringify(nodes, null, 1)}

Existing edges (from -> to):
${existingEdges.length ? JSON.stringify(existingEdges.map((e) => [e.from_node_id, e.to_node_id])) : "none"}`;
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

    const session = await base44.entities.Session.get(session_id);
    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    // Live (active) sessions can be consolidated repeatedly on an interval;
    // only the final wrap-up pass stamps consolidated_at, so the end-of-session
    // consolidation still fires once regardless of how many live passes ran.
    const isLive = session.status === "active";
    const nodes = await base44.entities.Node.filter(
      { session_id },
      "created_date",
      200,
    );

    if (nodes.length < 2) {
      if (!isLive) {
        await base44.entities.Session.update(session_id, {
          consolidated_at: new Date().toISOString(),
        });
      }
      return Response.json({ merged: 0, edges_created: 0 });
    }

    const existingEdges = await base44.entities.NodeEdge.filter({}, "created_date", 500);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const sessionEdges = existingEdges.filter(
      (e) => nodeIds.has(e.from_node_id) && nodeIds.has(e.to_node_id),
    );

    // Consolidation results stream to the board as ops too
    const lastOps = await base44.entities.SessionOp.filter({ session_id }, "-seq", 1);
    let seq = lastOps[0]?.seq ?? 0;
    const appendOp = (op_type: string, payload: Record<string, unknown>) =>
      base44.entities.SessionOp.create({
        session_id,
        seq: ++seq,
        op_type,
        payload,
        owner_email: session.owner_email || undefined,
      });

    const { data: result } = await reasonForJson({
      client: makeAnthropic(),
      model: TIER2_MODEL,
      system: TIER2_SYSTEM,
      user: buildUserPrompt(
        nodes.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          summary: (n.summary || "").slice(0, 200),
          status: n.status,
        })),
        sessionEdges,
      ),
    });

    // Apply merges first; remap or drop anything touching a removed node
    const removedTo = new Map<string, string>();
    let merged = 0;
    for (const m of result?.merges ?? []) {
      if (
        !nodeIds.has(m.keep_id) ||
        !nodeIds.has(m.remove_id) ||
        m.keep_id === m.remove_id ||
        removedTo.has(m.keep_id) ||
        removedTo.has(m.remove_id)
      ) {
        continue;
      }
      if (m.merged_summary) {
        await base44.entities.Node.update(m.keep_id, {
          summary: m.merged_summary.slice(0, 600),
        });
      }
      // Re-point transcript links from the removed node to the kept one
      const links = await base44.entities.NodeUtteranceLink.filter({
        node_id: m.remove_id,
      });
      for (const link of links) {
        await base44.entities.NodeUtteranceLink.update(link.id, {
          node_id: m.keep_id,
        });
      }
      // Re-point existing edges, dropping any that would become self-edges
      for (const e of sessionEdges) {
        if (e.from_node_id === m.remove_id || e.to_node_id === m.remove_id) {
          const from = e.from_node_id === m.remove_id ? m.keep_id : e.from_node_id;
          const to = e.to_node_id === m.remove_id ? m.keep_id : e.to_node_id;
          if (from === to) {
            await base44.entities.NodeEdge.delete(e.id);
          } else {
            await base44.entities.NodeEdge.update(e.id, {
              from_node_id: from,
              to_node_id: to,
            });
          }
        }
      }
      await base44.entities.Node.delete(m.remove_id);
      removedTo.set(m.remove_id, m.keep_id);
      merged++;
      await appendOp("merge_nodes", {
        keep_id: m.keep_id,
        remove_id: m.remove_id,
        merged_summary: m.merged_summary?.slice(0, 600),
      });
    }

    const resolveId = (id: string) => removedTo.get(id) ?? id;
    const seenPairs = new Set(
      sessionEdges.map((e) => `${resolveId(e.from_node_id)}->${resolveId(e.to_node_id)}`),
    );

    let edgesCreated = 0;
    const events: Record<string, unknown>[] = [];
    for (const e of result?.edges ?? []) {
      const from = resolveId(e.from_id);
      const to = resolveId(e.to_id);
      const key = `${from}->${to}`;
      const reverseKey = `${to}->${from}`;
      if (
        !nodeIds.has(e.from_id) ||
        !nodeIds.has(e.to_id) ||
        removedTo.has(from) ||
        removedTo.has(to) ||
        from === to ||
        seenPairs.has(key) ||
        seenPairs.has(reverseKey) ||
        !RELATIONS.includes(e.relation)
      ) {
        continue;
      }
      const edge = await base44.entities.NodeEdge.create({
        from_node_id: from,
        to_node_id: to,
        relation: e.relation,
        cross_session: false,
      });
      await appendOp("create_edge", { edge });
      seenPairs.add(key);
      edgesCreated++;
      events.push({
        user_id: user.id,
        event_type: "node_linked",
        meta: { session_id, from_node_id: from, to_node_id: to, relation: e.relation },
      });
    }

    if (events.length) {
      await base44.entities.UsageEvent.bulkCreate(events);
    }

    if (!isLive) {
      await base44.entities.Session.update(session_id, {
        consolidated_at: new Date().toISOString(),
      });
    }

    return Response.json({ merged, edges_created: edgesCreated });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
