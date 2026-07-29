import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useQuota } from "@/components/UsageBadge";

const THRESHOLD_PCT = 50;

// Shown once per calendar month, the first time a user's check-quota poll
// (UsageBadge.jsx's useQuota, already running app-wide) crosses the halfway
// point of their monthly minute quota. Mounted both in AppLayout (covers
// Home/New/Search/Settings) and Board.jsx (covers an active live session,
// where minutes are actually being spent) so it fires wherever the user
// happens to be when they cross the line, not just on next page load.
export function QuotaWarningModal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const quota = useQuota();
  const [dismissed, setDismissed] = useState(false);

  const unlimited = !quota || !quota.limit_minutes || quota.error;
  const pct = unlimited ? 0 : Math.round((quota.used_minutes / quota.limit_minutes) * 100);
  const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
  const seenKey = user ? `tackly:quota-warning-seen:${user.id}:${monthKey}` : null;
  const alreadySeen = seenKey ? !!localStorage.getItem(seenKey) : true;

  const show = !unlimited && pct >= THRESHOLD_PCT && !alreadySeen && !dismissed;

  useEffect(() => {
    if (!show || !seenKey) return;
    localStorage.setItem(seenKey, "1");
    base44.entities.UsageEvent.create({
      user_id: user?.id,
      event_type: "quota_warning_shown",
      meta: { plan_name: quota.plan_name, used_minutes: quota.used_minutes, limit_minutes: quota.limit_minutes },
    }).catch(() => {});
    // Only fires once — localStorage write above prevents this effect's own
    // re-render from re-triggering it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="relative w-full max-w-sm rounded-2xl border-2 border-ink bg-paper-raised p-6 text-center shadow-brutal animate-fade-up">
        <button
          onClick={() => setDismissed(true)}
          className="absolute right-4 top-4 text-ink-faint hover:text-ink"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-periwinkle-tint">
          <Sparkles className="h-5 w-5 text-periwinkle-deep" />
        </div>
        <p className="mt-3 font-display text-xl font-bold text-ink">Halfway through your minutes 👀</p>
        <p className="mt-2 text-sm text-ink-soft">
          You've used {quota.used_minutes} of your {quota.limit_minutes} free minutes this month on the{" "}
          {quota.plan_name} plan. Upgrade any time for more room to ramble.
        </p>
        <button
          onClick={() => {
            setDismissed(true);
            navigate("/app/settings");
          }}
          className="mt-5 h-10 w-full rounded-xl border-2 border-ink bg-periwinkle font-display text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5"
        >
          See upgrade options
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="mt-2 h-9 w-full rounded-xl text-sm font-medium text-ink-soft hover:text-ink"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
