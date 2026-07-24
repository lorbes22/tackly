// Base44 AI Gateway calls (OpenAI-compatible Chat Completions), billed
// against the app's credit quota instead of the Anthropic API key directly.
// Used for Tier 2 (consolidate-session): it's off the live-typing path, so
// the extra hop doesn't cost latency that matters, and it's the only Base44
// surface that lets us pick a specific model — `integrations.Core.InvokeLLM`
// has no `model` param at all, it always runs Base44's own default model.
// deno-lint-ignore-file no-explicit-any

type GatewayUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  base44_credits?: number;
};

// Forces a tool/function call so the response is reliable structured JSON,
// same guarantee classifyWithTool gives on the direct-Anthropic path.
export async function classifyWithGatewayTool(opts: {
  connection: { baseURL: string; token: string };
  model: string;
  system: string;
  user: string;
  tool: {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  };
}): Promise<{ data: any; usage: GatewayUsage }> {
  const res = await fetch(`${opts.connection.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.connection.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: opts.tool.name,
            description: opts.tool.description,
            parameters: opts.tool.input_schema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: opts.tool.name } },
    }),
  });
  if (!res.ok) {
    throw new Error(`AI gateway error ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  const call = body.choices?.[0]?.message?.tool_calls?.[0];
  const data = call ? JSON.parse(call.function.arguments) : null;
  return { data, usage: (body.usage ?? {}) as GatewayUsage };
}
