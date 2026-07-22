import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Activity, DollarSign, StickyNote, UserPlus } from "lucide-react";

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
      <div className="mt-8 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-soft">
        Charts and recent activity land here once real sessions start flowing.
      </div>
    </div>
  );
}
