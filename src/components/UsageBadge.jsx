import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// Reads the same quota check the session-creation flow already gates on
// (check-quota), just to display it rather than enforce it — so the number
// shown here can never drift from what actually blocks a new session.
// check-quota itself now counts an in-progress session's live utterance span
// (not just billed_ms, which is only finalized when a session completes), so
// polling here is what makes that visible without a manual page reload.
export function useQuota() {
  const [quota, setQuota] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      base44.functions
        .invoke("check-quota", { session_type: "personal" })
        .then((res) => !cancelled && setQuota(res.data))
        .catch(() => {});
    load();
    const interval = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return quota;
}

export function UsageBadge({ variant = "compact" }) {
  const quota = useQuota();
  if (!quota || quota.error) return null;

  const unlimited = !quota.limit_minutes;
  const pct = unlimited
    ? 0
    : Math.min(100, Math.round((quota.used_minutes / quota.limit_minutes) * 100));
  const tight = !unlimited && pct >= 80;

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2.5 text-xs text-ink-faint">
        <span>
          {unlimited
            ? `${quota.plan_name} · unlimited`
            : `${quota.used_minutes}/${quota.limit_minutes} min this month`}
        </span>
        {!unlimited && (
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-paper-sunken">
            <span
              className={`block h-full rounded-full ${tight ? "bg-note-coral-edge" : "bg-periwinkle"}`}
              style={{ width: `${pct}%` }}
            />
          </span>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">{quota.plan_name} plan</p>
        <p className="text-sm text-ink-soft">
          {unlimited ? "Unlimited" : `${quota.used_minutes} / ${quota.limit_minutes} min`}
        </p>
      </div>
      {!unlimited && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-sunken">
          <div
            className={`h-full rounded-full transition-all ${tight ? "bg-note-coral-edge" : "bg-periwinkle"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <p className="mt-2 text-xs text-ink-faint">
        {unlimited
          ? "No monthly minute cap on this plan."
          : tight
            ? "Getting close to your monthly limit — upgrade for more."
            : "Minutes reset at the start of each calendar month."}
      </p>
    </div>
  );
}
