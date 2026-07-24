import { createClientFromRequest } from "npm:@base44/sdk";
import { stripeRequest } from "../../shared/stripeApi.ts";

// Lets an already-subscribed user manage or cancel their subscription via
// Stripe's own hosted Billing Portal, rather than building cancel/upgrade
// UI ourselves — stripe-webhook picks up whatever they change there.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user.stripe_customer_id) {
      return Response.json({ error: "No billing account yet" }, { status: 400 });
    }

    const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!secretKey) {
      return Response.json({ error: "STRIPE_SECRET_KEY is not configured" }, { status: 500 });
    }

    const origin = req.headers.get("origin") || "https://tackly.co";
    const session = await stripeRequest(secretKey, "POST", "/billing_portal/sessions", {
      customer: user.stripe_customer_id,
      return_url: `${origin}/app/settings`,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
