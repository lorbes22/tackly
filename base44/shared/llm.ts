// Per-tier LLM provider selection (Admin > Config > "LLM models"). Each tier
// (t1 = process-session, t2 = consolidate-session) can be pointed at a
// different provider/model/secret via the LlmConfig entity — set through the
// admin UI, which test-calls the combination live before saving it (see
// admin-set-llm-config). No config row for a tier, or a missing/invalid
// secret, always falls back to the tier's hardcoded default Anthropic call —
// this file can never make a tier's live behavior worse than before it
// existed, only optionally different once an admin has verified a swap.
import Anthropic from "npm:@anthropic-ai/sdk";
import { classifyWithTool, estimateCostUsd as estimateAnthropicCostUsd, makeAnthropic } from "./claude.ts";
import { classifyWithGemini, classifyWithGeminiCached, estimateGeminiCostUsd } from "./gemini.ts";

export type ClassifyTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type ClassifyOutcome = {
  // deno-lint-ignore no-explicit-any
  data: any;
  costUsd: number;
  provider: string;
  model: string;
};

export async function classifyForTier(opts: {
  // deno-lint-ignore no-explicit-any
  base44: any; // needs .asServiceRole.entities.LlmConfig
  tier: "t1" | "t2" | "chat";
  defaultModel: string; // today's hardcoded Anthropic model for this tier
  system: string;
  user: string;
  tool: ClassifyTool;
  maxTokens?: number;
  // Gemini explicit caching is OPT-IN, not opt-out, as of 2026-07-30 — see
  // FINDINGS.md §17/§18. Real live evidence across multiple sessions that
  // day isolated the slowness to Google's `cachedContent`-referencing
  // generateContent endpoint SPECIFICALLY: the plain (uncached) Gemini call
  // — same model, same system prompt, same everything else — stayed fast
  // and reliable throughout (confirming the user's own read: "Gemini is
  // fast, always has been"), while every cached call, whether the cache was
  // freshly created or already valid and simply being reused, consistently
  // exceeded even a 2s response time. That's a property of Google's cache-
  // serving path itself, not of Gemini's core model, and not something a
  // timeout/retry can turn into "fast" — it can only bound the damage.
  // Pass true to opt back in for a call site where caching's been verified
  // to actually help (worth re-testing this from time to time — the
  // infrastructure isn't necessarily always this way).
  allowGeminiCache?: boolean;
}): Promise<ClassifyOutcome> {
  const rows = await opts.base44.asServiceRole.entities.LlmConfig.filter(
    { tier: opts.tier },
    "-created_date",
    1,
  );
  const cfg = rows[0];

  if (!cfg) {
    const { data, usage } = await classifyWithTool({
      client: makeAnthropic(),
      model: opts.defaultModel,
      system: opts.system,
      user: opts.user,
      tool: opts.tool,
      maxTokens: opts.maxTokens,
    });
    return {
      data,
      costUsd: estimateAnthropicCostUsd(opts.defaultModel, usage),
      provider: "anthropic",
      model: opts.defaultModel,
    };
  }

  const apiKey = Deno.env.get(cfg.secret_env_var);
  if (!apiKey) {
    throw new Error(
      `LlmConfig for tier "${opts.tier}" points at secret "${cfg.secret_env_var}", which isn't set — run npx base44 secrets set ${cfg.secret_env_var}=your-key`,
    );
  }

  if (cfg.provider === "google" && opts.allowGeminiCache !== true) {
    const { data, usage } = await classifyWithGemini({
      apiKey,
      model: cfg.model,
      system: opts.system,
      user: opts.user,
      tool: opts.tool,
    });
    return { data, costUsd: estimateGeminiCostUsd(cfg.model, usage), provider: "google", model: cfg.model };
  }

  if (cfg.provider === "google") {
    const existingCache =
      cfg.gemini_cache_name && cfg.gemini_cache_expires_at
        ? { name: cfg.gemini_cache_name, expiresAt: cfg.gemini_cache_expires_at }
        : null;
    // Skip re-attempting cache creation while in a post-failure cooldown —
    // retrying on literally every call (the original design) doubled real
    // Gemini request volume on every tier whose prompt/quota can't cache
    // (see PLAN.md), which burned through per-minute rate limits and caused
    // genuine classification calls to fail with 429s.
    const retryAfter = cfg.gemini_cache_retry_after ? new Date(cfg.gemini_cache_retry_after).getTime() : 0;
    const skipCacheAttempt = retryAfter > Date.now();
    const { data, usage, cache, cacheAttemptFailed } = await classifyWithGeminiCached({
      apiKey,
      model: cfg.model,
      system: opts.system,
      user: opts.user,
      tool: opts.tool,
      existingCache,
      skipCacheAttempt,
    });
    // Persist a newly-created cache so the NEXT call reuses it instead of
    // paying to recreate one every time, or start a cooldown after a failed
    // attempt — best-effort, a failed write here just means the next call
    // tries again, not a broken call now.
    if (cache && cache.name !== cfg.gemini_cache_name) {
      await opts.base44.asServiceRole.entities.LlmConfig.update(cfg.id, {
        gemini_cache_name: cache.name,
        gemini_cache_expires_at: cache.expiresAt,
        gemini_cache_retry_after: null,
      }).catch(() => {});
    } else if (cacheAttemptFailed) {
      await opts.base44.asServiceRole.entities.LlmConfig.update(cfg.id, {
        gemini_cache_retry_after: new Date(Date.now() + 15 * 60_000).toISOString(),
      }).catch(() => {});
    }
    return { data, costUsd: estimateGeminiCostUsd(cfg.model, usage), provider: "google", model: cfg.model };
  }

  // provider === "anthropic" (a non-default key/model, e.g. a different tier of Claude)
  const { data, usage } = await classifyWithTool({
    client: new Anthropic({ apiKey }),
    model: cfg.model,
    system: opts.system,
    user: opts.user,
    tool: opts.tool,
    maxTokens: opts.maxTokens,
  });
  return { data, costUsd: estimateAnthropicCostUsd(cfg.model, usage), provider: "anthropic", model: cfg.model };
}
