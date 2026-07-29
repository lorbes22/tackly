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
    // LLM cost/minute (PLAN.md §1d): only completed sessions, since billed_ms
    // is only finalized at completion — an in-progress session's cost so far
    // would understate its eventual per-minute rate. llm_cost_usd itself
    // accumulates across a session's whole life (all three call sites), it's
    // just the denominator (billed minutes) that needs status === "complete".
    let costUsd = 0;
    let billedMs = 0;
    // sessions is already sorted -created_date, so entries land in the same
    // newest-first order without a separate sort here.
    const feedbackEntries: Record<string, unknown>[] = [];

    for (const s of sessions) {
      if (s.capture_source && byCapture[s.capture_source] != null) {
        byCapture[s.capture_source]++;
      }
      if (s.status === "complete") {
        completed++;
        costUsd += s.llm_cost_usd || 0;
        billedMs += s.billed_ms || 0;
      }
      if (typeof s.rating === "number") {
        ratingSum += s.rating;
        ratingCount++;
        ratingBreakdown[s.rating] = (ratingBreakdown[s.rating] || 0) + 1;
      }
      if (typeof s.rating_feedback === "string" && s.rating_feedback.trim() && feedbackEntries.length < 100) {
        feedbackEntries.push({
          session_id: s.id,
          title: s.title,
          rating: s.rating ?? null,
          feedback: s.rating_feedback,
          owner_email: s.owner_email,
          created_date: s.created_date,
        });
      }
    }

    const billedMinutes = billedMs / 60000;

    return Response.json({
      total_sessions: sessions.length,
      completed_sessions: completed,
      by_capture_source: byCapture,
      rating_count: ratingCount,
      avg_rating: ratingCount ? Number((ratingSum / ratingCount).toFixed(2)) : null,
      rating_breakdown: ratingBreakdown,
      feedback_count: feedbackEntries.length,
      feedback_entries: feedbackEntries,
      total_llm_cost_usd: Number(costUsd.toFixed(4)),
      avg_cost_per_minute_usd: billedMinutes > 0 ? Number((costUsd / billedMinutes).toFixed(4)) : null,
      billed_minutes: Math.round(billedMinutes),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
