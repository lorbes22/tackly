import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Activity, DollarSign, MessageSquare, Star, StickyNote, UserPlus } from "lucide-react";

const FEEDBACK_PAGE_SIZE = 15;
const FEEDBACK_PREVIEW_COUNT = 5;

function StatTile({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-2xl border border-line bg-paper-raised p-5 shadow-note">
      <div className="flex items-center gap-2 text-ink-soft">
        <Icon className="h-4 w-4" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="mt-2 font-display text-3xl font-bold text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function FeedbackRow({ entry }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink">{entry.title || "Untitled session"}</p>
        <div className="flex items-center gap-2">
          {entry.rating != null && (
            <span className="flex items-center gap-1 text-xs font-medium text-note-gold-edge">
              <Star className="h-3 w-3 fill-current" />
              {entry.rating}/5
            </span>
          )}
          <span className="text-xs text-ink-faint">{formatDate(entry.created_date)}</span>
        </div>
      </div>
      <p className="mt-1.5 text-sm text-ink-soft">{entry.feedback}</p>
      {entry.owner_email && <p className="mt-1 text-xs text-ink-faint">{entry.owner_email}</p>}
    </div>
  );
}

export default function Overview() {
  const [events, setEvents] = useState(null);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState(null);
  const [showAllFeedback, setShowAllFeedback] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(FEEDBACK_PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await base44.entities.UsageEvent.list("-created_date", 200);
        if (!cancelled) setEvents(data);
      } catch {
        if (!cancelled) setEvents([]);
      }
    })();
    base44.functions
      .invoke("admin-session-stats", {})
      .then((res) => !cancelled && setStats(res.data))
      .catch(() => !cancelled && setStats(null));
    base44.functions
      .invoke("admin-list-users", {})
      .then((res) => !cancelled && setUsers(res.data?.users || []))
      .catch(() => !cancelled && setUsers(null));
    return () => {
      cancelled = true;
    };
  }, []);

  const count = (type) =>
    events === null ? "—" : events.filter((e) => e.event_type === type).length;

  const signupsThisMonth = useMemo(() => {
    if (!users) return null;
    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);
    return users.filter((u) => u.created_date && new Date(u.created_date) >= periodStart).length;
  }, [users]);

  const feedback = stats?.feedback_entries || [];
  const visibleFeedback = showAllFeedback ? feedback.slice(0, feedbackVisible) : feedback.slice(0, FEEDBACK_PREVIEW_COUNT);

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
        Overview
      </h1>
      <p className="mt-1 text-ink-soft">
        A read on how Tackly is doing, from usage events.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={UserPlus}
          label="Signups"
          value={users ? users.length : "—"}
          hint={users ? `${signupsThisMonth} this month` : "Loading…"}
        />
        <StatTile
          icon={Activity}
          label="Sessions started"
          value={count("session_started")}
          hint="From usage events"
        />
        <StatTile
          icon={StickyNote}
          label="Nodes created"
          value={count("node_created")}
          hint="From usage events"
        />
        <StatTile
          icon={DollarSign}
          label="MRR"
          value="$0"
          hint="Wired up with billing"
        />
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Activity}
          label="Sessions (all-time)"
          value={stats ? stats.total_sessions : "—"}
          hint={stats ? `${stats.completed_sessions} completed` : "Loading…"}
        />
        <StatTile
          icon={Activity}
          label="Meetings captured"
          value={stats ? stats.by_capture_source.bot_live : "—"}
          hint="capture_source = bot_live"
        />
        <StatTile
          icon={Star}
          label="Avg. rating"
          value={stats?.avg_rating != null ? `${stats.avg_rating} / 5` : "—"}
          hint={stats ? `${stats.rating_count} ratings given` : "Loading…"}
        />
        <StatTile
          icon={DollarSign}
          label="Avg. LLM cost / min"
          value={
            stats?.avg_cost_per_minute_usd != null
              ? `$${stats.avg_cost_per_minute_usd.toFixed(4)}`
              : "—"
          }
          hint={
            stats
              ? `$${stats.total_llm_cost_usd.toFixed(2)} across ${stats.billed_minutes} min (completed sessions) — estimated, see PLAN.md §10`
              : "Loading…"
          }
        />
      </div>

      {stats && stats.rating_count > 0 && (
        <div className="mt-4 rounded-2xl border border-line bg-paper-raised p-5 shadow-note">
          <p className="text-sm font-medium text-ink-soft">Rating breakdown</p>
          <div className="mt-3 space-y-1.5">
            {[5, 4, 3, 2, 1].map((n) => {
              const c = stats.rating_breakdown[n] || 0;
              const pct = stats.rating_count ? (c / stats.rating_count) * 100 : 0;
              return (
                <div key={n} className="flex items-center gap-2 text-xs text-ink-soft">
                  <span className="w-8 shrink-0">{n}★</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-sunken">
                    <div
                      className="h-full rounded-full bg-note-gold-edge"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right">{c}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-line bg-paper-raised p-5 shadow-note">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-ink-soft">
            <MessageSquare className="h-4 w-4" />
            <span className="text-sm font-medium">
              {showAllFeedback ? "All feedback" : "Recent feedback"}
            </span>
          </div>
          {!stats ? null : feedback.length === 0 ? null : (
            <button
              onClick={() => {
                setShowAllFeedback((v) => !v);
                setFeedbackVisible(FEEDBACK_PAGE_SIZE);
              }}
              className="text-sm font-semibold text-periwinkle hover:text-periwinkle-deep"
            >
              {showAllFeedback ? "Show less" : `View all (${feedback.length}) →`}
            </button>
          )}
        </div>

        {!stats ? (
          <p className="mt-3 text-sm text-ink-soft">Loading…</p>
        ) : feedback.length === 0 ? (
          <p className="mt-3 text-sm text-ink-faint">No written feedback yet.</p>
        ) : (
          <>
            <div className="mt-3 space-y-2">
              {visibleFeedback.map((entry) => (
                <FeedbackRow key={entry.session_id} entry={entry} />
              ))}
            </div>
            {showAllFeedback && feedback.length > feedbackVisible && (
              <button
                onClick={() => setFeedbackVisible((v) => v + FEEDBACK_PAGE_SIZE)}
                className="mt-3 h-9 w-full rounded-lg border border-line text-sm font-medium text-ink-soft hover:bg-paper-sunken hover:text-ink"
              >
                Load more
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
