import { createClientFromRequest } from "npm:@base44/sdk";
import { verifyRecallSignature } from "../../shared/recallVerify.ts";

// Separate from recall-webhook: Recall delivers per-bot transcript.data via
// the per-session realtime_endpoints token, but bot STATUS events
// (call_ended / done / fatal — "the meeting is over / the bot left") are a
// project-wide webhook configured once in the Recall dashboard, not
// per-bot. This is what lets a meeting session auto-finalize (flip to
// "processing" so the board's wrap-up pass runs) without the user having to
// remember to click "End session" — Recall already auto-leaves the call
// within seconds of every participant leaving; this is just us finding out.
//
// One-time manual setup required (can't be done via API): in the Recall
// dashboard's Webhooks tab, add an endpoint pointing at
// https://tackly.co/functions/recall-status-webhook, subscribed to at least
// bot.call_ended and bot.fatal. Verified with the single workspace
// verification secret (RECALL_VERIF_SECRET) from the dashboard's API keys
// page — the same secret also verifies recall-webhook's transcript.data.

const END_EVENTS = new Set(["bot.call_ended", "bot.fatal"]);

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get("RECALL_VERIF_SECRET");
    if (!secret) {
      return Response.json({ error: "RECALL_VERIF_SECRET is not configured" }, { status: 500 });
    }

    const body = await req.text();
    const valid = await verifyRecallSignature(secret, req, body);
    if (!valid) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(body);
    if (!END_EVENTS.has(payload?.event)) {
      return Response.json({ ok: true, ignored: payload?.event });
    }

    const botId = payload?.data?.bot?.id;
    if (!botId) {
      return Response.json({ ok: true, ignored: "no bot id" });
    }

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const sessions = await db.Session.filter({ bot_id: botId }, "-created_date", 1);
    const session = sessions[0];
    // Already ended (manual "End session", or a duplicate/retried delivery) — no-op.
    if (!session || session.status !== "active") {
      return Response.json({ ok: true });
    }

    await db.Session.update(session.id, {
      status: "processing",
      ended_at: new Date().toISOString(),
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
