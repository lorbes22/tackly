import { createClientFromRequest } from "npm:@base44/sdk";

// Admin-only: session counts + rating rollup across ALL users. Session RLS
// is owner-scoped, so this has to go through service role like the other
// admin-* functions.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller || caller.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const db = base44.asServiceRole.entities;
    const sessions = await db.Session.list("-created_date", 5000);

    const byCapture = { mic_live: 0, bot_live: 0, import: 0 };
    let completed = 0;
    let ratingSum = 0;
    let ratingCount = 0;
    const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    for (const s of sessions) {
      if (s.capture_source && byCapture[s.capture_source] != null) {
        byCapture[s.capture_source]++;
      }
      if (s.status === "complete") completed++;
      if (typeof s.rating === "number") {
        ratingSum += s.rating;
        ratingCount++;
        ratingBreakdown[s.rating] = (ratingBreakdown[s.rating] || 0) + 1;
      }
    }

    return Response.json({
      total_sessions: sessions.length,
      completed_sessions: completed,
      by_capture_source: byCapture,
      rating_count: ratingCount,
      avg_rating: ratingCount ? Number((ratingSum / ratingCount).toFixed(2)) : null,
      rating_breakdown: ratingBreakdown,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
