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

// Cost estimation (PLAN.md §1d): published per-model rates (checked against
// platform.claude.com/docs/en/docs/about-claude/pricing on 2026-07-24 — the
// Sonnet 5 row is INTRODUCTORY pricing in effect through 2026-08-31; it rises
// after that, update the sonnet entry then). `input`/`cacheWrite`/
// `cacheRead`/`output` are all $ per million tokens. `cache_read_input_tokens`
// and `cache_creation_input_tokens` are separate counters from `input_tokens`
// in Anthropic's usage object (not included in it), so all four are summed
// independently below — do not double-count `input_tokens` as already
// including cached tokens.
const MODEL_PRICING_PER_MTOK: Record<
  string,
  { input: number; cacheWrite: number; cacheRead: number; output: number }
> = {
  "claude-haiku-4-5-20251001": { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 },
  "claude-sonnet-5": { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 },
};

// Estimated USD cost of one call, from the model's own reported token usage.
// This is an estimate for relative cost tracking (e.g. admin $/min, before vs
// after a pipeline change) — not a guaranteed match to the actual Anthropic
// invoice (no volume discounts, batch pricing, etc. are accounted for).
export function estimateCostUsd(model: string, usage: Usage): number {
  const p = MODEL_PRICING_PER_MTOK[model];
  if (!p) return 0;
  const cost =
    (usage.input_tokens ?? 0) * p.input +
    (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite +
    (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
    (usage.output_tokens ?? 0) * p.output;
  return cost / 1_000_000;
}
