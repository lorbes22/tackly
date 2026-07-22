import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Logo } from "@/components/Logo";
import { NodeCard } from "@/components/NodeCard";
import { ArrowLeft, PanelRightClose, PanelRightOpen } from "lucide-react";

const Session = base44.entities.Session;
const Node = base44.entities.Node;
const Utterance = base44.entities.Utterance;

const CANVAS_W = 2400;
const CANVAS_H = 1600;

export default function Board() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [utterances, setUtterances] = useState([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // Nodes created after initial load animate in; preexisting ones don't
  const initialIds = useRef(null);
  const processingRef = useRef(false);

  const loadAll = useCallback(async () => {
    const [s, n, u] = await Promise.all([
      Session.get(sessionId),
      Node.filter({ session_id: sessionId }, "created_date", 500),
      Utterance.filter({ session_id: sessionId }, "start_ms", 2000),
    ]);
    setSession(s);
    setNodes(n);
    setUtterances(u);
    if (initialIds.current === null) {
      initialIds.current = new Set(n.map((x) => x.id));
    }
    return s;
  }, [sessionId]);

  // Initial load + realtime node updates
  useEffect(() => {
    let cancelled = false;
    loadAll().catch(() => !cancelled && setNotFound(true));

    const unsubscribe = Node.subscribe((event) => {
      if (event.data?.session_id !== sessionId) return;
      setNodes((prev) => {
        if (event.type === "create") {
          return prev.some((n) => n.id === event.id)
            ? prev
            : [...prev, { ...event.data, id: event.id }];
        }
        if (event.type === "update") {
          return prev.map((n) =>
            n.id === event.id ? { ...n, ...event.data } : n
          );
        }
        if (event.type === "delete") {
          return prev.filter((n) => n.id !== event.id);
        }
        return prev;
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionId, loadAll]);

  // Drive the Tier-1 pipeline while the session has unprocessed utterances
  useEffect(() => {
    if (!session || session.status !== "processing" || processingRef.current) {
      return;
    }
    processingRef.current = true;
    setMapping(true);
    let stopped = false;

    (async () => {
      try {
        for (let i = 0; i < 100 && !stopped; i++) {
          const res = await base44.functions.invoke("process-session", {
            session_id: sessionId,
          });
          if (res.data?.done) break;
        }
      } catch {
        // Board stays usable; unprocessed utterances resume on next visit
      } finally {
        processingRef.current = false;
        if (!stopped) {
          setMapping(false);
          loadAll().catch(() => {});
        }
      }
    })();

    return () => {
      stopped = true;
    };
  }, [session, sessionId, loadAll]);

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper">
        <p className="font-medium text-ink">This thread doesn't exist — or isn't yours.</p>
        <Link to="/app" className="text-sm font-medium text-periwinkle hover:text-periwinkle-deep">
          Back to your threads
        </Link>
      </div>
    );
  }

  const processedCount = utterances.filter((u) => u.processed).length;

  return (
    <div className="flex h-screen flex-col bg-paper">
      {/* Thin top bar — the canvas is the hero */}
      <header className="z-20 flex h-12 shrink-0 items-center justify-between border-b border-line bg-paper/90 px-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/app"
            title="Back to threads"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Logo to="/app" className="hidden sm:inline-flex" />
          <span className="truncate text-sm font-medium text-ink">
            {session?.title || "…"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {mapping && (
            <span className="flex items-center gap-2 rounded-full border-2 border-ink bg-note-gold px-3 py-1 text-xs font-bold text-ink shadow-brutal-sm">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
              Mapping… {nodes.length} {nodes.length === 1 ? "node" : "nodes"}
              {utterances.length > 0 && ` · ${processedCount}/${utterances.length}`}
            </span>
          )}
          <button
            onClick={() => setShowTranscript((v) => !v)}
            title={showTranscript ? "Hide transcript" : "Show transcript"}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
          >
            {showTranscript ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
            <span className="hidden md:inline">Transcript</span>
          </button>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        {/* Canvas */}
        <div
          className="h-full overflow-auto"
          style={{
            backgroundImage: "radial-gradient(circle, #E8E4DC 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          <div
            className="relative"
            style={{ width: CANVAS_W, height: CANVAS_H }}
          >
            {nodes.map((node) => (
              <div
                key={node.id}
                className="absolute"
                style={{ left: node.position_x ?? 80, top: node.position_y ?? 80 }}
              >
                <NodeCard
                  node={node}
                  animate={initialIds.current && !initialIds.current.has(node.id)}
                />
              </div>
            ))}

            {nodes.length === 0 && !mapping && session?.status === "complete" && (
              <div className="absolute left-1/3 top-1/4 max-w-xs -translate-x-1/2 text-center">
                <p className="font-medium text-ink">Nothing mapped yet</p>
                <p className="mt-1 text-sm text-ink-soft">
                  This transcript didn't produce any nodes — it may be too short
                  or all small talk.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Transcript panel — slides in, never a fixed column */}
        <aside
          className={`absolute inset-y-0 right-0 z-10 w-80 transform border-l border-line bg-paper-raised shadow-panel transition-transform duration-300 ${
            showTranscript ? "translate-x-0" : "translate-x-full"
          }`}
          aria-hidden={!showTranscript}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-line px-4 py-3">
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-ink-soft">
                Transcript
              </h2>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {utterances.map((u) => (
                <div key={u.id} className={u.processed ? "" : "opacity-45"}>
                  {u.speaker_label && (
                    <span className="text-xs font-semibold text-periwinkle-deep">
                      {u.speaker_label}
                    </span>
                  )}
                  <p className="text-sm leading-relaxed text-ink">{u.text}</p>
                </div>
              ))}
              {utterances.length === 0 && (
                <p className="text-sm text-ink-soft">No transcript yet.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
