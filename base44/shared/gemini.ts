// Direct Google Gemini API calls (generateContent, forced function calling)
// — an alternative provider to Anthropic for T1/T2 classification, selected
// per-tier via the LlmConfig entity (see shared/llm.ts, admin-set-llm-config).
// REST shape confirmed live against ai.google.dev docs on 2026-07-24, not
// assumed from memory — Anthropic-shaped knowledge doesn't transfer here.
// deno-lint-ignore-file no-explicit-any

type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
};

// Forces a function call so the response is reliable structured JSON, the
// same guarantee classifyWithTool gives on the Anthropic path.
export async function classifyWithGemini(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  tool: {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  };
}): Promise<{ data: any; usage: GeminiUsage }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": opts.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: opts.user }] }],
        systemInstruction: { parts: [{ text: opts.system }] },
        tools: [
          {
            functionDeclarations: [
              {
                name: opts.tool.name,
                description: opts.tool.description,
                parameters: opts.tool.input_schema,
              },
            ],
          },
        ],
        toolConfig: {
          functionCallingConfig: { mode: "ANY", allowedFunctionNames: [opts.tool.name] },
        },
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

// Published rates (ai.google.dev/gemini-api/docs/pricing, checked
// 2026-07-24) — $ per million tokens, input/output only. Gemini's context
// caching is a separate explicit CachedContent object with its own hourly
// storage fee, not a per-call flag like Anthropic's cache_control, so it
// isn't wired up here — this is a quick-test integration, not full parity
// with the Anthropic path's caching.
const GEMINI_PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  "gemini-3.6-flash": { input: 1.5, output: 7.5 },
  "gemini-3.5-flash": { input: 1.5, output: 9 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
};

// Same estimate-not-invoice caveat as claude.ts's estimateCostUsd — returns
// 0 for an unrecognized model id rather than guessing.
export function estimateGeminiCostUsd(model: string, usage: GeminiUsage): number {
  const p = GEMINI_PRICING_PER_MTOK[model];
  if (!p) return 0;
  const cost = (usage.promptTokenCount ?? 0) * p.input + (usage.candidatesTokenCount ?? 0) * p.output;
  return cost / 1_000_000;
}
