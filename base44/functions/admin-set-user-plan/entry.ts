import { createClientFromRequest } from "npm:@base44/sdk";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller || caller.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const { user_id, plan_id } = await req.json();
    if (!user_id) {
      return Response.json({ error: "user_id is required" }, { status: 400 });
    }

    await base44.asServiceRole.entities.User.update(user_id, { plan_id: plan_id || "" });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
