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
    // accumulates across a session's whole life, it's just the denominator
    // (billed minutes) that needs status === "complete".
    //
    // Sessions from before cost tracking existed have llm_cost_usd stuck at
    // its default of 0 but still have a real billed_ms — folding those into
    // the denominator here would silently drag avg_cost_per_minute_usd down
    // (real cost / inflated minutes). Gated on llm_cost_usd > 0 so only
    // sessions that were actually measured count toward the average — this
    // is effectively "start the average from when tracking began" without
    // needing a hardcoded cutoff date.
    let costUsd = 0;
    let costTrackedMs = 0;
    let gatewayCredits = 0;
    let creditsTrackedMs = 0;

    for (const s of sessions) {
      if (s.capture_source && byCapture[s.capture_source] != null) {
        byCapture[s.capture_source]++;
      }
      if (s.status === "complete") {
        completed++;
        if (s.llm_cost_usd) {
          costUsd += s.llm_cost_usd;
          costTrackedMs += s.billed_ms || 0;
        }
        if (s.gateway_credits_used) {
          gatewayCredits += s.gateway_credits_used;
          creditsTrackedMs += s.billed_ms || 0;
        }
      }
      if (typeof s.rating === "number") {
        ratingSum += s.rating;
        ratingCount++;
        ratingBreakdown[s.rating] = (ratingBreakdown[s.rating] || 0) + 1;
      }
    }

    const costTrackedMinutes = costTrackedMs / 60000;
    const creditsTrackedMinutes = creditsTrackedMs / 60000;

    return Response.json({
      total_sessions: sessions.length,
      completed_sessions: completed,
      by_capture_source: byCapture,
      rating_count: ratingCount,
      avg_rating: ratingCount ? Number((ratingSum / ratingCount).toFixed(2)) : null,
      rating_breakdown: ratingBreakdown,
      total_llm_cost_usd: Number(costUsd.toFixed(4)),
      avg_cost_per_minute_usd: costTrackedMinutes > 0 ? Number((costUsd / costTrackedMinutes).toFixed(4)) : null,
      billed_minutes: Math.round(costTrackedMinutes),
      total_gateway_credits: Number(gatewayCredits.toFixed(2)),
      avg_gateway_credits_per_minute: creditsTrackedMinutes > 0 ? Number((gatewayCredits / creditsTrackedMinutes).toFixed(2)) : null,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
