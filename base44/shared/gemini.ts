// Direct Google Gemini API calls (generateContent, forced function calling,
// explicit context caching) — an alternative provider to Anthropic for T1/T2
// classification, selected per-tier via the LlmConfig entity (see
// shared/llm.ts, admin-set-llm-config). REST shape confirmed live against
// ai.google.dev docs on 2026-07-24, not assumed from memory — Anthropic-
// shaped knowledge doesn't transfer here.
// deno-lint-ignore-file no-explicit-any

type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
};

export type GeminiTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

function functionDeclarations(tool: GeminiTool) {
  return [
    {
      functionDeclarations: [
        { name: tool.name, description: tool.description, parameters: tool.input_schema },
      ],
    },
  ];
}

function forcedToolConfig(tool: GeminiTool) {
  return { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [tool.name] } };
}

// Plain, uncached call — used for the admin "Save & Test" connectivity check
// (no need to spin up a cache just to confirm a key/model works) and as the
// fallback when caching isn't available for a given model/prompt.
export async function classifyWithGemini(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  tool: GeminiTool;
}): Promise<{ data: any; usage: GeminiUsage }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": opts.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: opts.user }] }],
        systemInstruction: { parts: [{ text: opts.system }] },
        tools: functionDeclarations(opts.tool),
        toolConfig: forcedToolConfig(opts.tool),
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const body = await res.json();
  const part = body.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall);
  const data = part?.functionCall?.args ?? null;
  return { data, usage: (body.usageMetadata ?? {}) as GeminiUsage };
}

// Google's cache-specific endpoints (create + cached generateContent) have
// been observed hanging/timing out (524, and consistently exceeding even a
// 6s bound in real live-session testing on 2026-07-30) well past what T1's
// "under 1s" target can tolerate, with no timeout of their own to bound the
// damage — a slow cache endpoint could stall an entire classification
// instead of just falling back to the plain (proven-reliable, pre-caching-
// era) uncached call. Caching is explicitly a cost optimization, never
// something that should be allowed to make T1 SLOWER than not caching at
// all, so both cache-specific fetches below are bounded and fail fast into
// the existing fallback path on a timeout. Kept short (not the original 6s)
// precisely because the failure mode observed live was the endpoint hanging
// near/at 6s on every single call in a session — a longer bound just means
// paying more dead time before every fallback while the endpoint is having
// a bad stretch, with no corresponding chance of success.
const CACHE_FETCH_TIMEOUT_MS = 2000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CACHE_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type GeminiCacheRef = { name: string; expiresAt: string };

// How long a created cache stays alive before it needs recreating. Chosen to
// comfortably outlast a single live session's utterance cadence without
// re-paying the cache-write cost on every call; the ongoing storage fee this
// incurs (Gemini charges ~$1 per million cached tokens per hour, unlike
// Anthropic's free-to-hold 5-minute ephemeral cache) is trivial at this
// prompt's size — a ~6k-token system prompt held for an hour costs ~$0.006.
const CACHE_TTL_SECONDS = 3600;

async function createGeminiCache(opts: {
  apiKey: string;
  model: string;
  system: string;
  tool: GeminiTool;
}): Promise<GeminiCacheRef> {
  const res = await fetchWithTimeout("https://generativelanguage.googleapis.com/v1beta/cachedContents", {
    method: "POST",
    headers: { "x-goog-api-key": opts.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${opts.model}`,
      systemInstruction: { parts: [{ text: opts.system }] },
      tools: functionDeclarations(opts.tool),
      // toolConfig belongs on the CACHE, not the per-call generateContent
      // request — see classifyWithGeminiCached's cached-call branch below
      // for why this matters (a real bug found live, not a style choice).
      toolConfig: forcedToolConfig(opts.tool),
      ttl: `${CACHE_TTL_SECONDS}s`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini cache create error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const body = await res.json();
  return { name: body.name, expiresAt: body.expireTime };
}

// Classification with explicit context caching: reuses `opts.existingCache`
// if it's still valid, otherwise creates a fresh one (caller is responsible
// for persisting the returned `cache` ref so the NEXT call can reuse it —
// see shared/llm.ts). Deliberately fails soft: any problem with the cache
// itself (model/prompt below Google's minimum token threshold for caching,
// an expired-but-not-yet-cleaned-up name, a transient error) falls back to
// the plain uncached call rather than failing the whole classification —
// caching here is purely a cost optimization, never a correctness dependency.
// `skipCacheAttempt` lets the caller skip straight to the uncached call when
// it already knows caching is in a cooldown for this tier (see shared/llm.ts
// — a naive retry-every-call design here previously DOUBLED real request
// volume on every tier, since cache creation permanently fails for some
// prompt/quota combinations, which burned through per-minute rate limits and
// caused real classification calls to fail with 429s — a genuine production
// incident, not hypothetical, see PLAN.md).
export async function classifyWithGeminiCached(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  tool: GeminiTool;
  existingCache?: GeminiCacheRef | null;
  skipCacheAttempt?: boolean;
}): Promise<{ data: any; usage: GeminiUsage; cache: GeminiCacheRef | null; cacheAttemptFailed: boolean }> {
  let cache = opts.existingCache;
  const stillValid = cache && new Date(cache.expiresAt).getTime() - Date.now() > 60_000;
  let cacheAttemptFailed = false;

  if (!stillValid) {
    cache = null;
    if (!opts.skipCacheAttempt) {
      try {
        cache = await createGeminiCache({
          apiKey: opts.apiKey,
          model: opts.model,
          system: opts.system,
          tool: opts.tool,
        });
      } catch (err) {
        console.warn(`Gemini cache create failed, falling back to uncached call: ${(err as Error).message}`);
        cacheAttemptFailed = true;
      }
    }
  }

  if (cache) {
    try {
      const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": opts.apiKey, "Content-Type": "application/json" },
          // Gemini rejects a cachedContent request that also sets
          // system_instruction, tools, or toolConfig — all three are
          // immutable properties of the CachedContent itself (already set
          // in createGeminiCache above), not the per-call request. Setting
          // toolConfig here too was a genuine bug: every single cached call
          // 400'd and silently fell back to the slow uncached path (full
          // system prompt reprocessed from scratch on every classification),
          // which is why caching never actually sped anything up.
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: opts.user }] }],
            cachedContent: cache.name,
          }),
        },
      );
      if (!res.ok) {
        throw new Error(`Gemini cached call error ${res.status}: ${(await res.text()).slice(0, 500)}`);
      }
      const body = await res.json();
      const part = body.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall);
      const data = part?.functionCall?.args ?? null;
      return { data, usage: (body.usageMetadata ?? {}) as GeminiUsage, cache, cacheAttemptFailed };
    } catch (err) {
      console.warn(`Gemini cached generateContent failed, falling back to uncached call: ${(err as Error).message}`);
      cacheAttemptFailed = true;
    }
  }

  const { data, usage } = await classifyWithGemini(opts);
  return { data, usage, cache: null, cacheAttemptFailed };
}

// Published rates (ai.google.dev/gemini-api/docs/pricing, checked
// 2026-07-24) — $ per million tokens. `cacheRead` is the discounted rate for
// tokens served from an explicit CachedContent (via `cachedContent`); the
// ongoing per-hour storage fee isn't folded into per-call cost estimates
// here (see CACHE_TTL_SECONDS comment — trivial at this prompt size).
const GEMINI_PRICING_PER_MTOK: Record<string, { input: number; output: number; cacheRead: number }> = {
  "gemini-3.6-flash": { input: 1.5, output: 7.5, cacheRead: 0.15 },
  "gemini-3.5-flash": { input: 1.5, output: 9, cacheRead: 0.15 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5, cacheRead: 0.03 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cacheRead: 0.03 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4, cacheRead: 0.01 },
};

// Same estimate-not-invoice caveat as claude.ts's estimateCostUsd — returns
// 0 for an unrecognized model id rather than guessing. `promptTokenCount`
// INCLUDES `cachedContentTokenCount` (unlike Anthropic, where cache_read is a
// separate counter not folded into input_tokens) — so the non-cached portion
// is the difference between the two, not promptTokenCount on its own.
export function estimateGeminiCostUsd(model: string, usage: GeminiUsage): number {
  const p = GEMINI_PRICING_PER_MTOK[model];
  if (!p) return 0;
  const cachedTokens = usage.cachedContentTokenCount ?? 0;
  const freshInputTokens = Math.max(0, (usage.promptTokenCount ?? 0) - cachedTokens);
  const cost =
    freshInputTokens * p.input + cachedTokens * p.cacheRead + (usage.candidatesTokenCount ?? 0) * p.output;
  return cost / 1_000_000;
}
