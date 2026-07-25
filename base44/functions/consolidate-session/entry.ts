import { createClientFromRequest } from "npm:@base44/sdk";
import { classifyForTier } from "../../shared/llm.ts";

// Tier-2 consolidation: a pass over the whole session map that merges
// near-duplicate nodes and proposes the connector edges between nodes that
// Tier-1's narrow per-utterance context can't see.
//
// Cost note (PLAN.md §1d): this used to call Sonnet with adaptive thinking,
// firing every 5 live utterances (~6-12x per session) plus once at the end —
// that combination (pricier model, thinking tokens billed as output, an
// uncached system prompt, resent every call) was the single largest cost
// driver found in the pipeline. Switched to Haiku via a forced tool call
// (like Tier 1) instead of free-text JSON parsing, both because Haiku 4.5
// doesn't support adaptive thinking and because a forced tool call is more
// reliable structured output for a smaller model. This also fixes a real bug:
// the old `reasonForJson` path passed `system` as a plain string with no
// `cache_control`, so Tier 2's system prompt was never cached, unlike Tier
// 1's — `classifyWithTool` caches it the same way Tier 1 does.
// If Haiku's merge/edge judgment turns out too weak in testing, the fallback
// is Sonnet with thinking OFF (not adaptive) — still cheaper than the
// original setup, keeps Sonnet's stronger judgment, drops the thinking-token
// bill. Swap TIER2_MODEL and add `thinking: undefined`/omit if so.
// An admin can also test-drive a different provider/model for this tier live
// via Admin > Config > LLM models (shared/llm.ts) — TIER2_MODEL below is only
// the fallback default when no verified LlmConfig row exists for "t2".
const TIER2_MODEL = "claude-haiku-4-5-20251001";
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

1. "merges" — find pairs that are the SAME thought captured twice (near-duplicates). For each, pick the better node to keep and write a merged 1-2 sentence summary. Only merge true duplicates of the same type — related-but-distinct thoughts stay separate. A node and its own parent (or child) are NEVER a valid merge pair — the tree already correctly shows that relationship as one thought building on another, not the same thought said twice; merging them destroys a structure that was already right. Two sibling facts under the same parent that happen to be shaped the same way (e.g. two nodes each naming which model a different pipeline stage uses) are also usually related-but-distinct, not duplicates — merging them silently drops one of the two facts. A real production bug (Demo Session): a node stating "Tier 2 uses Gemini Flash 3.5" got merged into its own parent overview node, and the merged summary dropped the Tier 2 fact entirely and mislabeled what remained as being about Tier 1 only. When two nodes are related but each carries its own distinct, specific content, leave them connected via the tree/edges instead of merging — only merge when it's genuinely the SAME claim, just said twice.

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

    const { data: result, costUsd: callCost } = await classifyForTier({
      base44,
      tier: "t2",
      defaultModel: TIER2_MODEL,
      maxTokens: 6000,
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
    if (callCost > 0) {
      // Awaited, not fire-and-forget: an un-awaited promise here can lose the
      // race against the function's own return when the merges/edges loops
      // below end up empty (confirmed happening in testing) — Deno Deploy
      // doesn't guarantee background work survives past the response.
      await base44.entities.Session.updateMany(
        { id: session_id },
        { $inc: { llm_cost_usd: callCost } },
      ).catch(() => {});
    }

    // Apply merges first; remap or drop anything touching a removed node
    const removedTo = new Map<string, string>();
    const parentOf = new Map(nodes.map((n) => [n.id, n.parent_id || null]));
    let merged = 0;
    for (const m of result?.merges ?? []) {
      if (
        !nodeIds.has(m.keep_id) ||
        !nodeIds.has(m.remove_id) ||
        m.keep_id === m.remove_id ||
        removedTo.has(m.keep_id) ||
        removedTo.has(m.remove_id) ||
        // A node and its own parent/child are already correctly connected by
        // the tree — that's "related, one builds on the other", not "same
        // thought twice". Merging them would silently drop whichever side's
        // distinct content isn't in the surviving summary (real incident:
        // Demo Session, a "Tier 2 uses Gemini" child got merged into its own
        // parent overview node and the Tier 2 fact vanished).
        parentOf.get(m.keep_id) === m.remove_id ||
        parentOf.get(m.remove_id) === m.keep_id
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
