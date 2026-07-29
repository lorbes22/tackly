import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Logo } from "@/components/Logo";
import { NodeCard } from "@/components/NodeCard";
import { EdgeLayer } from "@/components/EdgeLayer";
import { NodeDetailPanel } from "@/components/NodeDetailPanel";
import { BoardLoadingScreen } from "@/components/BoardLoadingScreen";
import { usePanZoom } from "@/lib/usePanZoom";
import { computeLayout } from "@/lib/treeLayout";
import { buildRevealOrder, nodeRevealDelay, edgeRevealDelay } from "@/lib/boardIntro";
import { Maximize2, PanelRightClose, PanelRightOpen, ZoomIn, ZoomOut } from "lucide-react";

const CANVAS_W = 2400;
const CANVAS_H = 1600;

// The public, unauthenticated read-only view of a board — anyone with the
// link, no Tackly account required. A single one-time fetch (no polling, no
// realtime, no editing) since the underlying session has already ended by
// the time a link can even be created; see get-shared-board and
// ShareDropdown for the rest of this feature.
export default function SharedBoard() {
  const { token } = useParams();
  const [state, setState] = useState(null); // { session, nodes, edges, utterances, notes, links }
  const [error, setError] = useState(null);
  const [sizes, setSizes] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const cardRefs = useRef(new Map());
  const viewportRef = useRef(null);
  const initialOrderRef = useRef(null);
  const allEdgeIdsRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    base44.functions
      .invoke("get-shared-board", { token })
      .then((res) => {
        if (cancelled) return;
        setState(res.data);
        initialOrderRef.current = buildRevealOrder(res.data.nodes);
        allEdgeIdsRef.current = new Set(res.data.edges.map((e) => e.id));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.response?.data?.error || "This link isn't available.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Memoized on `state` (set exactly once, on load) rather than derived fresh
  // on every render — a fresh [] each render broke the size-measuring
  // effect's dependency check below and spun into an infinite render loop.
  const nodes = useMemo(() => state?.nodes || [], [state]);
  const edges = useMemo(() => state?.edges || [], [state]);
  const utterances = useMemo(() => state?.utterances || [], [state]);

  const noteCounts = useMemo(() => {
    const counts = {};
    for (const note of state?.notes || []) {
      counts[note.node_id] = (counts[note.node_id] || 0) + 1;
    }
    return counts;
  }, [state]);

  const layoutPositions = useMemo(() => computeLayout(nodes, sizes), [nodes, sizes]);

  const treeEdgeIds = useMemo(() => {
    const parentOf = new Map(nodes.map((n) => [n.id, n.parent_id]));
    return new Set(
      edges.filter((e) => parentOf.get(e.to_node_id) === e.from_node_id).map((e) => e.id)
    );
  }, [edges, nodes]);

  const contentBounds = useMemo(() => {
    const ids = Object.keys(layoutPositions);
    if (ids.length === 0) return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ids) {
      const p = layoutPositions[id];
      const size = sizes[id] || { w: 224, h: 120 };
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + size.w);
      maxY = Math.max(maxY, p.y + size.h);
    }
    return { minX, minY, maxX, maxY };
  }, [layoutPositions, sizes]);

  const { transform, handlers: panHandlers, zoomBy, fitToContent } = usePanZoom({
    viewportRef,
    contentBounds,
  });

  const didFitRef = useRef(false);
  useEffect(() => {
    if (!didFitRef.current && nodes.length > 0 && viewportRef.current) {
      didFitRef.current = true;
      fitToContent();
    }
  }, [nodes.length, fitToContent]);

  // Measure card sizes so edges anchor to real centers — same pattern as Board.jsx
  useEffect(() => {
    const next = {};
    for (const [id, el] of cardRefs.current) {
      if (el) next[id] = { w: el.offsetWidth, h: el.offsetHeight };
    }
    setSizes(next);
  }, [nodes]);

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper px-4 text-center">
        <p className="font-medium text-ink">{error}</p>
        <Link to="/" className="text-sm font-medium text-periwinkle hover:text-periwinkle-deep">
          Go to Tackly
        </Link>
      </div>
    );
  }

  if (!state) {
    return <BoardLoadingScreen label="Loading shared board…" />;
  }

  const { session } = state;
  const selectedNode = nodes.find((n) => n.id === selectedId) || null;
  const panelOpen = Boolean(selectedNode) || showTranscript;

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <header className="z-20 flex h-12 shrink-0 items-center justify-between border-b border-line bg-paper/90 px-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Logo to="/" />
          <span className="truncate text-sm font-medium text-ink">{session.title}</span>
          <span className="hidden shrink-0 rounded-full border border-line bg-paper-sunken px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-faint sm:inline">
            Shared · read-only
          </span>
        </div>
        <button
          onClick={() => setShowTranscript((v) => !v)}
          title={showTranscript ? "Hide transcript" : "Show transcript"}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
        >
          {showTranscript ? (
            <PanelRightClose className="h-3.5 w-3.5" />
          ) : (
            <PanelRightOpen className="h-3.5 w-3.5" />
          )}
          Transcript
        </button>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <div
          ref={viewportRef}
          data-pan-surface
          onPointerDown={panHandlers.onPointerDown}
          onPointerMove={panHandlers.onPointerMove}
          onPointerUp={panHandlers.onPointerUp}
          onPointerLeave={panHandlers.onPointerLeave}
          onPointerCancel={panHandlers.onPointerCancel}
          className="h-full touch-none cursor-grab overflow-hidden active:cursor-grabbing"
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
              positions={layoutPositions}
              sizes={sizes}
              treeEdgeIds={treeEdgeIds}
              animateDelays={
                new Map(
                  edges.map((e) => [
                    e.id,
                    edgeRevealDelay(initialOrderRef.current, allEdgeIdsRef.current, e),
                  ])
                )
              }
              width={CANVAS_W}
              height={CANVAS_H}
            />
            {nodes.map((node) => {
              const p = layoutPositions[node.id] || { x: 80, y: 80 };
              return (
                <div key={node.id} data-node className="absolute cursor-pointer" style={{ left: p.x, top: p.y }}>
                  <NodeCard
                    ref={(el) => {
                      if (el) cardRefs.current.set(node.id, el);
                      else cardRefs.current.delete(node.id);
                    }}
                    node={node}
                    noteCount={noteCounts[node.id] || 0}
                    animate
                    delayMs={nodeRevealDelay(initialOrderRef.current, node.id)}
                    className={selectedId === node.id ? "shadow-brutal-lg ring-2 ring-periwinkle" : ""}
                    onClick={() => {
                      setShowTranscript(false);
                      setSelectedId((cur) => (cur === node.id ? null : node.id));
                    }}
                  />
                </div>
              );
            })}
          </div>

          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-ink-soft">Nothing was mapped in this session.</p>
            </div>
          )}

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
              readOnly
              preloadedLinkedUtteranceIds={(state.links || [])
                .filter((l) => l.node_id === selectedNode.id)
                .map((l) => l.utterance_id)}
              preloadedNotes={(state.notes || []).filter((n) => n.node_id === selectedNode.id)}
              onClose={() => setSelectedId(null)}
              onSelectNode={setSelectedId}
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
                  <div key={u.id}>
                    {u.speaker_label && (
                      <span className="text-xs font-semibold text-periwinkle-deep">
                        {u.speaker_label}
                      </span>
                    )}
                    <p className="text-sm leading-relaxed text-ink">{u.text}</p>
                  </div>
                ))}
                {utterances.length === 0 && (
                  <p className="text-sm text-ink-soft">No transcript available.</p>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      <footer className="flex h-9 shrink-0 items-center justify-center border-t border-line bg-paper-sunken text-xs text-ink-faint">
        Shared via{" "}
        <Link to="/" className="ml-1 font-semibold text-ink-soft hover:text-ink">
          Tackly
        </Link>
      </footer>
    </div>
  );
}
