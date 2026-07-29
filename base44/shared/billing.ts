// Shared quota/billing helpers. Minutes are tracked as milliseconds derived
// from Utterance timestamps (see computeBilledMs) — the same metric for
// mic/bot/import capture, so quota enforcement doesn't care how the
// transcript arrived. No separate usage-ledger entity: monthly usage is
// summed directly off Session.billed_ms, the source of truth, each time it's
// checked — nothing to keep in sync or reset on a schedule.

// deno-lint-ignore no-explicit-any
type Base44Client = any;

export type EffectivePlan = {
  id: string | null;
  name: string;
  minute_limit: number; // minutes/month, 0 = unlimited
  allows_meetings: boolean;
};

// No Plan record needs to exist for Free — this is the fallback whenever a
// user has no plan_id, or their plan_id doesn't resolve to a real Plan. This
// is the common case: most free users never get a plan_id written at all, so
// this constant (not the "Free" Plan row's own allows_meetings field) is what
// actually gates their access day to day — the two must be kept in sync.
export const FREE_PLAN: EffectivePlan = {
  id: null,
  name: "Free",
  minute_limit: 30,
  allows_meetings: true,
};

export async function getEffectivePlan(
  base44: Base44Client,
  user: { plan_id?: string },
): Promise<EffectivePlan> {
  if (!user.plan_id) return FREE_PLAN;
  const plan = await base44.entities.Plan.get(user.plan_id).catch(() => null);
  if (!plan) return FREE_PLAN;
  return {
    id: plan.id,
    name: plan.name,
    minute_limit: typeof plan.minute_limit === "number" ? plan.minute_limit : 0,
    allows_meetings: plan.allows_meetings !== false,
  };
}

// Sum this user's own billed_ms across sessions started in the current
// calendar month. Runs with the caller's own client — RLS already scopes
// Session reads to the owner, so no explicit owner filter is needed.
// Sessions still "active" haven't had billed_ms finalized yet (that only
// happens once, at completion — see process-session's finalizeBilledMs), so
// without this they'd count as zero usage for as long as they stay open,
// letting a never-ended session dodge quota entirely. Their live span is
// computed the same way (computeBilledMs over their utterances) instead.
export async function getUsedMsThisMonth(
  base44: Base44Client,
): Promise<number> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sessions = await base44.entities.Session.filter(
    {},
    "-started_at",
    500,
  );
  const thisMonth = sessions.filter((s: { started_at?: string }) => {
    if (!s.started_at) return false;
    return new Date(s.started_at) >= periodStart;
  });

  // billed_ms is only finalized at the "processing" → "complete" transition
  // (see process-session's finalizeBilledMs) — "active" and "processing"
  // sessions both need their span computed live instead.
  const finished = thisMonth.filter(
    (s: { status?: string }) => s.status === "complete",
  );
  const active = thisMonth.filter(
    (s: { status?: string }) => s.status !== "complete",
  );

  const finishedMs = finished.reduce(
    (sum: number, s: { billed_ms?: number }) => sum + (s.billed_ms || 0),
    0,
  );

  const activeMs = (
    await Promise.all(
      active.map(async (s: { id: string }) => {
        const utterances = await base44.entities.Utterance.filter(
          { session_id: s.id },
          "start_ms",
          5000,
        );
        return computeBilledMs(utterances);
      }),
    )
  ).reduce((sum: number, ms: number) => sum + ms, 0);

  return finishedMs + activeMs;
}

export type QuotaCheck = {
  allowed: boolean;
  reason?: string;
  plan_name: string;
  used_minutes: number;
  limit_minutes: number; // 0 = unlimited
};

// The one gate every session-creation path (talk / bot / import) should call
// before creating a Session. sessionType is the product-level distinction
// ("meeting" covers both bot_live and a pasted meeting transcript) — not
// capture_source, so the free-tier meeting block can't be routed around by
// pasting a transcript instead of inviting the bot.
export async function checkQuota(
  base44: Base44Client,
  user: { plan_id?: string },
  sessionType: "personal" | "meeting",
): Promise<QuotaCheck> {
  const plan = await getEffectivePlan(base44, user);
  const usedMs = await getUsedMsThisMonth(base44);
  const usedMinutes = Math.round(usedMs / 60000);

  if (sessionType === "meeting" && !plan.allows_meetings) {
    return {
      allowed: false,
      reason: `Meetings aren't available on the ${plan.name} plan — upgrade to use the meeting bot or import a meeting transcript.`,
      plan_name: plan.name,
      used_minutes: usedMinutes,
      limit_minutes: plan.minute_limit,
    };
  }

  if (plan.minute_limit > 0 && usedMinutes >= plan.minute_limit) {
    return {
      allowed: false,
      reason: `You've used all ${plan.minute_limit} free minutes this month — upgrade for more.`,
      plan_name: plan.name,
      used_minutes: usedMinutes,
      limit_minutes: plan.minute_limit,
    };
  }

  return {
    allowed: true,
    plan_name: plan.name,
    used_minutes: usedMinutes,
    limit_minutes: plan.minute_limit,
  };
}

// Called once, at the point a session transitions to "complete" — the span
// of utterance timestamps, same formula regardless of capture source. For
// live capture (mic/bot) these are real STT timings; for pasted transcripts
// parseTranscript() assigns synthetic 1s-per-line timestamps, so imports bill
// at a rough ~1s/utterance proxy rather than true reading/speaking time. Good
// enough to gate quota; not claimed to be precise.
export function computeBilledMs(
  utterances: { start_ms?: number; end_ms?: number }[],
): number {
  if (utterances.length === 0) return 0;
  const starts = utterances.map((u) => u.start_ms ?? 0);
  const ends = utterances.map((u) => u.end_ms ?? u.start_ms ?? 0);
  const span = Math.max(...ends) - Math.min(...starts);
  return Math.max(0, span);
}
