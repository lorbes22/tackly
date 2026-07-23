// Thin wrapper over Resend's REST API. Separate from Base44's own OTP/reset
// emails (not customizable) — this covers emails Tackly triggers itself.
const FROM = "Tackly <noreply@app.tackly.co>";

export async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend send failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json();
}
