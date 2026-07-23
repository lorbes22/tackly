import { createClientFromRequest } from "npm:@base44/sdk";

// Admin-only diagnostic: recent meeting sessions + utterance counts,
// for debugging the Recall webhook pipeline without needing browser access
// to the account that created the session.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller || caller.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const db = base44.asServiceRole.entities;
    const sessions = await db.Session.filter({ type: "meeting" }, "-created_date", 15);

    const out = [];
    for (const s of sessions) {
      const utts = await db.Utterance.filter({ session_id: s.id });
      out.push({
        id: s.id,
        owner_email: s.owner_email,
        status: s.status,
        bot_id: s.bot_id,
        webhook_token: s.webhook_token,
        created_date: s.created_date,
        ended_at: s.ended_at,
        billed_ms: s.billed_ms,
        utterance_count: utts.length,
      });
    }

    return Response.json({ sessions: out });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
