// Minimal Stripe REST client — raw fetch + x-www-form-urlencoded encoding
// (Stripe's API takes form params, not JSON), the same "call the third-party
// API directly, no vendor SDK" convention this project already uses for
// Recall. Nested objects/arrays use Stripe's bracket notation, e.g.
// line_items[0][price]=price_123&metadata[user_id]=abc.
const STRIPE_API = "https://api.stripe.com/v1";

function flatten(params: Record<string, unknown>, prefix = ""): [string, string][] {
  const pairs: [string, string][] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item && typeof item === "object") {
          pairs.push(...flatten(item as Record<string, unknown>, `${fullKey}[${i}]`));
        } else {
          pairs.push([`${fullKey}[${i}]`, String(item)]);
        }
      });
    } else if (typeof value === "object") {
      pairs.push(...flatten(value as Record<string, unknown>, fullKey));
    } else {
      pairs.push([fullKey, String(value)]);
    }
  }
  return pairs;
}

export async function stripeRequest(
  secretKey: string,
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>,
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  const encoded = params ? new URLSearchParams(flatten(params)) : null;
  const url = method === "GET" && encoded ? `${STRIPE_API}${path}?${encoded}` : `${STRIPE_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "POST" && encoded ? encoded : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || `Stripe API error (${res.status})`);
  }
  return json;
}
