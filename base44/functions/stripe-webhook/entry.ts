import { createClientFromRequest } from "npm:@base44/sdk";
import { verifyStripeSignature } from "../../shared/stripeVerify.ts";

// Keeps User.plan_id / stripe_subscription_id in sync with the real
// subscription state in Stripe — the source of truth for what a user is
// actually paying for. One-time manual setup (can't be done via API): in
// the Stripe dashboard's Webhooks tab, add an endpoint at
// https://tackly.co/functions/stripe-webhook subscribed to at least
// checkout.session.completed, customer.subscription.updated, and
// customer.subscription.deleted — then paste the signing secret it gives
// you into the STRIPE_WEBHOOK_SECRET secret.
const RELEVANT_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!secret) {
      return Response.json({ error: "STRIPE_WEBHOOK_SECRET is not configured" }, { status: 500 });
    }

    const body = await req.text();
    const valid = await verifyStripeSignature(secret, req, body);
    if (!valid) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(body);
    if (!RELEVANT_EVENTS.has(event.type)) {
      return Response.json({ ok: true, ignored: event.type });
    }

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    // deno-lint-ignore no-explicit-any
    const obj: any = event.data.object;

    const findUser = async (userId?: string, customerId?: string) => {
      if (userId) {
        const u = await db.User.get(userId).catch(() => null);
        if (u) return u;
      }
      if (customerId) {
        const matches = await db.User.filter(
          { stripe_customer_id: customerId },
          "-created_date",
          1,
        );
        if (matches[0]) return matches[0];
      }
      return null;
    };

    if (event.type === "checkout.session.completed") {
      const userId = obj.client_reference_id || obj.metadata?.user_id;
      const planId = obj.metadata?.plan_id;
      const user = await findUser(userId, obj.customer);
      if (!user) return Response.json({ ok: true, ignored: "no matching user" });

      await db.User.update(user.id, {
        stripe_customer_id: obj.customer,
        stripe_subscription_id: obj.subscription,
        plan_id: planId || user.plan_id,
      });
    } else if (event.type === "customer.subscription.updated") {
      const user = await findUser(obj.metadata?.user_id, obj.customer);
      if (!user) return Response.json({ ok: true, ignored: "no matching user" });

      if (obj.status === "active" || obj.status === "trialing") {
        await db.User.update(user.id, {
          stripe_subscription_id: obj.id,
          plan_id: obj.metadata?.plan_id || user.plan_id,
        });
      } else if (obj.status === "canceled" || obj.status === "unpaid") {
        await db.User.update(user.id, { plan_id: "" });
      }
    } else if (event.type === "customer.subscription.deleted") {
      const user = await findUser(obj.metadata?.user_id, obj.customer);
      if (!user) return Response.json({ ok: true, ignored: "no matching user" });

      await db.User.update(user.id, { plan_id: "", stripe_subscription_id: "" });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
