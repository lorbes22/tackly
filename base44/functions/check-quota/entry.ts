import { createClientFromRequest } from "npm:@base44/sdk";
import { checkQuota } from "../../shared/billing.ts";

// Pre-flight quota check the frontend calls before creating a session
// (talk / bot / import) so a blocked user sees a clear reason before any
// Session row (or Recall bot) gets created. Soft enforcement only — the
// real cost backstop is process-session refusing to keep classifying past
// quota (PLAN.md-style defense in depth, not a single choke point).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { session_type } = await req.json();
    if (session_type !== "personal" && session_type !== "meeting") {
      return Response.json(
        { error: "session_type must be 'personal' or 'meeting'" },
        { status: 400 },
      );
    }

    const result = await checkQuota(base44, user, session_type);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
