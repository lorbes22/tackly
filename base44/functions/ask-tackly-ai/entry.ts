import { createClientFromRequest } from "npm:@base44/sdk";
import { classifyForTier } from "../../shared/llm.ts";

// TacklyAI: a per-board chat assistant, scoped ONLY to the one session's own
// nodes — never cross-session, never the raw account-wide history. Free on
// every plan (no checkQuota call — see PLAN.md). Shares the same tier-config
// system as T1/T2 (Admin > Config > LLM models, tier "chat"), so an admin can
// point it at a different provider/model the same test-before-activate way.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const HISTORY_LIMIT = 40; // ~20 turns of prior conversation kept as context
const NODE_LIMIT = 300;

const ANSWER_TOOL = {
  name: "answer_question",
  description: "Give the answer to the user's question about this board.",
  input_schema: {
    type: "object" as const,
    properties: {
      answer: {
        type: "string",
        description: "A direct, concise answer grounded in the board data provided. If the board simply doesn't contain something needed to answer, say so plainly instead of guessing.",
      },
    },
    required: ["answer"],
  },
};

// Static across every call → cacheable. Per-session board content and
// conversation history live in the USER message instead (see buildUserPrompt)
// so caching this tier never conflates one session's board with another's.
const SYSTEM = `You are TacklyAI, answering questions about ONE specific board — a map of thought nodes built from someone's own spoken thinking (a solo session, a meeting, or an imported transcript). You are given that board's nodes (type, title, summary, parent relationships) and the recent conversation so far.

Rules:
- Answer ONLY from the board data given to you. If something isn't captured on the board, say so plainly ("that doesn't seem to be on this board") rather than inventing an answer.
- Be direct and concise — a few sentences, not an essay, unless the question genuinely needs more.
- When useful, reference specific node titles so the answer is traceable back to the board (e.g. "the main action was 'Maya: draft launch email'").
- Nodes have types (topic, idea, question, decision, risk, action, plan, evidence, fact, opinion, waffle) and a parent/child tree structure — use both when relevant (e.g. "the top-level topic was X, and under it...").
- If asked something totally unrelated to this board or thinking-mapping in general, gently redirect back to what the board can answer.

Give your answer via the answer_question tool.`;

function buildUserPrompt(
  session: { type?: string; title?: string },
  nodes: { id: string; type: string; title: string; summary: string; parent_id: string | null }[],
  history: { role: string; text: string }[],
  question: string,
) {
  const nodesBlock = nodes.length
    ? JSON.stringify(
        nodes.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          summary: (n.summary || "").slice(0, 300),
          parent_id: n.parent_id || null,
        })),
        null,
        1,
      )
    : "This board has no nodes yet.";
  const historyBlock = history.length
    ? history.map((m) => `${m.role === "user" ? "User" : "TacklyAI"}: ${m.text}`).join("\n")
    : "none yet";

  return `Board: "${session.title || "Untitled"}" (${session.type === "meeting" ? "meeting" : "personal"} session)

Nodes on this board:
${nodesBlock}

Conversation so far:
${historyBlock}

New question from the user: ${question}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { session_id, question } = await req.json();
    if (!session_id || !question || !question.trim()) {
      return Response.json({ error: "session_id and question are required" }, { status: 400 });
    }

    // RLS scopes reads to the caller, so a foreign session comes back not-found
    const session = await base44.entities.Session.get(session_id);
    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    const [nodes, history] = await Promise.all([
      base44.entities.Node.filter({ session_id }, "created_date", NODE_LIMIT),
      base44.entities.ChatMessage.filter({ session_id }, "created_date", HISTORY_LIMIT),
    ]);
    const visibleNodes = nodes.filter((n) => !n.hidden && !n.provisional);

    const { data, costUsd } = await classifyForTier({
      base44,
      tier: "chat",
      defaultModel: DEFAULT_MODEL,
      system: SYSTEM,
      user: buildUserPrompt(session, visibleNodes, history, question.trim()),
      tool: ANSWER_TOOL,
      maxTokens: 1024,
    });

    if (costUsd > 0) {
      await base44.entities.Session.updateMany(
        { id: session_id },
        { $inc: { llm_cost_usd: costUsd } },
      ).catch(() => {});
    }

    const answer = typeof data?.answer === "string" && data.answer.trim()
      ? data.answer.trim()
      : "I couldn't come up with an answer for that — try rephrasing?";

    const [userMsg, aiMsg] = await Promise.all([
      base44.entities.ChatMessage.create({ session_id, role: "user", text: question.trim() }),
      base44.entities.ChatMessage.create({ session_id, role: "assistant", text: answer }),
    ]);

    return Response.json({ question: userMsg, answer: aiMsg });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
