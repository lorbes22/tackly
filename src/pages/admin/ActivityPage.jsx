import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Bell, Lock } from "lucide-react";

const RELEVANT_TYPES = ["paywall_shown", "quota_warning_shown", "plan_limit_hit"];

const TYPE_META = {
  paywall_shown: {
    label: "Paywall shown",
    hint: "Blocked at session creation — quota exhausted or a meeting on a plan that doesn't allow it.",
    icon: Lock,
    className: "bg-note-coral text-ink",
  },
  quota_warning_shown: {
    label: "Quota warning shown",
    hint: "The halfway-through-minutes upgrade popup.",
    icon: Bell,
    className: "bg-note-amber text-ink",
  },
  plan_limit_hit: {
    label: "Plan limit hit mid-session",
    hint: "Quota ran out during an already-active session — classification paused.",
    icon: AlertTriangle,
    className: "bg-note-coral text-ink",
  },
};

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function describe(event) {
  const meta = event.meta || {};
  if (event.event_type === "paywall_shown") {
    return meta.reason || `Blocked starting a ${meta.session_type || ""} session.`;
  }
  if (event.event_type === "quota_warning_shown") {
    return `${meta.used_minutes ?? "?"}/${meta.limit_minutes ?? "?"} min used on ${meta.plan_name || "their plan"}.`;
  }
  if (event.event_type === "plan_limit_hit") {
    return meta.reason || "Quota exceeded mid-session.";
  }
  return "";
}

export default function ActivityPage() {
  const [events, setEvents] = useState(null);
  const [users, setUsers] = useState({});
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    base44.entities.UsageEvent.list("-created_date", 300)
      .then((rows) => !cancelled && setEvents(rows.filter((e) => RELEVANT_TYPES.includes(e.event_type))))
      .catch((err) => !cancelled && setError(err.message));
    base44.functions
      .invoke("admin-list-users", {})
      .then((res) => {
        if (cancelled) return;
        const map = {};
        for (const u of res.data?.users || []) map[u.id] = u.email;
        setUsers(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = events?.filter((e) => filter === "all" || e.event_type === filter) || [];

  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-periwinkle-tint">
          <Bell className="h-5 w-5 text-periwinkle-deep" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Activity</h1>
          <p className="text-ink-soft">
            Every upgrade popup, paywall block, and quota-limit hit shown to a real user.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`h-8 rounded-full border-2 border-ink px-3 text-xs font-bold transition-colors ${
            filter === "all" ? "bg-ink text-paper" : "bg-paper-raised text-ink"
          }`}
        >
          All
        </button>
        {RELEVANT_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`h-8 rounded-full border-2 border-ink px-3 text-xs font-bold transition-colors ${
              filter === type ? "bg-ink text-paper" : "bg-paper-raised text-ink"
            }`}
          >
            {TYPE_META[type].label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-note-coral px-3 py-2 text-sm text-ink" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {events === null && !error ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-periwinkle" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line py-14 text-center">
            <p className="font-medium text-ink">Nothing to show yet</p>
            <p className="mt-1 text-sm text-ink-soft">
              Paywall blocks and quota warnings shown to users will show up here.
            </p>
          </div>
        ) : (
          filtered.map((event) => {
            const meta = TYPE_META[event.event_type];
            const Icon = meta.icon;
            return (
              <div
                key={event.id}
                className="flex items-start gap-3 rounded-xl border border-line bg-paper-raised p-3.5 shadow-note"
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.className}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-ink">{meta.label}</p>
                    <span className="text-xs text-ink-faint">·</span>
                    <p className="text-xs text-ink-faint">
                      {users[event.user_id] || event.user_id || "unknown user"}
                    </p>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-soft">{describe(event)}</p>
                </div>
                <p className="shrink-0 text-xs text-ink-faint">{formatDate(event.created_date)}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
