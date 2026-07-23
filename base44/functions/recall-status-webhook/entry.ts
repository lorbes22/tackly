import { createClientFromRequest } from "npm:@base44/sdk";

// Separate from recall-webhook: Recall delivers per-bot transcript.data via
// the per-session realtime_endpoints token, but bot STATUS events
// (call_ended / done / fatal — "the meeting is over / the bot left") are a
// project-wide Svix webhook configured once in the Recall dashboard, not
// per-bot. This is what lets a meeting session auto-finalize (flip to
// "processing" so the board's wrap-up pass runs) without the user having to
// remember to click "End session" — Recall already auto-leaves the call
// within seconds of every participant leaving; this is just us finding out.
//
// One-time manual setup required (can't be done via API): in the Recall
// dashboard's Webhooks tab, add an endpoint pointing at this function's URL,
// then `npx base44 secrets set RECALL_STATUS_WEBHOOK_SECRET=<the secret Recall shows>`.

async function verifySvixSignature(
  secret: string,
  msgId: string,
  msgTimestamp: string,
  body: string,
  signatureHeader: string,
): Promise<boolean> {
  const secretBytes = secret.startsWith("whsec_")
    ? Uint8Array.from(atob(secret.slice("whsec_".length)), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(secret);

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const toSign = `${msgId}.${msgTimestamp}.${body}`;
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  // svix-signature can carry multiple space-separated "v1,<base64>" values
  const candidates = signatureHeader
    .split(" ")
    .map((s) => s.split(",")[1])
    .filter(Boolean);

  return candidates.some((sig) => {
    if (sig.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

const END_EVENTS = new Set(["bot.call_ended", "bot.fatal"]);

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get("RECALL_STATUS_WEBHOOK_SECRET");
    if (!secret) {
      return Response.json({ error: "RECALL_STATUS_WEBHOOK_SECRET is not configured" }, { status: 500 });
    }

    const msgId = req.headers.get("svix-id");
    const msgTimestamp = req.headers.get("svix-timestamp");
    const msgSignature = req.headers.get("svix-signature");
    const body = await req.text();
    if (!msgId || !msgTimestamp || !msgSignature) {
      return Response.json({ error: "Missing svix headers" }, { status: 401 });
    }
    const valid = await verifySvixSignature(secret, msgId, msgTimestamp, body, msgSignature);
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
