import { createClientFromRequest } from "npm:@base44/sdk";
import { classifyForTier } from "../../shared/llm.ts";

// Stage 2 of provisional nodes (PLAN.md): a lightweight rough-guess over the
// current PARTIAL transcript. Updates the still-forming node in place (type
// + title) and returns a confidence so the client can settle it early (~90%).
// This is NOT authoritative — process-session on end_of_turn is (stage 3).
// Shares tier "t1"'s LlmConfig with process-session (same live/fast path,
// just running on an unfinished utterance) — whatever provider/model an
// admin has activated for T1 governs this rough-guess pass too.
const MODEL = "claude-haiku-4-5-20251001";
const NODE_TYPES = ["topic", "idea", "evidence", "fact", "opinion", "question", "decision", "update", "risk", "action", "plan", "waffle"];

const SYSTEM = `You are giving a FAST rough guess of what kind of thought someone is expressing, from a partial (unfinished) sentence. Pick the single best node type and a short title. This is provisional — err toward a reasonable guess.

Types: topic (introducing/framing a subject), idea, evidence (a fact backing up a claim/decision/risk elsewhere), fact (a standalone data point, no argumentative role), opinion, question, decision, update (reporting something recently changed/fixed/updated, not a live commitment), risk, action, plan (a multi-step forward-looking goal, bigger than one action) or waffle (off-topic/personal remark with some content).

Return via the tool: type, a punchy title (max 8 words), and confidence 0-1 for how sure you are given it's still unfinished.`;

const TOOL = {
  name: "guess",
  description: "Record a rough provisional guess for a forming thought.",
  input_schema: {
    type: "object" as const,
    properties: {
      type: { type: "string", enum: NODE_TYPES },
      title: { type: "string" },
      confidence: { type: "number" },
    },
    required: ["type", "title", "confidence"],
  },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { session_id, node_id, text } = await req.json();
    if (!session_id || !node_id || !text) {
      return Response.json({ error: "session_id, node_id, text required" }, { status: 400 });
    }

    const node = await base44.entities.Node.get(node_id).catch(() => null);
    // Only touch a node that is still forming — a finalized node is authoritative
    if (!node || node.session_id !== session_id || !node.provisional) {
      return Response.json({ ok: false, reason: "not provisional" });
    }

    const { data, costUsd } = await classifyForTier({
      base44,
      tier: "t1",
      defaultModel: MODEL,
      system: SYSTEM,
      user: `Partial (unfinished) utterance: "${text}"`,
      tool: TOOL,
      maxTokens: 256,
      // Explicit and left in place even though caching now defaults off
      // everywhere (see llm.ts) — this system prompt is a fixed ~300
      // tokens, permanently below Google's 1024-token minimum for explicit
      // caching, so this call site should never opt in even if caching is
      // re-enabled elsewhere later.
      allowGeminiCache: false,
    });
    if (costUsd > 0) {
      // Awaited, not fire-and-forget — see consolidate-session's comment on
      // the same pattern; an un-awaited write here can lose the race against
      // the function's own return.
      await base44.entities.Session.updateMany(
        { id: session_id },
        { $inc: { llm_cost_usd: costUsd } },
      ).catch(() => {});
    }
    if (!data?.type || !NODE_TYPES.includes(data.type) || !data.title) {
      return Response.json({ ok: false });
    }

    const patch = { type: data.type, title: String(data.title).slice(0, 90) };
    await base44.entities.Node.update(node_id, patch);

    const lastOps = await base44.entities.SessionOp.filter({ session_id }, "-seq", 1);
    await base44.entities.SessionOp.create({
      session_id,
      seq: (lastOps[0]?.seq ?? 0) + 1,
      op_type: "update_node",
      payload: { node_id, patch },
      owner_email: node.owner_email || undefined,
    });

    return Response.json({
      ok: true,
      type: data.type,
      title: patch.title,
      confidence: typeof data.confidence === "number" ? data.confidence : 0.5,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
