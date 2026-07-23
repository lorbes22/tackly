import { createClientFromRequest } from "npm:@base44/sdk";
import { checkQuota } from "../../shared/billing.ts";
import {
  BOT_AVATAR_RECORDING_JPEG_B64,
  BOT_AVATAR_NOT_RECORDING_JPEG_B64,
} from "../../shared/botAvatar.ts";

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
    const region = Deno.env.get("RECALL_REGION") || "eu-central-1";

    const { meeting_url, title } = await req.json();
    if (!meeting_url || !/^https?:\/\//.test(meeting_url)) {
      return Response.json(
        { error: "meeting_url must be a valid meeting link" },
        { status: 400 },
      );
    }

    const quota = await checkQuota(base44, user, "meeting");
    if (!quota.allowed) {
      return Response.json({ error: quota.reason }, { status: 402 });
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
    //
    // IMPORTANT: req.url inside a Base44 function is the internal dispatcher
    // URL (base44-dispatcher-production.base44.workers.dev/run/<id>), NOT a
    // publicly reachable address — using it here silently pointed Recall's
    // webhook at a dead URL for an entire meeting.
    //
    // The `base44-api-url` header is ALSO not usable here: the frontend SDK
    // (base44Client.js) never sets a custom serverUrl, so it always talks to
    // the bare "https://base44.app" default regardless of which real domain
    // the page is served from — and that bare host 404s without the
    // /api/apps/<id>/ prefix the SDK itself uses internally. So: hardcode
    // the app's real public domain instead of trying to derive it.
    const origin = "https://tackly.co";
    const webhookUrl = `${origin}/functions/recall-webhook`;
    console.log("recall-start-bot: webhookUrl =", webhookUrl);

    const botRes = await fetch(`https://${region}.recall.ai/api/v1/bot/`, {
      method: "POST",
      headers: {
        authorization: apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        meeting_url,
        bot_name: "Tackly.co",
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
        // Bots join anonymously (no signed-in account), so there's no
        // separate "profile picture" field Recall exposes — this static
        // branded frame IS the bot's visual identity on camera, shown
        // continuously for however long it's in the call.
        automatic_video_output: {
          in_call_recording: { kind: "jpeg", b64_data: BOT_AVATAR_RECORDING_JPEG_B64 },
          in_call_not_recording: { kind: "jpeg", b64_data: BOT_AVATAR_NOT_RECORDING_JPEG_B64 },
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
