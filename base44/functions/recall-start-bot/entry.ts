import { createClientFromRequest } from "npm:@base44/sdk";

// Creates the session, then sends a Recall bot into the pasted meeting link.
// The bot streams finalized transcript events to recall-webhook, authenticated
// by a per-session random token in the webhook URL (Recall's documented
// query-param verification approach).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = Deno.env.get("RECALL_API_KEY");
    if (!apiKey) {
      return Response.json(
        { error: "RECALL_API_KEY is not configured" },
        { status: 500 },
      );
    }
    const region = Deno.env.get("RECALL_REGION") || "us-east-1";

    const { meeting_url, title } = await req.json();
    if (!meeting_url || !/^https?:\/\//.test(meeting_url)) {
      return Response.json(
        { error: "meeting_url must be a valid meeting link" },
        { status: 400 },
      );
    }

    const webhookToken = crypto.randomUUID();
    const session = await base44.entities.Session.create({
      type: "meeting",
      title:
        (title || "").trim() ||
        `Meeting — ${new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}`,
      capture_source: "bot_live",
      status: "active",
      meeting_url,
      webhook_token: webhookToken,
      owner_user_id: user.id,
      owner_email: user.email,
      started_at: new Date().toISOString(),
    });

    // No query params: Base44 routing rejects the trailing slash Recall
    // requires before them. Verification data rides in the endpoint
    // metadata (echoed back on every event) + the unguessable bot_id.
    const origin = new URL(req.url).origin;
    const webhookUrl = `${origin}/functions/recall-webhook`;

    const botRes = await fetch(`https://${region}.recall.ai/api/v1/bot/`, {
      method: "POST",
      headers: {
        authorization: apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        meeting_url,
        bot_name: "Tackly",
        recording_config: {
          transcript: {
            provider: { recallai_streaming: {} },
          },
          realtime_endpoints: [
            {
              type: "webhook",
              url: webhookUrl,
              events: ["transcript.data"],
              metadata: { token: webhookToken, session_id: session.id },
            },
          ],
        },
      }),
    });

    if (!botRes.ok) {
      const detail = await botRes.text();
      await base44.entities.Session.delete(session.id);
      return Response.json(
        { error: `Recall bot creation failed (${botRes.status}): ${detail.slice(0, 300)}` },
        { status: 502 },
      );
    }

    const bot = await botRes.json();
    await base44.entities.Session.update(session.id, { bot_id: bot.id });

    base44.entities.UsageEvent.create({
      user_id: user.id,
      event_type: "session_started",
      meta: { session_id: session.id, capture_source: "bot_live" },
    }).catch(() => {});

    return Response.json({ session_id: session.id, bot_id: bot.id });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
