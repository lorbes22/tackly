import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Bot, Mic, FileText, Users as UsersIcon, User } from "lucide-react";

const Session = base44.entities.Session;

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const statusStyle = {
  active: "bg-note-mint text-ink",
  processing: "bg-note-amber text-ink",
  complete: "bg-paper-sunken text-ink-soft",
};

function SessionCard({ session }) {
  const Icon = session.type === "meeting" ? UsersIcon : User;
  return (
    <Link
      to={`/app/board/${session.id}`}
      className="flex items-center gap-4 rounded-2xl border border-line bg-paper-raised p-4 shadow-note transition-shadow hover:shadow-note-lg">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-periwinkle-tint">
        <Icon className="h-5 w-5 text-periwinkle-deep" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{session.title}</p>
        <p className="text-sm text-ink-soft">
          {session.type === "meeting" ? "Meeting" : "Personal"} ·{" "}
          {formatDate(session.created_date)}
        </p>
      </div>
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
          statusStyle[session.status] || statusStyle.complete
        }`}
      >
        {session.status}
      </span>
    </Link>
  );
}

function EntryCard({ to, icon: Icon, noteColor, title, body }) {
  return (
    <Link
      to={to}
      className={`group relative block rounded-note p-6 shadow-note transition-all hover:-translate-y-0.5 hover:shadow-note-lg ${noteColor}`}
    >
      <Icon className="h-6 w-6 text-ink/70" />
      <h3 className="mt-3 font-display text-lg font-bold text-ink">{title}</h3>
      <p className="mt-1 text-sm text-ink/70">{body}</p>
    </Link>
  );
}

export default function Home() {
  const [sessions, setSessions] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await Session.list("-created_date", 50);
        if (!cancelled) setSessions(data);
      } catch {
        // RLS returns only the user's own sessions; treat failures as empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = query
    ? sessions.filter((s) =>
        (s.title || "").toLowerCase().includes(query.toLowerCase())
      )
    : sessions;

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
            Your threads
          </h1>
          <p className="mt-1 text-ink-soft">
            Every session you've mapped, in one place.
          </p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter threads…"
          className="h-10 w-full max-w-xs rounded-xl border border-line bg-paper-raised px-3.5 text-sm placeholder:text-ink-faint focus:border-periwinkle"
        />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <EntryCard
          to="/app/new?mode=talk"
          icon={Mic}
          noteColor="bg-note-lavender -rotate-1"
          title="Start talking"
          body="Hold a key, think out loud, watch the map build itself."
        />
        <EntryCard
          to="/app/new?mode=bot"
          icon={Bot}
          noteColor="bg-note-sky rotate-1"
          title="Invite the bot"
          body="Paste a meeting link — the bot joins and maps the call live."
        />
        <EntryCard
          to="/app/new?mode=import"
          icon={FileText}
          noteColor="bg-note-mint -rotate-1"
          title="Import a transcript"
          body="Already recorded elsewhere? Paste it in and map it."
        />
      </div>

      <div className="mt-10">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-periwinkle" />
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line py-14 text-center">
            <p className="font-medium text-ink">No threads yet</p>
            <p className="mt-1 text-sm text-ink-soft">
              Start talking or add a meeting above — your first map lands here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
