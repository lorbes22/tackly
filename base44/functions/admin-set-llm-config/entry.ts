import { createClientFromRequest } from "npm:@base44/sdk";
import Anthropic from "npm:@anthropic-ai/sdk";
import { classifyWithTool } from "../../shared/claude.ts";
import { classifyWithGemini } from "../../shared/gemini.ts";

// Admin-only: activates a provider/model/secret for one classification tier
// (t1 = process-session, t2 = consolidate-session), but only after a real
// test call against the given provider/model/secret succeeds — a failed
// test is reported back and NOTHING is written, so a bad model id or an
// unset/wrong secret can never affect live traffic (shared/llm.ts falls
// back to the existing hardcoded Anthropic default when no verified row
// exists for a tier).
const TEST_TOOL = {
  name: "ping",
  description: "Reply to confirm the connection is working.",
  input_schema: {
    type: "object" as const,
    properties: {
      greeting: { type: "string", description: "A short greeting, e.g. 'hello'." },
    },
    required: ["greeting"],
  },
};

async function runTestCall(provider: string, model: string, apiKey: string): Promise<void> {
  if (provider === "anthropic") {
    const { data } = await classifyWithTool({
      client: new Anthropic({ apiKey }),
      model,
      system: "You are a connectivity test.",
      user: "Call the ping tool now.",
      tool: TEST_TOOL,
      maxTokens: 64,
    });
    if (!data?.greeting) throw new Error("Model responded but didn't return the expected tool call.");
    return;
  }
  if (provider === "google") {
    const { data } = await classifyWithGemini({
      apiKey,
      model,
      system: "You are a connectivity test.",
      user: "Call the ping function now.",
      tool: TEST_TOOL,
    });
    if (!data?.greeting) throw new Error("Model responded but didn't return the expected function call.");
    return;
  }
  throw new Error(`Unknown provider "${provider}"`);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller || caller.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const { tier, revert, provider, model, secret_env_var } = body;
    if (tier !== "t1" && tier !== "t2") {
      return Response.json({ error: "tier must be 't1' or 't2'" }, { status: 400 });
    }

    const existing = await base44.asServiceRole.entities.LlmConfig.filter({ tier }, "-created_date", 1);

    if (revert) {
      if (existing[0]) await base44.asServiceRole.entities.LlmConfig.delete(existing[0].id);
      return Response.json({ ok: true, reverted: true });
    }

    if (!provider || !model || !secret_env_var) {
      return Response.json({ error: "provider, model, and secret_env_var are all required" }, { status: 400 });
    }
    if (provider !== "anthropic" && provider !== "google") {
      return Response.json({ error: `Unsupported provider "${provider}"` }, { status: 400 });
    }

    const apiKey = Deno.env.get(secret_env_var);
    if (!apiKey) {
      return Response.json({
        ok: false,
        error: `Secret "${secret_env_var}" isn't set on this app yet. Run: npx base44 secrets set ${secret_env_var}=your-key`,
      });
    }

    try {
      await runTestCall(provider, model, apiKey);
    } catch (err) {
      return Response.json({ ok: false, error: `Test call failed: ${(err as Error).message}` });
    }

    const fields = {
      tier,
      provider,
      model,
      secret_env_var,
      verified_at: new Date().toISOString(),
      set_by_email: caller.email,
    };
    if (existing[0]) {
      await base44.asServiceRole.entities.LlmConfig.update(existing[0].id, fields);
    } else {
      await base44.asServiceRole.entities.LlmConfig.create(fields);
    }
    return Response.json({ ok: true, verified: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
