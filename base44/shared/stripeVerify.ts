// Verifies Stripe webhook deliveries. The "Stripe-Signature" header carries
// t=<timestamp>,v1=<hex hmac>[,v1=<hex hmac> ...] — multiple v1 values show
// up during signing-secret rotation, any match is accepted. Signed content
// is "<timestamp>.<raw body>", HMAC-SHA256 with the endpoint's signing
// secret (whsec_...), hex-encoded. Deliveries older than 5 minutes are
// rejected as a replay-attack guard, per Stripe's own recommendation.
export async function verifyStripeSignature(
  secret: string,
  req: Request,
  body: string,
): Promise<boolean> {
  const header = req.headers.get("stripe-signature");
  if (!header) return false;

  let timestamp = "";
  const v1s: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t" && v) timestamp = v;
    else if (k === "v1" && v) v1s.push(v);
  }
  if (!timestamp || v1s.length === 0) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret.trim()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const expected = [...new Uint8Array(sigBuf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return v1s.some((sig) => {
    if (sig.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}
