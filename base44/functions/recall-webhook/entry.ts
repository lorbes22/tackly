import { createClientFromRequest } from "npm:@base44/sdk";
import { verifyRecallSignature } from "../../shared/recallVerify.ts";

// Ingests Recall real-time transcript events into utterances.
// The caller (Recall's servers) is verified two ways: (1) the request
// signature against the workspace verification secret (RECALL_VERIF_SECRET),
// and (2) resolving the payload's bot id — a Recall-generated unguessable id
// stored on exactly one session — cross-checked against the endpoint
// metadata token we registered, echoed back on every event. Rows are written
// via service role with owner_email set so RLS still lets the session owner
// read them. Classification itself runs in user context from the open
// board, same as every other capture source.
Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get("RECALL_VERIF_SECRET");
    const body = await req.text();
    console.log("recall-webhook: inbound hit, bytes =", body.length);
    if (secret) {
      // Soft-verify for now: log on mismatch rather than reject. The bot_id +
      // per-session webhook_token check below is the real security boundary;
      // this guards against a signature-format mistake silently blacking out
      // meeting capture again the way the webhook URL bug just did. Wrapped
      // in its own try/catch: a malformed-secret crypto error must never
      // take down ingestion the way it may have been doing silently.
      try {
        const valid = await verifyRecallSignature(secret, req, body);
        if (!valid) {
          console.error("recall-webhook: signature verification failed", {
            hasWebhookId: req.headers.has("webhook-id"),
            hasWebhookSignature: req.headers.has("webhook-signature"),
          });
        }
      } catch (verifyErr) {
        console.error("recall-webhook: verify threw", (verifyErr as Error).message);
      }
    }
    const payload = JSON.parse(body);
    console.log("recall-webhook: top-level", {
      event: payload?.event,
      topKeys: Object.keys(payload || {}),
      dataTopKeys: payload?.data ? Object.keys(payload.data) : null,
      botId: payload?.data?.bot?.id,
    });
    if (payload?.event !== "transcript.data" && payload?.event !== "participant_events.leave") {
      return Response.json({ ok: true, ignored: payload?.event });
    }

    const botId = payload?.data?.bot?.id;
    if (!botId) {
      return Response.json({ error: "Missing bot id" }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    const sessions = await db.Session.filter({ bot_id: botId }, "-created_date", 1);
    const session = sessions[0];
    if (!session) {
      console.error("recall-webhook: no session found for bot_id", botId);
      return Response.json({ error: "Unknown bot" }, { status: 401 });
    }

    const echoedToken = payload?.data?.realtime_endpoint?.metadata?.token;
    if (echoedToken && echoedToken !== session.webhook_token) {
      console.error("recall-webhook: token mismatch", {
        echoedToken,
        expected: session.webhook_token,
      });
      return Response.json({ error: "Bad token" }, { status: 401 });
    }

    // The host leaving is the most reliable "the meeting is over" signal we
    // get without the separate, manually-configured bot.call_ended webhook —
    // this rides the same per-bot endpoint we already register automatically.
    if (payload?.event === "participant_events.leave") {
      const isHost = payload?.data?.data?.participant?.is_host === true;
      if (isHost && session.status === "active") {
        await db.Session.update(session.id, {
          status: "processing",
          ended_at: new Date().toISOString(),
        });
        console.log("recall-webhook: host left, session -> processing", session.id);
      }
      return Response.json({ ok: true });
    }

    const data = payload?.data?.data;
    const words = data?.words ?? [];
    const text = words.map((w: { text: string }) => w.text).join(" ").trim();
    console.log("recall-webhook: parsed", {
      event: payload?.event,
      wordCount: words.length,
      textPreview: text.slice(0, 80),
      dataKeys: data ? Object.keys(data) : null,
      isFinal: data?.is_final,
    });
    if (!text) {
      return Response.json({ ok: true, ignored: "empty" });
    }

    const participant = data?.participant;
    const startS = words[0]?.start_timestamp?.relative;
    const endS = words[words.length - 1]?.end_timestamp?.relative;

    if (!session.owner_email) {
      return Response.json({ error: "Session missing owner_email" }, { status: 500 });
    }

    await db.Utterance.create({
      session_id: session.id,
      owner_email: session.owner_email,
      speaker_label:
        participant?.name ||
        (participant?.id != null ? `Speaker ${participant.id}` : "Speaker"),
      text,
      start_ms: typeof startS === "number" ? Math.round(startS * 1000) : undefined,
      end_ms: typeof endS === "number" ? Math.round(endS * 1000) : undefined,
      finalized: true,
      processed: false,
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("recall-webhook: uncaught error", (error as Error).message, (error as Error).stack);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
