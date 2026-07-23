import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { NODE_TYPE_STYLES } from "@/components/NodeCard";
import { Search } from "lucide-react";

// Keyword search across the user's own sessions and nodes. Data volumes are
// small per-user, so everything loads once and filters client-side.

function highlightable(text, q) {
  const i = text.toLowerCase().indexOf(q);
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-note-gold px-0.5">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, n] = await Promise.all([
          base44.entities.Session.list("-created_date", 500),
          base44.entities.Node.list("-created_date", 2000),
        ]);
        if (!cancelled) {
          setSessions(s);
          setNodes(n);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (q.length < 2) return null;
    const sessionTitles = new Map(sessions.map((s) => [s.id, s.title]));
    const matchedNodes = nodes
      .filter(
        (n) =>
          (n.title || "").toLowerCase().includes(q) ||
          (n.summary || "").toLowerCase().includes(q)
      )
      .slice(0, 50);
    const matchedSessions = sessions
      .filter((s) => (s.title || "").toLowerCase().includes(q))
      .slice(0, 20);
    return { matchedNodes, matchedSessions, sessionTitles };
  }, [q, sessions, nodes]);

  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
        Search
      </h1>
      <p className="mt-1 text-ink-soft">
        Every thought you've mapped, one keyword away.
      </p>

      <div className="relative mt-6">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes and sessions…"
          className="h-12 w-full rounded-xl border border-line bg-paper-raised pl-10 pr-4 text-sm placeholder:text-ink-faint focus:border-periwinkle"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-periwinkle" />
        </div>
      ) : results === null ? (
        <p className="mt-8 text-center text-sm text-ink-faint">
          Type at least two characters to search {nodes.length} nodes across{" "}
          {sessions.length} sessions.
        </p>
      ) : results.matchedNodes.length === 0 && results.matchedSessions.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line py-12 text-center">
          <p className="font-medium text-ink">Nothing found for “{query.trim()}”</p>
          <p className="mt-1 text-sm text-ink-soft">
            Try a different word — search covers node titles, summaries, and
            session titles.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {results.matchedNodes.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                Nodes · {results.matchedNodes.length}
              </h2>
              <div className="mt-3 space-y-2">
                {results.matchedNodes.map((n) => {
                  const style = NODE_TYPE_STYLES[n.type] || NODE_TYPE_STYLES.idea;
                  return (
                    <Link
                      key={n.id}
                      to={`/app/board/${n.session_id}?node=${n.id}`}
                      className="flex items-start gap-3 rounded-xl border border-line bg-paper-raised p-3.5 transition-colors hover:border-ink"
                    >
                      <span
                        className={`mt-0.5 h-3 w-3 shrink-0 rounded-full border-2 border-ink ${style.fill}`}
                        title={style.label}
                      />
                      <span className="min-w-0">
                        <span className="block font-medium text-ink">
                          {highlightable(n.title || "", q)}
                        </span>
                        {n.summary && (
                          <span className="mt-0.5 line-clamp-2 block text-sm text-ink-soft">
                            {highlightable(n.summary, q)}
                          </span>
                        )}
                        <span className="mt-1 block text-xs text-ink-faint">
                          {style.label} · {results.sessionTitles.get(n.session_id) || "Session"}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {results.matchedSessions.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                Sessions · {results.matchedSessions.length}
              </h2>
              <div className="mt-3 space-y-2">
                {results.matchedSessions.map((s) => (
                  <Link
                    key={s.id}
                    to={`/app/board/${s.id}`}
                    className="block rounded-xl border border-line bg-paper-raised p-3.5 transition-colors hover:border-ink"
                  >
                    <span className="font-medium text-ink">
                      {highlightable(s.title || "", q)}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-faint">
                      {s.type === "meeting" ? "Meeting" : "Personal"} ·{" "}
                      {new Date(s.created_date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
