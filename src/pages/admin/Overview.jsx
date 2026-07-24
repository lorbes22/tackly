import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Activity, DollarSign, Star, StickyNote, UserPlus } from "lucide-react";

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

export default function Overview() {
  const [events, setEvents] = useState(null);
  const [stats, setStats] = useState(null);

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
    return () => {
      cancelled = true;
    };
  }, []);

  const count = (type) =>
    events === null ? "—" : events.filter((e) => e.event_type === type).length;

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
          value="—"
          hint="Wired up with the users table"
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
              ? `$${stats.total_llm_cost_usd.toFixed(2)} across ${stats.billed_minutes} tracked min — Tier-1 only now, estimated, see PLAN.md §1d`
              : "Loading…"
          }
        />
        <StatTile
          icon={DollarSign}
          label="Avg. gateway credits / min"
          value={
            stats?.avg_gateway_credits_per_minute != null
              ? stats.avg_gateway_credits_per_minute.toFixed(2)
              : "—"
          }
          hint={
            stats
              ? `${stats.total_gateway_credits.toFixed(0)} credits — Tier-2 via Base44 AI Gateway, see PLAN.md §1d`
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

      <div className="mt-8 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-soft">
        Charts and recent activity land here once real sessions start flowing.
      </div>
    </div>
  );
}
