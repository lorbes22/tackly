import { createClientFromRequest } from "npm:@base44/sdk";
import { stripeRequest } from "../../shared/stripeApi.ts";

// Creates a Stripe Checkout Session so the caller can subscribe to a paid
// Plan. Plans are matched to Stripe Prices via Plan.stripe_price_id (set by
// an admin after creating the corresponding recurring Price in the Stripe
// dashboard) — a plan with no stripe_price_id can't be checked out into yet.
// stripe-webhook is what actually flips User.plan_id once payment completes;
// this function only ever hands back a redirect URL.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!secretKey) {
      return Response.json({ error: "STRIPE_SECRET_KEY is not configured" }, { status: 500 });
    }

    const { plan_id } = await req.json();
    if (!plan_id) {
      return Response.json({ error: "plan_id is required" }, { status: 400 });
    }

    const plan = await base44.entities.Plan.get(plan_id).catch(() => null);
    if (!plan || !plan.stripe_price_id) {
      return Response.json(
        { error: "That plan isn't set up for checkout yet" },
        { status: 400 },
      );
    }

    const db = base44.asServiceRole.entities;
    let customerId: string | undefined = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripeRequest(secretKey, "POST", "/customers", {
        email: user.email,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await db.User.update(user.id, { stripe_customer_id: customerId });
    }

    const origin = req.headers.get("origin") || "https://tackly.co";
    const session = await stripeRequest(secretKey, "POST", "/checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      success_url: `${origin}/app/settings?checkout=success`,
      cancel_url: `${origin}/app/settings?checkout=cancel`,
      subscription_data: { metadata: { user_id: user.id, plan_id } },
      metadata: { user_id: user.id, plan_id },
    });

    return Response.json({ url: session.url });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
