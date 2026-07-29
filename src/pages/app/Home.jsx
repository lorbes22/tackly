import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Bot, LogOut, Mic, FileText, Trash2, User, Users } from "lucide-react";
import { UsageBadge } from "@/components/UsageBadge";
import { PlatformIconPills } from "@/components/PlatformIcons";

const Session = base44.entities.Session;
const Node = base44.entities.Node;
const NodeEdge = base44.entities.NodeEdge;
const Utterance = base44.entities.Utterance;
const NodeNote = base44.entities.NodeNote;
const SessionOp = base44.entities.SessionOp;
const Collaborator = base44.entities.Collaborator;

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDuration(ms) {
  if (!ms) return null;
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return "<1 min";
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const statusStyle = {
  active: "bg-note-mint text-ink",
  processing: "bg-note-amber text-ink",
  complete: "bg-paper-sunken text-ink-soft",
};

const captureKind = {
  mic_live: { label: "Personal", Icon: User },
  bot_live: { label: "Meeting", Icon: Bot },
  import: { label: "Imported transcript", Icon: FileText },
};

function SessionCard({ session, collaboratorCount, confirming, deleting, onAskDelete, onCancelDelete, onConfirmDelete }) {
  const { label, Icon } = captureKind[session.capture_source] || captureKind.mic_live;
  const duration = formatDuration(session.billed_ms);

  if (confirming) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border-2 border-ink bg-note-coral p-4 shadow-note">
        <p className="min-w-0 flex-1 text-sm font-medium text-ink">
          Delete "{session.title}" forever? This can't be undone.
        </p>
        <button
          onClick={onCancelDelete}
          disabled={deleting}
          className="h-9 shrink-0 rounded-lg border-2 border-ink bg-paper-raised px-3 text-sm font-semibold text-ink transition-colors hover:bg-paper-sunken disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirmDelete}
          disabled={deleting}
          className="h-9 shrink-0 rounded-lg border-2 border-ink bg-ink px-3 text-sm font-semibold text-paper transition-colors hover:bg-ink/85 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete forever"}
        </button>
      </div>
    );
  }

  return (
    <div className="group relative flex items-center gap-4 rounded-2xl border border-line bg-paper-raised p-4 shadow-note transition-shadow hover:shadow-note-lg">
      <Link to={`/app/board/${session.id}`} className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-periwinkle-tint">
          <Icon className="h-5 w-5 text-periwinkle-deep" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-medium text-ink">{session.title}</p>
            {collaboratorCount > 0 && (
              <span
                title={`Shared with ${collaboratorCount} ${collaboratorCount === 1 ? "person" : "people"}`}
                className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-note-lavender px-1.5 py-0.5 text-xs font-medium text-ink"
              >
                <Users className="h-3 w-3" />
                {collaboratorCount}
              </span>
            )}
          </div>
          <p className="text-sm text-ink-soft">
            {label} · {formatDate(session.created_date)}
            {duration && <> · {duration}</>}
          </p>
        </div>
      </Link>
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
          statusStyle[session.status] || statusStyle.complete
        }`}
      >
        {session.status}
      </span>
      <button
        onClick={onAskDelete}
        title="Delete thread"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint opacity-0 transition-colors group-hover:opacity-100 hover:bg-note-coral hover:text-ink"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function SharedBoardCard({ collab, leaving, onLeave }) {
  return (
    <div className="group relative flex items-center gap-4 rounded-2xl border border-line bg-paper-raised p-4 shadow-note transition-shadow hover:shadow-note-lg">
      <Link to={`/app/board/${collab.session_id}`} className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-note-lavender">
          <Users className="h-5 w-5 text-ink/70" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{collab.session_title || "Untitled board"}</p>
          <p className="text-sm text-ink-soft">Shared by {collab.owner_email}</p>
        </div>
      </Link>
      <button
        onClick={onLeave}
        disabled={leaving}
        title="Leave this board"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint opacity-0 transition-colors group-hover:opacity-100 hover:bg-note-coral hover:text-ink disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

function EntryCard({ to, icon: Icon, noteColor, title, body, platforms }) {
  return (
    <Link
      to={to}
      className={`group relative block rounded-note p-6 shadow-note transition-all hover:-translate-y-0.5 hover:shadow-note-lg ${noteColor}`}
    >
      <Icon className="h-6 w-6 text-ink/70" />
      <div className="mt-3 flex items-center gap-2">
        <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
        {platforms && <PlatformIconPills />}
      </div>
      <p className="mt-1 text-sm text-ink/70">{body}</p>
    </Link>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [tab, setTab] = useState("mine"); // "mine" | "shared"
  const [sessions, setSessions] = useState([]);
  const [sharedBoards, setSharedBoards] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [leavingId, setLeavingId] = useState(null);
  const [collaboratorCounts, setCollaboratorCounts] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, shared, ownedGrants] = await Promise.all([
          Session.list("-created_date", 50),
          user?.email
            ? Collaborator.filter({ collaborator_email: user.email }, "-invited_at", 50)
            : Promise.resolve([]),
          user?.email
            ? Collaborator.filter({ owner_email: user.email }, "-invited_at", 200)
            : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setSessions(data);
          setSharedBoards(shared);
          const counts = {};
          for (const c of ownedGrants) counts[c.session_id] = (counts[c.session_id] || 0) + 1;
          setCollaboratorCounts(counts);
        }
      } catch {
        // RLS returns only the user's own sessions/grants; treat failures as empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  const leaveSharedBoard = useCallback(async (collab) => {
    setLeavingId(collab.id);
    try {
      await Collaborator.delete(collab.id);
      setSharedBoards((prev) => prev.filter((c) => c.id !== collab.id));
    } catch {
      // best-effort; it just stays in the list if something failed
    } finally {
      setLeavingId(null);
    }
  }, []);

  // Deletes a thread and everything hanging off it. There's no cascade at
  // the DB level, so this walks the same tables Board.jsx reads from
  // (nodes, edges touching those nodes, utterances, notes, ops) before
  // removing the Session itself — all under the owner's own RLS.
  const deleteThread = useCallback(async (session) => {
    setDeletingId(session.id);
    try {
      const [nodes, edges, utterances, notes, ops] = await Promise.all([
        Node.filter({ session_id: session.id }, "created_date", 2000),
        NodeEdge.filter({}, "created_date", 3000),
        Utterance.filter({ session_id: session.id }, "start_ms", 3000),
        NodeNote.filter({ session_id: session.id }, "-created_date", 2000),
        SessionOp.filter({ session_id: session.id }, "-seq", 5000),
      ]);
      const nodeIds = new Set(nodes.map((n) => n.id));
      const relatedEdges = edges.filter(
        (e) => nodeIds.has(e.from_node_id) || nodeIds.has(e.to_node_id)
      );
      await Promise.all([
        ...relatedEdges.map((e) => NodeEdge.delete(e.id)),
        ...notes.map((n) => NodeNote.delete(n.id)),
        ...ops.map((o) => SessionOp.delete(o.id)),
        ...utterances.map((u) => Utterance.delete(u.id)),
      ]);
      await Promise.all(nodes.map((n) => Node.delete(n.id)));
      await Session.delete(session.id);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } catch {
      // best-effort; the thread just stays in the list if something failed
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }, []);

  const visible = query
    ? sessions.filter((s) =>
        (s.title || "").toLowerCase().includes(query.toLowerCase())
      )
    : sessions;
  const visibleShared = query
    ? sharedBoards.filter((c) =>
        (c.session_title || "").toLowerCase().includes(query.toLowerCase())
      )
    : sharedBoards;

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
          <div className="mt-2">
            <UsageBadge variant="compact" />
          </div>
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
          platforms
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
        <div className="flex items-center gap-1 border-b border-line">
          <button
            onClick={() => setTab("mine")}
            className={`relative h-10 px-3 text-sm font-semibold transition-colors ${
              tab === "mine" ? "text-ink" : "text-ink-faint hover:text-ink-soft"
            }`}
          >
            Your threads
            {tab === "mine" && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-periwinkle" />
            )}
          </button>
          <button
            onClick={() => setTab("shared")}
            className={`relative h-10 px-3 text-sm font-semibold transition-colors ${
              tab === "shared" ? "text-ink" : "text-ink-faint hover:text-ink-soft"
            }`}
          >
            Shared threads
            {sharedBoards.length > 0 && (
              <span className="ml-1.5 rounded-full bg-paper-sunken px-1.5 py-0.5 text-xs text-ink-soft">
                {sharedBoards.length}
              </span>
            )}
            {tab === "shared" && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-periwinkle" />
            )}
          </button>
        </div>

        <div className="mt-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-periwinkle" />
          </div>
        ) : tab === "shared" ? (
          visibleShared.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line py-14 text-center">
              <p className="font-medium text-ink">No boards shared with you yet</p>
              <p className="mt-1 text-sm text-ink-soft">
                When someone invites you to collaborate, it'll show up here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleShared.map((c) => (
                <SharedBoardCard
                  key={c.id}
                  collab={c}
                  leaving={leavingId === c.id}
                  onLeave={() => leaveSharedBoard(c)}
                />
              ))}
            </div>
          )
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
              <SessionCard
                key={s.id}
                session={s}
                collaboratorCount={collaboratorCounts[s.id] || 0}
                confirming={confirmId === s.id}
                deleting={deletingId === s.id}
                onAskDelete={(e) => {
                  e.preventDefault();
                  setConfirmId(s.id);
                }}
                onCancelDelete={() => setConfirmId(null)}
                onConfirmDelete={() => deleteThread(s)}
              />
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
