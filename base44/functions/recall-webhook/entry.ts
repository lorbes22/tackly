import { createClientFromRequest } from "npm:@base44/sdk";

// Ingests Recall real-time transcript events into utterances.
// The caller (Recall's servers) is unauthenticated, so events are verified
// by resolving the payload's bot id — a Recall-generated unguessable id
// stored on exactly one session — and, when the endpoint metadata we
// registered is echoed back, cross-checking its token against the session's
// webhook_token. Rows are written via service role with owner_email set so
// RLS still lets the session owner read them. Classification itself runs in
// user context from the open board, same as every other capture source.
Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    if (payload?.event !== "transcript.data") {
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
      return Response.json({ error: "Unknown bot" }, { status: 401 });
    }

    const echoedToken = payload?.data?.realtime_endpoint?.metadata?.token;
    if (echoedToken && echoedToken !== session.webhook_token) {
      return Response.json({ error: "Bad token" }, { status: 401 });
    }

    const data = payload?.data?.data;
    const words = data?.words ?? [];
    const text = words.map((w: { text: string }) => w.text).join(" ").trim();
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
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
