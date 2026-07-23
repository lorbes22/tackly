import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Logo } from "@/components/Logo";
import { NodeCard } from "@/components/NodeCard";
import { EdgeLayer } from "@/components/EdgeLayer";
import { NodeDetailPanel } from "@/components/NodeDetailPanel";
import { MicBar, BotBar, LiveUtteranceFeed } from "@/components/LiveBars";
import { usePanZoom } from "@/lib/usePanZoom";
import { boardToSvg, exportPng, exportSvg } from "@/lib/boardExport";
import {
  ArrowLeft,
  Download,
  FileCode,
  Image,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const Session = base44.entities.Session;
const Node = base44.entities.Node;
const NodeEdge = base44.entities.NodeEdge;
const Utterance = base44.entities.Utterance;
const SessionOp = base44.entities.SessionOp;
const NodeNote = base44.entities.NodeNote;

const CANVAS_W = 2400;
const CANVAS_H = 1600;

export default function Board() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState(null);
  const [ending, setEnding] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [utterances, setUtterances] = useState([]);
  const [noteCounts, setNoteCounts] = useState({});
  const [sizes, setSizes] = useState({});
  const seenNoteIdsRef = useRef(new Set());
  const [showTranscript, setShowTranscript] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [phase, setPhase] = useState(null); // null | "mapping" | "linking"
  const [notFound, setNotFound] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // Nodes/edges present at first load render statically; later ones animate
  const initialNodeIds = useRef(null);
  const initialEdgeIds = useRef(null);
  const lastSeqRef = useRef(0);
  const processingRef = useRef(false);
  const cardRefs = useRef(new Map());
  const viewportRef = useRef(null);

  // Content bounding box (world space) from node positions + measured sizes.
  // Drives pan/zoom bounds and fit-to-content.
  const contentBounds = useMemo(() => {
    if (nodes.length === 0) {
      return { minX: 900, minY: 560, maxX: 1300, maxY: 900 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const x = n.position_x ?? 80;
      const y = n.position_y ?? 80;
      const size = sizes[n.id] || { w: 224, h: 120 };
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + size.w);
      maxY = Math.max(maxY, y + size.h);
    }
    return { minX, minY, maxX, maxY };
  }, [nodes, sizes]);

  const { transform, handlers: panHandlers, zoomBy, fitToContent, panToWorld } =
    usePanZoom({ viewportRef, contentBounds });

  // Frame the content once, the first time nodes appear
  const didFitRef = useRef(false);
  useEffect(() => {
    if (!didFitRef.current && nodes.length > 0 && viewportRef.current) {
      didFitRef.current = true;
      fitToContent();
    }
  }, [nodes.length, fitToContent]);

  // ---- Ops application: the ONLY way board state changes after initial
  // load. Each op merges into existing state — never a wholesale replace
  // (PLAN.md "Realtime delivery"). All handlers are idempotent so realtime
  // and the fallback poll can overlap safely.
  const applyOp = useCallback((op) => {
    if (!op) return;
    if (typeof op.seq === "number" && op.seq > lastSeqRef.current) {
      lastSeqRef.current = op.seq;
    }
    const payload = op.payload || {};
    switch (op.op_type) {
      case "create_node": {
        const node = payload.node;
        if (!node?.id) return;
        setNodes((prev) =>
          prev.some((n) => n.id === node.id) ? prev : [...prev, node]
        );
        break;
      }
      case "attach_node": {
        if (payload.action === "expand" && payload.summary && payload.node_id) {
          setNodes((prev) =>
            prev.map((n) =>
              n.id === payload.node_id ? { ...n, summary: payload.summary } : n
            )
          );
        }
        break;
      }
      case "create_edge": {
        const edge = payload.edge;
        if (!edge?.id) return;
        setEdges((prev) =>
          prev.some((e) => e.id === edge.id) ? prev : [...prev, edge]
        );
        break;
      }
      case "update_status": {
        if (!payload.node_id) return;
        setNodes((prev) =>
          prev.map((n) =>
            n.id === payload.node_id ? { ...n, status: payload.status } : n
          )
        );
        break;
      }
      case "merge_nodes": {
        const { keep_id, remove_id, merged_summary } = payload;
        if (!keep_id || !remove_id) return;
        setSelectedId((sel) => (sel === remove_id ? keep_id : sel));
        setNodes((prev) =>
          prev
            .filter((n) => n.id !== remove_id)
            .map((n) =>
              n.id === keep_id && merged_summary
                ? { ...n, summary: merged_summary }
                : n
            )
        );
        setEdges((prev) =>
          prev
            .map((e) => ({
              ...e,
              from_node_id: e.from_node_id === remove_id ? keep_id : e.from_node_id,
              to_node_id: e.to_node_id === remove_id ? keep_id : e.to_node_id,
            }))
            .filter((e) => e.from_node_id !== e.to_node_id)
        );
        break;
      }
      case "add_note": {
        if (!payload.node_id || !payload.note_id) return;
        setNoteCounts((prev) => {
          const seen = seenNoteIdsRef.current;
          if (seen.has(payload.note_id)) return prev; // idempotent
          seen.add(payload.note_id);
          return { ...prev, [payload.node_id]: (prev[payload.node_id] || 0) + 1 };
        });
        break;
      }
      case "hide_node": {
        if (!payload.node_id) return;
        setSelectedId((sel) => (sel === payload.node_id ? null : sel));
        setNodes((prev) => prev.filter((n) => n.id !== payload.node_id));
        setEdges((prev) =>
          prev.filter(
            (e) =>
              e.from_node_id !== payload.node_id && e.to_node_id !== payload.node_id
          )
        );
        break;
      }
      default:
        break;
    }
  }, []);

  // Session record refresh (status chip, live bars) — board state untouched
  const refreshSession = useCallback(async () => {
    const s = await Session.get(sessionId);
    setSession(s);
    return s;
  }, [sessionId]);

  // Full fetch happens exactly once, on initial page load
  const loadInitial = useCallback(async () => {
    const [s, allNodes, u, allEdges, lastOps, notes] = await Promise.all([
      Session.get(sessionId),
      Node.filter({ session_id: sessionId }, "created_date", 500),
      Utterance.filter({ session_id: sessionId }, "start_ms", 2000),
      NodeEdge.filter({}, "created_date", 1000),
      SessionOp.filter({ session_id: sessionId }, "-seq", 1),
      NodeNote.filter({ session_id: sessionId }, "-created_date", 1000),
    ]);
    // Hidden nodes (soft-deleted) stay in the DB but never render
    const n = allNodes.filter((x) => !x.hidden);
    const ids = new Set(n.map((x) => x.id));
    const e = allEdges.filter(
      (edge) => ids.has(edge.from_node_id) && ids.has(edge.to_node_id)
    );
    const counts = {};
    for (const note of notes) {
      seenNoteIdsRef.current.add(note.id);
      if (ids.has(note.node_id)) {
        counts[note.node_id] = (counts[note.node_id] || 0) + 1;
      }
    }
    lastSeqRef.current = lastOps[0]?.seq ?? 0;
    setSession(s);
    setNodes(n);
    setUtterances(u);
    setEdges(e);
    setNoteCounts(counts);
    if (initialNodeIds.current === null) {
      initialNodeIds.current = ids;
      initialEdgeIds.current = new Set(e.map((x) => x.id));
    }
    return s;
  }, [sessionId]);

  // Initial load + realtime ops subscription
  useEffect(() => {
    let cancelled = false;
    loadInitial().catch(() => !cancelled && setNotFound(true));

    const unsubOps = SessionOp.subscribe((event) => {
      if (event.type !== "create") return;
      if (event.data?.session_id !== sessionId) return;
      applyOp({ ...event.data, id: event.id });
    });

    return () => {
      cancelled = true;
      unsubOps();
    };
  }, [sessionId, loadInitial, applyOp]);

  // Measure card sizes so edges anchor to real centers
  useEffect(() => {
    const next = {};
    for (const [id, el] of cardRefs.current) {
      if (el) next[id] = { w: el.offsetWidth, h: el.offsetHeight };
    }
    setSizes(next);
  }, [nodes]);

  // Live capture: incrementally classify as utterances arrive, without
  // completing the session (process-session leaves "active" sessions open).
  // Short debounce only coalesces near-simultaneous turns — kept low so the
  // first node appears fast (the ~2s InvokeLLM is the real floor, not this).
  const kickTimerRef = useRef(null);
  const sinceConsolidateRef = useRef(0);
  const kickProcessing = useCallback(() => {
    clearTimeout(kickTimerRef.current);
    kickTimerRef.current = setTimeout(async () => {
      if (processingRef.current) {
        kickProcessing(); // pipeline busy — try again shortly
        return;
      }
      processingRef.current = true;
      setPhase("mapping");
      try {
        for (let i = 0; i < 30; i++) {
          const res = await base44.functions.invoke("process-session", {
            session_id: sessionId,
          });
          if (res.data?.done) break;
          sinceConsolidateRef.current += res.data?.processed ?? 0;
        }
        // Periodic live Tier-2 (PLAN.md: consolidation was only running at
        // wrap-up, never on an interval — a cause of too-sparse connections).
        // Catches longer-distance links + merges Tier-1's per-utterance view
        // misses. Emits its own ops; board applies them like any other.
        if (sinceConsolidateRef.current >= 5) {
          sinceConsolidateRef.current = 0;
          setPhase("linking");
          base44.functions
            .invoke("consolidate-session", { session_id: sessionId })
            .catch(() => {});
        }
      } catch {
        // transient — next utterance retriggers
      } finally {
        processingRef.current = false;
        setPhase(null);
        setUtterances((prev) => prev.map((u) => ({ ...u, processed: true })));
      }
    }, 300);
  }, [sessionId]);

  const isLive = session?.status === "active";
  const isMicLive = isLive && session?.capture_source === "mic_live";
  const isBotLive = isLive && session?.capture_source === "bot_live";

  // Fallback ops poll while live: fetches only ops NEWER than the last
  // applied seq and merges them — an incremental catch-up, never a refetch
  useEffect(() => {
    if (!isLive) return;
    const poll = setInterval(async () => {
      try {
        const ops = await SessionOp.filter(
          { session_id: sessionId },
          "seq",
          500
        );
        for (const op of ops) {
          if ((op.seq ?? 0) > lastSeqRef.current) applyOp(op);
        }
      } catch {
        // keep polling
      }
    }, 5000);
    return () => clearInterval(poll);
  }, [isLive, sessionId, applyOp]);

  // Bot sessions: subscribe to incoming utterances + poll as a fallback
  // (webhook rows are service-role-created; realtime delivery can lag)
  useEffect(() => {
    if (!isBotLive) return;
    const seen = new Set(utterances.map((u) => u.id));
    const ingest = (rows) => {
      const fresh = rows.filter((r) => !seen.has(r.id));
      if (fresh.length === 0) return;
      fresh.forEach((r) => seen.add(r.id));
      setUtterances((prev) =>
        [...prev, ...fresh].sort((a, b) => (a.start_ms ?? 0) - (b.start_ms ?? 0))
      );
      kickProcessing();
    };
    const unsub = Utterance.subscribe((event) => {
      if (event.type === "create" && event.data?.session_id === sessionId) {
        ingest([{ ...event.data, id: event.id }]);
      }
    });
    const poll = setInterval(async () => {
      try {
        ingest(await Utterance.filter({ session_id: sessionId }, "start_ms", 2000));
      } catch {
        // keep polling
      }
    }, 5000);
    return () => {
      unsub();
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBotLive, sessionId, kickProcessing]);

  // Mic sessions: a finalized turn becomes an utterance, then classification
  const micStartRef = useRef(Date.now());
  const handleMicFinal = useCallback(
    async (turn) => {
      try {
        const utt = await Utterance.create({
          session_id: sessionId,
          owner_email: user?.email,
          speaker_label: "Me",
          text: turn.transcript,
          start_ms: Date.now() - micStartRef.current,
          finalized: true,
          processed: false,
        });
        setUtterances((prev) => [...prev, utt]);
        kickProcessing();
      } catch {
        // dropped utterance — the transcript panel simply won't show it
      }
    },
    [sessionId, user, kickProcessing]
  );

  const endLiveSession = useCallback(async () => {
    setEnding(true);
    try {
      if (session?.capture_source === "bot_live") {
        await base44.functions.invoke("recall-stop-bot", { session_id: sessionId });
      } else {
        await Session.update(sessionId, {
          status: "processing",
          ended_at: new Date().toISOString(),
        });
      }
      await refreshSession(); // status flip triggers the wrap-up pass below
    } finally {
      setEnding(false);
    }
  }, [session, sessionId, refreshSession]);

  // Auto-select a node when arriving from search (?node=...)
  const wantedNodeRef = useRef(searchParams.get("node"));
  useEffect(() => {
    if (wantedNodeRef.current && nodes.some((n) => n.id === wantedNodeRef.current)) {
      selectNode(wantedNodeRef.current);
      wantedNodeRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // Live catch-up: unprocessed utterances left over from a previous visit
  useEffect(() => {
    if (isLive && utterances.some((u) => !u.processed)) {
      kickProcessing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  // Wrap-up: drive Tier-1 (mapping), then Tier-2 (linking) once. Board
  // changes arrive as ops; only the session record itself is refreshed.
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
          const s = await refreshSession();
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
          refreshSession().catch(() => {});
          setUtterances((prev) => prev.map((u) => ({ ...u, processed: true })));
        }
      }
    })();

    return () => {
      stopped = true;
    };
  }, [session, sessionId, refreshSession]);

  const selectNode = useCallback(
    (id) => {
      setSelectedId(id);
      const node = nodes.find((n) => n.id === id);
      if (node) {
        const size = sizes[id] || { w: 224, h: 120 };
        panToWorld((node.position_x ?? 80) + size.w / 2, (node.position_y ?? 80) + size.h / 2);
      }
    },
    [nodes, sizes, panToWorld]
  );

  // User-initiated ops: apply locally now, append to the log so it stays a
  // complete record and other viewers get the change via realtime.
  const appendUserOp = useCallback(
    (op_type, payload) =>
      SessionOp.create({
        session_id: sessionId,
        seq: lastSeqRef.current + 1,
        op_type,
        payload,
        owner_email: user?.email,
      }).catch(() => {}),
    [sessionId, user]
  );

  const applyStatus = useCallback(
    (id, status) => {
      setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status } : n)));
      appendUserOp("update_status", { node_id: id, status });
    },
    [appendUserOp]
  );

  const addNote = useCallback(
    async (nodeId, text) => {
      const clean = text.trim();
      if (!clean) return null;
      const note = await NodeNote.create({
        node_id: nodeId,
        session_id: sessionId,
        text: clean,
        owner_email: user?.email,
      });
      seenNoteIdsRef.current.add(note.id);
      setNoteCounts((prev) => ({
        ...prev,
        [nodeId]: (prev[nodeId] || 0) + 1,
      }));
      appendUserOp("add_note", { node_id: nodeId, note_id: note.id, text: clean });
      return note;
    },
    [sessionId, user, appendUserOp]
  );

  // Soft delete: hide from the board only. The node record and its utterance
  // links stay intact so the memory persists (PLAN.md).
  const hideNode = useCallback(
    async (nodeId) => {
      setSelectedId((sel) => (sel === nodeId ? null : sel));
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setEdges((prev) =>
        prev.filter((e) => e.from_node_id !== nodeId && e.to_node_id !== nodeId)
      );
      try {
        await Node.update(nodeId, { hidden: true });
        appendUserOp("hide_node", { node_id: nodeId });
      } catch {
        // best-effort; a failed hide re-appears on next full load
      }
    },
    [appendUserOp]
  );

  const runExport = useCallback(
    async (format) => {
      setExportOpen(false);
      const svg = boardToSvg(nodes, edges, sizes);
      if (!svg) return;
      const base = (session?.title || "tackly-board")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 60) || "tackly-board";
      if (format === "svg") exportSvg(svg, `${base}.svg`);
      else await exportPng(svg, `${base}.png`);
    },
    [nodes, edges, sizes, session]
  );

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

          <div className="relative">
            <button
              onClick={() => setExportOpen((v) => !v)}
              disabled={nodes.length === 0}
              title="Export board"
              className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              <span className="hidden md:inline">Export</span>
            </button>
            {exportOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setExportOpen(false)}
                />
                <div className="absolute right-0 top-9 z-30 w-40 overflow-hidden rounded-lg border-2 border-ink bg-paper-raised shadow-brutal">
                  <button
                    onClick={() => runExport("png")}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-ink hover:bg-note-lavender"
                  >
                    <Image className="h-4 w-4" /> PNG image
                  </button>
                  <button
                    onClick={() => runExport("svg")}
                    className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm font-medium text-ink hover:bg-note-lavender"
                  >
                    <FileCode className="h-4 w-4" /> SVG vector
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <div
          ref={viewportRef}
          data-pan-surface
          onPointerDown={panHandlers.onPointerDown}
          onPointerMove={panHandlers.onPointerMove}
          onPointerUp={panHandlers.onPointerUp}
          onPointerLeave={panHandlers.onPointerLeave}
          className="h-full cursor-grab overflow-hidden active:cursor-grabbing"
          style={{
            backgroundImage: "radial-gradient(circle, #E8E4DC 1px, transparent 1px)",
            backgroundSize: `${24 * transform.scale}px ${24 * transform.scale}px`,
            backgroundPosition: `${transform.x}px ${transform.y}px`,
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              width: CANVAS_W,
              height: CANVAS_H,
            }}
          >
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
                data-node
                className="absolute"
                style={{ left: node.position_x ?? 80, top: node.position_y ?? 80 }}
              >
                <NodeCard
                  ref={(el) => {
                    if (el) cardRefs.current.set(node.id, el);
                    else cardRefs.current.delete(node.id);
                  }}
                  node={node}
                  noteCount={noteCounts[node.id] || 0}
                  animate={initialNodeIds.current && !initialNodeIds.current.has(node.id)}
                  className={selectedId === node.id ? "shadow-brutal-lg ring-2 ring-periwinkle" : ""}
                  onClick={() => {
                    setShowTranscript(false);
                    setSelectedId((cur) => (cur === node.id ? null : node.id));
                  }}
                />
              </div>
            ))}
          </div>

          {nodes.length === 0 && !phase && session?.status === "complete" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="max-w-xs text-center">
                <p className="font-medium text-ink">Nothing mapped yet</p>
                <p className="mt-1 text-sm text-ink-soft">
                  This transcript didn't produce any nodes — it may be too short
                  or all small talk.
                </p>
              </div>
            </div>
          )}

          {/* Zoom controls */}
          <div className="absolute bottom-5 left-5 z-10 flex flex-col gap-1.5">
            <button
              onClick={() => zoomBy(1.2)}
              title="Zoom in"
              className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-ink bg-paper-raised text-ink shadow-brutal-sm transition-transform hover:-translate-y-px"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={() => zoomBy(1 / 1.2)}
              title="Zoom out"
              className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-ink bg-paper-raised text-ink shadow-brutal-sm transition-transform hover:-translate-y-px"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              onClick={fitToContent}
              title="Fit to content"
              className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-ink bg-paper-raised text-ink shadow-brutal-sm transition-transform hover:-translate-y-px"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {isLive && <LiveUtteranceFeed utterances={utterances} />}
        {isMicLive && (
          <MicBar onFinalTurn={handleMicFinal} onEnd={endLiveSession} ending={ending} />
        )}
        {isBotLive && (
          <BotBar
            onEnd={endLiveSession}
            ending={ending}
            hasUtterances={utterances.length > 0}
          />
        )}

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
              noteCount={noteCounts[selectedNode.id] || 0}
              onClose={() => setSelectedId(null)}
              onSelectNode={selectNode}
              onStatusChange={applyStatus}
              onAddNote={addNote}
              onHideNode={hideNode}
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
