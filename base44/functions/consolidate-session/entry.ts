import { createClientFromRequest } from "npm:@base44/sdk";
import { classifyWithGatewayTool } from "../../shared/gateway.ts";

// Tier-2 consolidation: a pass over the whole session map that merges
// near-duplicate nodes and proposes the connector edges between nodes that
// Tier-1's narrow per-utterance context can't see.
//
// Cost note (PLAN.md §1d): this used to call Sonnet directly against the
// Anthropic API with adaptive thinking, firing every 5 live utterances
// (~6-12x per session) plus once at the end — that combination (pricier
// model, thinking tokens billed as output, an uncached system prompt, resent
// every call) was the single largest cost driver found in the pipeline.
// First fix was switching to Haiku via a forced tool call (like Tier 1).
// Second fix (this version): Tier 2 isn't on the live-typing path — nothing
// user-facing is waiting on it the way Tier 1 is — so it doesn't need the
// direct low-latency Anthropic connection Tier 1 needs. Moved it to Base44's
// AI Gateway (`base44.aiGateway`, OpenAI-compatible endpoint) instead, which
// bills against the app's own credit quota rather than the Anthropic API key,
// and — unlike `integrations.Core.InvokeLLM`, which has no model parameter at
// all — lets us pick a specific model. That means Sonnet-quality merge/edge
// judgment is back without paying Anthropic's raw Sonnet rate. Model id
// `claude_sonnet_4_6` resolves (per the gateway's own response) to
// `claude-sonnet-4-6` — a slightly older Sonnet than the `claude-sonnet-5`
// used directly elsewhere, not the literal same model, but still a real step
// up from Haiku for this judgment-heavy pass. Traded away here: Anthropic
// prompt-caching (no `cache_control` equivalent on this OpenAI-compatible
// path, so the ~1KB system prompt is billed in full every call — small in
// absolute terms since Tier 2 fires far less often than Tier 1) and USD cost
// tracking (the gateway meters in `base44_credits`, not raw tokens against a
// known $/MTok rate, so this is tracked in `gateway_credits_used` on the
// session, separate from `llm_cost_usd` — see admin-session-stats).
const TIER2_MODEL = "claude_sonnet_4_6";
const RELATIONS = ["expands", "answers", "blocks", "addresses", "relates_to"];

const TIER2_TOOL = {
  name: "record_consolidation",
  description: "Record merges (near-duplicate nodes) and cross-link edges for the current node map.",
  input_schema: {
    type: "object" as const,
    properties: {
      merges: {
        type: "array",
        items: {
          type: "object",
          properties: {
            keep_id: { type: "string" },
            remove_id: { type: "string" },
            merged_summary: { type: "string" },
          },
          required: ["keep_id", "remove_id"],
        },
      },
      edges: {
        type: "array",
        items: {
          type: "object",
          properties: {
            from_id: { type: "string" },
            to_id: { type: "string" },
            relation: { type: "string", enum: RELATIONS },
          },
          required: ["from_id", "to_id", "relation"],
        },
      },
    },
    required: ["merges", "edges"],
  },
};

const TIER2_SYSTEM = `You are the consolidation engine for Tackly, a tool that maps spoken thought into nodes. You are given the full node map for one session. Your job:

1. "merges" — find pairs that are the SAME thought captured twice (near-duplicates). For each, pick the better node to keep and write a merged 1-2 sentence summary. Only merge true duplicates of the same type — related-but-distinct thoughts stay separate.

2. "edges" — propose meaningful connections:
- "expands": A adds detail or builds on B
- "answers": A (evidence/decision/idea/opinion) answers question B
- "blocks": A (usually a risk) blocks or threatens B
- "addresses": A (evidence/decision/action) resolves or mitigates risk B — the risk-equivalent of "answers" for a question. Use this, not "blocks" or a generic link, when a risk has clearly been cleared elsewhere in the map.
- "relates_to": strong thematic link (use sparingly)

Rules:
- Use only node ids from the provided list.
- A good map is sparse — prefer a handful of high-signal edges over a hairball.
- Never propose an edge for a pair you are merging, an edge already listed as existing, or a self-edge.

Record your findings via the record_consolidation tool. Both arrays may be empty.`;

function buildUserPrompt(
  nodes: { id: string; type: string; title: string; summary: string; status: string }[],
  existingEdges: { from_node_id: string; to_node_id: string }[],
) {
  // Keep cross-links sparse — the parent tree already carries the main
  // structure, so Tier-2 should add only a few high-signal extra connections.
  const maxEdges = Math.max(2, Math.round(nodes.length * 0.4));
  return `Propose at most ${maxEdges} cross-link edges — only genuinely high-signal connections the parent tree doesn't already imply. Fewer, stronger links are better than many weak ones.

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

    const { data: result, usage } = await classifyWithGatewayTool({
      connection: base44.aiGateway.connection(),
      model: TIER2_MODEL,
      system: TIER2_SYSTEM,
      tool: TIER2_TOOL,
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
    const callCredits = usage.base44_credits ?? 0;
    if (callCredits > 0) {
      // Awaited, not fire-and-forget: an un-awaited promise here can lose the
      // race against the function's own return when the merges/edges loops
      // below end up empty (confirmed happening in testing) — Deno Deploy
      // doesn't guarantee background work survives past the response.
      await base44.entities.Session.updateMany(
        { id: session_id },
        { $inc: { gateway_credits_used: callCredits } },
      ).catch(() => {});
    }

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
      // Re-parent any children of the removed node onto the kept one so the
      // connected-flow tree never orphans a branch.
      for (const child of nodes) {
        if (child.parent_id === m.remove_id && child.id !== m.keep_id) {
          await base44.entities.Node.update(child.id, { parent_id: m.keep_id });
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
