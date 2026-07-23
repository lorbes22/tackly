// Direct Anthropic API calls for the classification pipeline (replaces
// Base44's built-in InvokeLLM). Shared by process-session (Tier 1) and
// consolidate-session (Tier 2). Uses the official SDK via Deno's npm: import.
import Anthropic from "npm:@anthropic-ai/sdk";

export function makeAnthropic(): Anthropic {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  return new Anthropic({ apiKey });
}

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

// Tier 1 (fast path): a forced tool call gives reliable structured JSON that
// matches `tool.input_schema` — the same guarantee InvokeLLM's
// response_json_schema gave, but it also handles conditionally-present fields.
// The static `system` prompt and the static tool definition are marked
// cacheable: they're byte-identical on every utterance, so after the first
// call they're served from cache instead of re-billed. Haiku 4.5 doesn't
// support adaptive thinking/effort, so this stays a plain, fast call.
export async function classifyWithTool(opts: {
  client: Anthropic;
  model: string;
  system: string;
  user: string;
  tool: {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  };
  maxTokens?: number;
  // deno-lint-ignore no-explicit-any
}): Promise<{ data: any; usage: Usage }> {
  const res = await opts.client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    system: [
      {
        type: "text",
        text: opts.system,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [opts.tool],
    tool_choice: { type: "tool", name: opts.tool.name },
    messages: [{ role: "user", content: opts.user }],
  });
  const block = res.content.find(
    (b: { type: string }) => b.type === "tool_use",
  ) as { input?: Record<string, unknown> } | undefined;
  return { data: block?.input ?? null, usage: res.usage as Usage };
}

// Tier 2 (slow path): Sonnet 5 with adaptive thinking on (the model decides
// how much to reason) — the deeper pass PLAN.md wants, no tight latency
// budget. Adaptive thinking is incompatible with a forced tool call, so the
// model returns JSON in its text output and we parse it. Sonnet 5 emits clean
// JSON reliably when the schema is described and "return only JSON" is asked.
export async function reasonForJson(opts: {
  client: Anthropic;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<{ data: any; usage: Usage }> {
  const res = await opts.client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 12000,
    thinking: { type: "adaptive" },
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  const text = res.content
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("")
    .trim();
  return { data: parseJson(text), usage: res.usage as Usage };
}

function parseJson(text: string): any {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    // Fall back to the outermost {...} span if there's stray prose around it
    const first = t.indexOf("{");
    const last = t.lastIndexOf("}");
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(t.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
