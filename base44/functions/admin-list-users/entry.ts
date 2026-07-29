import { createClientFromRequest } from "npm:@base44/sdk";

// User is a reserved entity — its own RLS blocks (base44/entities/user.jsonc)
// don't cover list/read of OTHER users' records, only the platform owner's
// CLI session can list directly. Admins go through service role instead,
// gated by this function checking the caller's own app-level role first.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const users = await base44.asServiceRole.entities.User.list("-created_date", 500);
    return Response.json({
      users: users.map((u: Record<string, unknown>) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        plan_id: u.plan_id,
        created_date: u.created_date,
      })),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
