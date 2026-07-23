// Verifies Recall.ai webhook/websocket deliveries using the single workspace
// verification secret (dashboard -> API keys page). Recall signs ALL webhook
// traffic this way — both the per-bot realtime_endpoints (transcript.data)
// and the dashboard-registered bot status-change webhooks — using the
// Standard Webhooks spec (same algorithm Svix implements): headers
// webhook-id / webhook-timestamp / webhook-signature, HMAC-SHA256 over
// "<id>.<timestamp>.<body>", secret prefixed "whsec_".
// Tolerates URL-safe base64 (- / _ instead of + /) and missing padding —
// a raw `atob()` on the secret threw "invalid base64-encoded data" in
// production even though the secret looked fine, which silently crashed
// the whole handler before this was wrapped in try/catch upstream.
function toStandardBase64(s: string): string {
  let out = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = out.length % 4;
  if (pad === 2) out += "==";
  else if (pad === 3) out += "=";
  return out;
}

export async function verifyRecallSignature(
  secret: string,
  req: Request,
  body: string,
): Promise<boolean> {
  const msgId = req.headers.get("webhook-id");
  const msgTimestamp = req.headers.get("webhook-timestamp");
  const signatureHeader = req.headers.get("webhook-signature");
  if (!msgId || !msgTimestamp || !signatureHeader) return false;

  const trimmed = secret.trim();
  const secretBytes = trimmed.startsWith("whsec_")
    ? Uint8Array.from(atob(toStandardBase64(trimmed.slice("whsec_".length))), (c) =>
        c.charCodeAt(0),
      )
    : new TextEncoder().encode(trimmed);

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

  // The signature header can carry multiple space-separated "v1,<base64>" values
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
