import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Logo } from "@/components/Logo";
import { NodeCard } from "@/components/NodeCard";
import { EdgeLayer } from "@/components/EdgeLayer";
import { NodeDetailPanel } from "@/components/NodeDetailPanel";
import { ArrowLeft, PanelRightClose, PanelRightOpen } from "lucide-react";

const Session = base44.entities.Session;
const Node = base44.entities.Node;
const NodeEdge = base44.entities.NodeEdge;
const Utterance = base44.entities.Utterance;

const CANVAS_W = 2400;
const CANVAS_H = 1600;

export default function Board() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [utterances, setUtterances] = useState([]);
  const [sizes, setSizes] = useState({});
  const [showTranscript, setShowTranscript] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [phase, setPhase] = useState(null); // null | "mapping" | "linking"
  const [notFound, setNotFound] = useState(false);
  // Nodes/edges present at first load render statically; later ones animate
  const initialNodeIds = useRef(null);
  const initialEdgeIds = useRef(null);
  const nodeIdsRef = useRef(new Set());
  const processingRef = useRef(false);
  const cardRefs = useRef(new Map());
  const scrollRef = useRef(null);

  const loadAll = useCallback(async () => {
    const [s, n, u, allEdges] = await Promise.all([
      Session.get(sessionId),
      Node.filter({ session_id: sessionId }, "created_date", 500),
      Utterance.filter({ session_id: sessionId }, "start_ms", 2000),
      NodeEdge.filter({}, "created_date", 1000),
    ]);
    const ids = new Set(n.map((x) => x.id));
    const e = allEdges.filter(
      (edge) => ids.has(edge.from_node_id) && ids.has(edge.to_node_id)
    );
    nodeIdsRef.current = ids;
    setSession(s);
    setNodes(n);
    setUtterances(u);
    setEdges(e);
    if (initialNodeIds.current === null) {
      initialNodeIds.current = ids;
      initialEdgeIds.current = new Set(e.map((x) => x.id));
    }
    return s;
  }, [sessionId]);

  // Initial load + realtime subscriptions
  useEffect(() => {
    let cancelled = false;
    loadAll().catch(() => !cancelled && setNotFound(true));

    const unsubNodes = Node.subscribe((event) => {
      if (event.data?.session_id !== sessionId) return;
      setNodes((prev) => {
        if (event.type === "create") {
          nodeIdsRef.current.add(event.id);
          return prev.some((n) => n.id === event.id)
            ? prev
            : [...prev, { ...event.data, id: event.id }];
        }
        if (event.type === "update") {
          return prev.map((n) => (n.id === event.id ? { ...n, ...event.data } : n));
        }
        if (event.type === "delete") {
          nodeIdsRef.current.delete(event.id);
          setSelectedId((sel) => (sel === event.id ? null : sel));
          return prev.filter((n) => n.id !== event.id);
        }
        return prev;
      });
    });

    const unsubEdges = NodeEdge.subscribe((event) => {
      setEdges((prev) => {
        if (event.type === "create") {
          const d = event.data || {};
          if (!nodeIdsRef.current.has(d.from_node_id)) return prev;
          return prev.some((e) => e.id === event.id)
            ? prev
            : [...prev, { ...d, id: event.id }];
        }
        if (event.type === "update") {
          return prev.map((e) => (e.id === event.id ? { ...e, ...event.data } : e));
        }
        if (event.type === "delete") {
          return prev.filter((e) => e.id !== event.id);
        }
        return prev;
      });
    });

    return () => {
      cancelled = true;
      unsubNodes();
      unsubEdges();
    };
  }, [sessionId, loadAll]);

  // Measure card sizes so edges anchor to real centers
  useEffect(() => {
    const next = {};
    for (const [id, el] of cardRefs.current) {
      if (el) next[id] = { w: el.offsetWidth, h: el.offsetHeight };
    }
    setSizes(next);
  }, [nodes]);

  // Drive Tier-1 (mapping), then Tier-2 (linking) once
  useEffect(() => {
    if (!session || processingRef.current) return;
    const needsMapping = session.status === "processing";
    const needsLinking = !session.consolidated_at && session.status === "complete";
    if (!needsMapping && !needsLinking) return;

    processingRef.current = true;
    let stopped = false;

    (async () => {
      try {
        if (needsMapping) {
          setPhase("mapping");
          for (let i = 0; i < 100 && !stopped; i++) {
            const res = await base44.functions.invoke("process-session", {
              session_id: sessionId,
            });
            if (res.data?.done) break;
          }
        }
        if (!stopped) {
          const s = await loadAll();
          if (!s.consolidated_at) {
            setPhase("linking");
            await base44.functions.invoke("consolidate-session", {
              session_id: sessionId,
            });
          }
        }
      } catch {
        // Board stays usable; the pass resumes on next visit
      } finally {
        processingRef.current = false;
        if (!stopped) {
          setPhase(null);
          loadAll().catch(() => {});
        }
      }
    })();

    return () => {
      stopped = true;
    };
  }, [session, sessionId, loadAll]);

  const selectNode = useCallback((id) => {
    setSelectedId(id);
    const el = cardRefs.current.get(id);
    if (el && scrollRef.current) {
      const node = el.parentElement;
      scrollRef.current.scrollTo({
        left: Math.max(0, node.offsetLeft - 220),
        top: Math.max(0, node.offsetTop - 160),
        behavior: "smooth",
      });
    }
  }, []);

  const applyStatus = useCallback((id, status) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status } : n)));
  }, []);

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

  const selectedNode = nodes.find((n) => n.id === selectedId) || null;
  const processedCount = utterances.filter((u) => u.processed).length;
  const panelOpen = Boolean(selectedNode) || showTranscript;

  return (
    <div className="flex h-screen flex-col bg-paper">
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
          {phase && (
            <span className="flex items-center gap-2 rounded-full border-2 border-ink bg-note-gold px-3 py-1 text-xs font-bold text-ink shadow-brutal-sm">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
              {phase === "mapping" ? (
                <>
                  Mapping… {nodes.length} {nodes.length === 1 ? "node" : "nodes"}
                  {utterances.length > 0 && ` · ${processedCount}/${utterances.length}`}
                </>
              ) : (
                "Linking ideas…"
              )}
            </span>
          )}
          <button
            onClick={() => {
              setSelectedId(null);
              setShowTranscript((v) => !v);
            }}
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
        <div
          ref={scrollRef}
          className="h-full overflow-auto"
          style={{
            backgroundImage: "radial-gradient(circle, #E8E4DC 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H }}>
            <EdgeLayer
              edges={edges}
              nodes={nodes}
              sizes={sizes}
              animateIds={
                initialEdgeIds.current
                  ? new Set(
                      edges.filter((e) => !initialEdgeIds.current.has(e.id)).map((e) => e.id)
                    )
                  : null
              }
              width={CANVAS_W}
              height={CANVAS_H}
            />
            {nodes.map((node) => (
              <div
                key={node.id}
                className="absolute"
                style={{ left: node.position_x ?? 80, top: node.position_y ?? 80 }}
              >
                <NodeCard
                  ref={(el) => {
                    if (el) cardRefs.current.set(node.id, el);
                    else cardRefs.current.delete(node.id);
                  }}
                  node={node}
                  animate={initialNodeIds.current && !initialNodeIds.current.has(node.id)}
                  className={selectedId === node.id ? "shadow-brutal-lg ring-2 ring-periwinkle" : ""}
                  onClick={() => {
                    setShowTranscript(false);
                    setSelectedId((cur) => (cur === node.id ? null : node.id));
                  }}
                />
              </div>
            ))}

            {nodes.length === 0 && !phase && session?.status === "complete" && (
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

        {/* Right panel: node detail wins over transcript */}
        <aside
          className={`absolute inset-y-0 right-0 z-10 w-80 transform border-l-2 border-ink bg-paper-raised transition-transform duration-300 ${
            panelOpen ? "translate-x-0 shadow-panel" : "translate-x-full"
          }`}
          aria-hidden={!panelOpen}
        >
          {selectedNode ? (
            <NodeDetailPanel
              node={selectedNode}
              nodes={nodes}
              edges={edges}
              utterances={utterances}
              onClose={() => setSelectedId(null)}
              onSelectNode={selectNode}
              onStatusChange={applyStatus}
            />
          ) : (
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
          )}
        </aside>
      </div>
    </div>
  );
}
