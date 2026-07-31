import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Logo } from "@/components/Logo";
import { NodeCard } from "@/components/NodeCard";
import { GhostNodeCard } from "@/components/GhostNodeCard";
import { FloatingTranscript } from "@/components/FloatingTranscript";
import { EdgeLayer } from "@/components/EdgeLayer";
import { NodeDetailPanel } from "@/components/NodeDetailPanel";
import { AddNoteModal } from "@/components/AddNoteModal";
import { MicBar, BotBar, LiveUtteranceFeed } from "@/components/LiveBars";
import { TacklyAIPanel } from "@/components/TacklyAIPanel";
import { ShareDropdown } from "@/components/ShareDropdown";
import { RatingModal } from "@/components/RatingModal";
import { QuotaWarningModal } from "@/components/QuotaWarningModal";
import { BoardLoadingScreen } from "@/components/BoardLoadingScreen";
import { usePanZoom } from "@/lib/usePanZoom";
import { computeLayout } from "@/lib/treeLayout";
import { buildRevealOrder, nodeRevealDelay, edgeRevealDelay } from "@/lib/boardIntro";
import { boardToSvg, boardToMarkdown, exportPng, exportSvg, exportMarkdown } from "@/lib/boardExport";
import {
  ArrowLeft,
  Download,
  FileCode,
  FileText,
  Image,
  Locate,
  Maximize2,
  Mic,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const Session = base44.entities.Session;
const Node = base44.entities.Node;
const NodeEdge = base44.entities.NodeEdge;
const Utterance = base44.entities.Utterance;
const SessionOp = base44.entities.SessionOp;
const NodeNote = base44.entities.NodeNote;
const Collaborator = base44.entities.Collaborator;

// A non-owner (collaborator) polls this instead of
// subscribing to realtime — Base44 realtime only ever runs within the
// subscriber's own RLS, which stays owner-only by design (see the RLS
// security fix), so it can't be extended to someone else's board without
// reopening that hole. The owner's own view is completely unaffected by
// this — it keeps using direct realtime exactly as before.
const SHARED_POLL_MS = 2500;
// Only relevant once a board has collaborators — the owner's own view polls
// this lightly just to know if someone else currently holds the mic.
const SPEAKER_POLL_MS = 3000;

const CANVAS_W = 2400;
const CANVAS_H = 1600;

export default function Board() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState(null);
  const [ending, setEnding] = useState(false);
  // A completed meeting can be continued by voice afterward — Recall's bot
  // never has hold-to-talk, but once it's left the call, the same board can
  // switch to mic capture like a personal thread would.
  const [micContinuing, setMicContinuing] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [utterances, setUtterances] = useState([]);
  const [noteCounts, setNoteCounts] = useState({});
  const [sizes, setSizes] = useState({});
  const seenNoteIdsRef = useRef(new Set());
  const [showTranscript, setShowTranscript] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [phase, setPhase] = useState(null); // null | "mapping" | "linking"
  // Brief "Tackled" confirmation right as mapping/linking finishes, instead
  // of the pill just vanishing with no sense of closure — fades on its own.
  const [justTackled, setJustTackled] = useState(false);
  const justTackledTimerRef = useRef(null);
  // One-time hint bubble shown above the "tackled" bar the first time this
  // visit lands on an already-complete, non-continuable thread — stays up
  // until explicitly dismissed (no auto-timeout; was disappearing before
  // people had a chance to read it).
  const [showDeadEndHint, setShowDeadEndHint] = useState(false);
  const deadEndHintShownRef = useRef(false);
  const [notFound, setNotFound] = useState(false);
  // null = owner (default, existing behavior). "editor" = a collaborator,
  // accessed via get-board-access rather than owning the Session record
  // directly.
  const [sharedRole, setSharedRole] = useState(null);
  const [collaboratorCount, setCollaboratorCount] = useState(0);
  const [activeSpeakerEmail, setActiveSpeakerEmail] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [noteModalNodeId, setNoteModalNodeId] = useState(null);
  const [showRating, setShowRating] = useState(false);
  // Nodes/edges present at first load "replay" pop in, staggered in
  // creation order (see src/lib/boardIntro.js); later ones pop in instantly
  // exactly as before.
  const initialNodeIds = useRef(null);
  const initialEdgeIds = useRef(null);
  const initialOrderRef = useRef(null);
  const lastSeqRef = useRef(0);
  const appliedOpsRef = useRef(new Set());
  const processingRef = useRef(false);
  const inFlightRef = useRef(0);
  const sinceConsolidateRef = useRef(0);
  const cardRefs = useRef(new Map());
  const viewportRef = useRef(null);

  // Auto-layout (d3-hierarchy, left-to-right, multi-root) from parent_id, with
  // manual drag overrides. dragPos holds the node currently being dragged so
  // its position (and its connectors) update live before it's persisted.
  const [dragPos, setDragPos] = useState(null); // { id, x, y } | null
  const layoutPositions = useMemo(() => computeLayout(nodes, sizes), [nodes, sizes]);
  const positions = useMemo(
    () =>
      dragPos ? { ...layoutPositions, [dragPos.id]: { x: dragPos.x, y: dragPos.y } } : layoutPositions,
    [layoutPositions, dragPos]
  );

  // Guessed spot for the "Tackling…" ghost card while a node is being
  // classified — just off to the side of whichever node arrived last. Purely
  // decorative; the real node's op replaces it and the layout settles itself.
  const ghostPos = useMemo(() => {
    const last = nodes[nodes.length - 1];
    if (!last) return { x: 80, y: 80 };
    const p = positions[last.id] || { x: 80, y: 80 };
    const size = sizes[last.id] || { w: 224, h: 120 };
    return { x: p.x + size.w + 28, y: p.y };
  }, [nodes, positions, sizes]);

  // Tree edges (a node -> its parent) render solid; everything else (Tier-2
  // cross-links) renders faint + dashed so the primary flow isn't a tangle.
  const treeEdgeIds = useMemo(() => {
    const parentOf = new Map(nodes.map((n) => [n.id, n.parent_id]));
    return new Set(
      edges.filter((e) => parentOf.get(e.to_node_id) === e.from_node_id).map((e) => e.id)
    );
  }, [edges, nodes]);

  // Content bounding box (world space) from computed positions + card sizes.
  const contentBounds = useMemo(() => {
    const ids = Object.keys(positions);
    if (ids.length === 0) return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ids) {
      const p = positions[id];
      const size = sizes[id] || { w: 224, h: 120 };
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + size.w);
      maxY = Math.max(maxY, p.y + size.h);
    }
    return { minX, minY, maxX, maxY };
  }, [positions, sizes]);

  const { transform, handlers: panHandlers, zoomBy, fitToContent, panToWorld, nudgeBy } =
    usePanZoom({ viewportRef, contentBounds });

  // Mirror transform + drag position into refs for the drag handlers
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // Auto-follow: gently nudge the view so a newly-created node stays
  // comfortably visible, without fighting wherever the person is currently
  // looking. Default on; a toggle in the zoom controls lets them turn it off.
  const [autoFollow, setAutoFollow] = useState(true);
  const autoFollowRef = useRef(autoFollow);
  autoFollowRef.current = autoFollow;
  const pendingFollowIdRef = useRef(null);
  const [autoPanning, setAutoPanning] = useState(false);
  const dragPosRef = useRef(null);
  dragPosRef.current = dragPos;
  const dragRef = useRef(null);
  const draggedRef = useRef(false);

  // Frame the content once, the first time nodes appear
  const didFitRef = useRef(false);
  useEffect(() => {
    if (!didFitRef.current && nodes.length > 0 && viewportRef.current) {
      didFitRef.current = true;
      fitToContent();
    }
  }, [nodes.length, fitToContent]);

  // Auto-follow: once a newly-created node's layout position exists, nudge
  // the pan (never the zoom level) just enough to bring it inside a
  // comfortable inset margin of the viewport — if it's already visible in
  // that margin, this does nothing at all, so it never re-centers on top of
  // wherever the person happens to be looking.
  useEffect(() => {
    const id = pendingFollowIdRef.current;
    if (!id) return;
    const p = positions[id];
    const vp = viewportRef.current;
    if (!p || !vp) return; // wait for layout/viewport to be ready
    pendingFollowIdRef.current = null;

    const size = sizes[id] || { w: 224, h: 120 };
    const t = transformRef.current;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const marginX = Math.min(160, vw * 0.15);
    const marginY = Math.min(160, vh * 0.15);
    const sx0 = p.x * t.scale + t.x;
    const sy0 = p.y * t.scale + t.y;
    const sx1 = sx0 + size.w * t.scale;
    const sy1 = sy0 + size.h * t.scale;

    let dx = 0;
    let dy = 0;
    if (sx0 < marginX) dx = marginX - sx0;
    else if (sx1 > vw - marginX) dx = vw - marginX - sx1;
    if (sy0 < marginY) dy = marginY - sy0;
    else if (sy1 > vh - marginY) dy = vh - marginY - sy1;

    if (dx || dy) {
      setAutoPanning(true);
      nudgeBy(dx, dy);
      const timer = setTimeout(() => setAutoPanning(false), 450);
      return () => clearTimeout(timer);
    }
  }, [positions, sizes, nudgeBy]);

  // ---- Ops application: the ONLY way board state changes after initial
  // load. Each op merges into existing state — never a wholesale replace
  // (PLAN.md "Realtime delivery"). All handlers are idempotent so realtime
  // and the fallback poll can overlap safely.
  const applyOp = useCallback((op) => {
    if (!op) return;
    // Dedup by op id so realtime + the fallback poll can overlap and ops can
    // arrive out of seq order (parallel per-utterance calls) without double-
    // applying or being skipped.
    if (op.id) {
      if (appliedOpsRef.current.has(op.id)) return;
      appliedOpsRef.current.add(op.id);
    }
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
        // Only follow genuinely NEW live nodes, not the initial-load replay
        // (same signal NodeCard's pop-in animation already uses).
        if (autoFollowRef.current && initialNodeIds.current && !initialNodeIds.current.has(node.id)) {
          pendingFollowIdRef.current = node.id;
        }
        break;
      }
      case "attach_node": {
        if (payload.action === "expand" && payload.node_id && (payload.summary || payload.title)) {
          setNodes((prev) =>
            prev.map((n) =>
              n.id === payload.node_id
                ? {
                    ...n,
                    ...(payload.summary ? { summary: payload.summary } : {}),
                    ...(payload.title ? { title: payload.title } : {}),
                  }
                : n
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
      case "update_node": {
        if (!payload.node_id) return;
        const patch = payload.patch || {};
        setNodes((prev) =>
          prev.map((n) => (n.id === payload.node_id ? { ...n, ...patch } : n))
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
      case "delete_note": {
        if (!payload.node_id) return;
        setNoteCounts((prev) => ({
          ...prev,
          [payload.node_id]: Math.max(0, (prev[payload.node_id] || 1) - 1),
        }));
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

  // Session record refresh (status chip, live bars) — board state untouched.
  // Guarded against out-of-order responses: the bot-watching 3s poll below
  // and this same function's own call at the end of the wrap-up pass can
  // both be in flight around the moment a meeting ends. If the poll's
  // request happened to resolve AFTER the wrap-up's (plain network timing,
  // nothing to do with which one started first), it would silently
  // overwrite the freshly-"complete" session with a stale "processing"
  // snapshot — which is exactly why the rating popup only ever showed up
  // after a manual revisit (a fresh loadInitial() has no such race) instead
  // of immediately when the meeting actually ended. Only the LATEST
  // outstanding call is allowed to apply its result.
  const sessionFetchSeqRef = useRef(0);
  const refreshSession = useCallback(async () => {
    const seq = ++sessionFetchSeqRef.current;
    const s = await Session.get(sessionId);
    if (seq === sessionFetchSeqRef.current) setSession(s);
    return s;
  }, [sessionId]);

  // Full fetch happens exactly once, on initial page load
  const loadInitial = useCallback(async () => {
    const [s, allNodes, u, allEdges, ops, notes] = await Promise.all([
      Session.get(sessionId),
      Node.filter({ session_id: sessionId }, "created_date", 500),
      Utterance.filter({ session_id: sessionId }, "start_ms", 2000),
      NodeEdge.filter({}, "created_date", 1000),
      SessionOp.filter({ session_id: sessionId }, "-seq", 3000),
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
    // Board state is loaded directly from the tables above; seed the applied-
    // ops set + last seq so the realtime/poll path only applies NEW ops.
    for (const op of ops) appliedOpsRef.current.add(op.id);
    lastSeqRef.current = ops[0]?.seq ?? 0;
    setSession(s);
    setNodes(n);
    setUtterances(u);
    setEdges(e);
    setNoteCounts(counts);
    if (initialNodeIds.current === null) {
      initialNodeIds.current = ids;
      initialEdgeIds.current = new Set(e.map((x) => x.id));
      initialOrderRef.current = buildRevealOrder(n);
    }
    return s;
  }, [sessionId]);

  // Non-owner fallback: only reached once loadInitial() above fails. NOTE:
  // that failure isn't proof the caller is a non-owner — Session.get() 404s
  // identically whether a session truly doesn't exist or RLS is just
  // hiding it, so a transient error (timeout, rate limit, anything) on the
  // owner's OWN load looks exactly the same from here. get-board-access is
  // the tiebreaker: if it resolves this caller as "owner" too, the original
  // failure was spurious — adopt the snapshot but do NOT flip into shared
  // mode (see the caller below), since that would silently downgrade the
  // real owner to polling + wholesale-replace instead of realtime + ops for
  // the rest of the visit. This was a real, shipped bug (see FINDINGS.md)
  // that made solo sessions feel "extremely slow" after a transient hiccup.
  const loadShared = useCallback(async () => {
    const res = await base44.functions.invoke("get-board-access", {
      session_id: sessionId,
    });
    const { role, session: s, nodes: allNodes, edges: allEdges, utterances: u, notes } = res.data;
    const n = allNodes.filter((x) => !x.hidden);
    const ids = new Set(n.map((x) => x.id));
    const counts = {};
    for (const note of notes) {
      seenNoteIdsRef.current.add(note.id);
      if (ids.has(note.node_id)) {
        counts[note.node_id] = (counts[note.node_id] || 0) + 1;
      }
    }
    setSession(s);
    setNodes(n);
    setUtterances(u);
    setEdges(allEdges);
    setNoteCounts(counts);
    setActiveSpeakerEmail(s.active_speaker_email || null);
    if (initialNodeIds.current === null) {
      initialNodeIds.current = ids;
      initialEdgeIds.current = new Set(allEdges.map((x) => x.id));
      initialOrderRef.current = buildRevealOrder(n);
    }
    // Only a genuine non-owner role ever switches the board into
    // shared/polling mode — see the comment above.
    if (role !== "owner") setSharedRole(role);
    return s;
  }, [sessionId]);

  // Initial load + realtime ops subscription
  useEffect(() => {
    let cancelled = false;
    // One quick retry before falling back — loadInitial's Promise.all is 6
    // queries at once, and a single transient failure among them shouldn't
    // immediately assume "not the owner" (see loadShared's comment above).
    loadInitial()
      .catch(() => loadInitial())
      .catch(async () => {
        if (cancelled) return;
        try {
          await loadShared();
        } catch {
          if (!cancelled) setNotFound(true);
        }
      });

    // Realtime only ever makes sense for the owner — a non-owner's own
    // subscription can't see these owner-scoped rows regardless of RLS
    // (see the shared-access poll loop below instead, once sharedRole is known).
    const unsubOps = SessionOp.subscribe((event) => {
      if (event.type !== "create") return;
      if (event.data?.session_id !== sessionId) return;
      applyOp({ ...event.data, id: event.id });
    });

    return () => {
      cancelled = true;
      unsubOps();
    };
  }, [sessionId, loadInitial, loadShared, applyOp]);

  // Shared-access polling — replaces the owner's realtime mechanism with a
  // periodic full-snapshot refresh for a non-owner (an editor/collaborator),
  // since their own realtime subscription can't see owner-scoped rows.
  // Never runs for the owner's own view.
  useEffect(() => {
    if (!sharedRole) return;
    const interval = setInterval(() => {
      loadShared().catch(() => {});
    }, SHARED_POLL_MS);
    return () => clearInterval(interval);
  }, [sharedRole, loadShared]);

  // Owner only: check once whether this board has any collaborators at all,
  // so the mic-lock coordination below only ever activates for a board
  // that's actually shared — a solo session pays zero extra cost.
  useEffect(() => {
    if (sharedRole) return;
    let cancelled = false;
    Collaborator.filter({ session_id: sessionId })
      .then((rows) => !cancelled && setCollaboratorCount(rows.length))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId, sharedRole]);

  // Owner-with-collaborators: lightweight poll for who currently holds the
  // mic. An editor gets this for free from loadShared's own poll above
  // (its snapshot already includes active_speaker_email), so this only
  // needs to run for the owner's side of a shared board.
  useEffect(() => {
    if (sharedRole || collaboratorCount === 0) return;
    let cancelled = false;
    const poll = () =>
      Session.get(sessionId)
        .then((s) => !cancelled && setActiveSpeakerEmail(s.active_speaker_email || null))
        .catch(() => {});
    poll();
    const interval = setInterval(poll, SPEAKER_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, sharedRole, collaboratorCount]);

  // True whenever this board actually has more than one person who might
  // talk — gates the mic-lock claim/release so a plain solo session never
  // pays for the extra round-trip.
  const usesMicLock = sharedRole === "editor" || (!sharedRole && collaboratorCount > 0);

  const claimMic = useCallback(async () => {
    if (!usesMicLock) return true;
    try {
      const res = await base44.functions.invoke("mic-lock", {
        session_id: sessionId,
        action: "claim",
      });
      if (res.data?.claimed) {
        setActiveSpeakerEmail(user?.email || null);
        return true;
      }
      setActiveSpeakerEmail(res.data?.active_speaker_email || null);
      return false;
    } catch {
      return true; // fail open — a lock-check error shouldn't block talking
    }
  }, [usesMicLock, sessionId, user]);

  const releaseMic = useCallback(() => {
    if (!usesMicLock) return;
    base44.functions
      .invoke("mic-lock", { session_id: sessionId, action: "release" })
      .catch(() => {});
    setActiveSpeakerEmail(null);
  }, [usesMicLock, sessionId]);

  // Measure card sizes so edges anchor to real centers
  useEffect(() => {
    const next = {};
    for (const [id, el] of cardRefs.current) {
      if (el) next[id] = { w: el.offsetWidth, h: el.offsetHeight };
    }
    setSizes(next);
  }, [nodes]);

  // User-initiated ops: apply locally now, append to the log so it stays a
  // complete record and other viewers get the change via realtime. Declared
  // early because the live capture handlers below depend on it.
  const appendUserOp = useCallback(
    (op_type, payload) =>
      SessionOp.create({
        session_id: sessionId,
        seq: lastSeqRef.current + 1,
        op_type,
        payload,
        owner_email: session?.owner_email || user?.email,
      }).catch(() => {}),
    [sessionId, user, session]
  );

  // Live capture: batch finalized utterances into ONE classification call per
  // short window instead of one call per utterance (PLAN.md §1d) — every call
  // pays a fixed tool-use/system-prompt overhead regardless of how little it
  // classifies, so firing one call per utterance was paying that overhead far
  // more often than necessary. Utterances still queue and flush in PARALLEL
  // across overlapping windows (never a serial queue waiting on a prior
  // call's round-trip) — the backend atomically claims each utterance, so
  // overlapping calls never double-process or strand rows (PLAN.md "compute
  // in parallel, commit in order"). Board changes arrive as ops via realtime;
  // nothing here re-fetches the board.
  const pendingQueueRef = useRef({ ids: [], provisionals: {} });
  const flushTimerRef = useRef(null);
  // Was 2500ms — real-time feel matters more than the marginal call-count
  // savings from waiting almost 2.5s to batch utterances that usually aren't
  // there yet anyway; BATCH_MAX_SIZE still catches genuine rapid-fire bursts.
  const BATCH_DEBOUNCE_MS = 700;
  const BATCH_MAX_SIZE = 4;

  const liveProcessBatch = useCallback(
    (utteranceIds, provisionals) => {
      if (!utteranceIds.length) return Promise.resolve();
      inFlightRef.current += 1;
      setPhase("mapping");
      return base44.functions
        .invoke("process-session", {
          session_id: sessionId,
          utterance_ids: utteranceIds,
          ...(Object.keys(provisionals).length ? { provisionals } : {}),
        })
        .then((res) => {
          sinceConsolidateRef.current += res.data?.processed ?? 0;
          // Periodic live Tier-2 (merges + longer-distance links). Fire-and-
          // forget so it never blocks live classification. Was every 5
          // utterances; bumped to 20 (PLAN.md §1d cost audit) — Tier-2 firing
          // 6-12x per live session was the single largest cost driver found.
          if (sinceConsolidateRef.current >= 20) {
            sinceConsolidateRef.current = 0;
            base44.functions
              .invoke("consolidate-session", { session_id: sessionId })
              .catch(() => {});
          }
        })
        .catch(() => {
          // Claim is released backend-side on failure; a later pass retries.
        })
        .finally(() => {
          inFlightRef.current = Math.max(0, inFlightRef.current - 1);
          if (inFlightRef.current === 0) setPhase(null);
          const idSet = new Set(utteranceIds);
          setUtterances((prev) =>
            prev.map((u) => (idSet.has(u.id) ? { ...u, processed: true } : u))
          );
        });
    },
    [sessionId]
  );

  const flushQueue = useCallback(() => {
    clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
    const { ids, provisionals } = pendingQueueRef.current;
    if (!ids.length) return Promise.resolve();
    pendingQueueRef.current = { ids: [], provisionals: {} };
    return liveProcessBatch(ids, provisionals);
  }, [liveProcessBatch]);

  // Queue a finalized utterance for the next batched call instead of firing
  // immediately — flushes after BATCH_DEBOUNCE_MS of no new utterance, or the
  // instant the queue hits BATCH_MAX_SIZE, whichever comes first (bounds
  // worst-case added latency to a few seconds either way).
  const queueForProcessing = useCallback(
    (utteranceId, provisionalNodeId) => {
      pendingQueueRef.current.ids.push(utteranceId);
      if (provisionalNodeId) {
        pendingQueueRef.current.provisionals[utteranceId] = provisionalNodeId;
      }
      if (pendingQueueRef.current.ids.length >= BATCH_MAX_SIZE) {
        flushQueue();
        return;
      }
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(flushQueue, BATCH_DEBOUNCE_MS);
    },
    [flushQueue]
  );

  useEffect(() => () => clearTimeout(flushTimerRef.current), []);
  useEffect(() => () => clearTimeout(justTackledTimerRef.current), []);

  const isLive = session?.status === "active";
  const isMicLive = isLive && (session?.capture_source === "mic_live" || micContinuing);
  const isBotLive = isLive && session?.capture_source === "bot_live" && !micContinuing;
  const canContinueByVoice =
    session?.capture_source === "bot_live" && session?.status === "complete" && !micContinuing;
  // A completed personal/import thread has no hold-to-talk bar and no
  // "continue by voice" alternative (that's bot-only) — previously that just
  // left an empty area at the bottom with no indication anything's final.
  const isDeadEnd = session?.status === "complete" && !phase && !canContinueByVoice;

  useEffect(() => {
    if (isDeadEnd && !deadEndHintShownRef.current) {
      deadEndHintShownRef.current = true;
      setShowDeadEndHint(true);
    }
  }, [isDeadEnd]);

  // Fallback ops poll while live: applies any op not already seen (applyOp
  // dedups by id), so a dropped realtime event is caught — never a refetch.
  useEffect(() => {
    if (!isLive) return;
    const poll = setInterval(async () => {
      try {
        const ops = await SessionOp.filter({ session_id: sessionId }, "-seq", 200);
        // Oldest-first so out-of-order arrivals apply cleanly
        ops.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
        for (const op of ops) applyOp(op);
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
      // Queue each fresh utterance for the next batched classification call
      // rather than firing one call per utterance (PLAN.md §1d).
      fresh.forEach((r) => queueForProcessing(r.id));
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
  }, [isBotLive, sessionId, queueForProcessing]);

  // Bot sessions: also watch the Session record itself. The bot leaving the
  // call (host-leave webhook) or Recall's status webhook flips status to
  // "processing" server-side — nothing else in the open board would ever
  // notice that and move off "bot is joining/listening" otherwise. Realtime
  // subscribe for an instant flip, 3s poll as a fallback (same pattern as
  // the utterance ingestion above — service-role writes can lag on realtime).
  useEffect(() => {
    if (!isBotLive) return;
    const unsub = Session.subscribe((event) => {
      if (event.type === "update" && event.id === sessionId) {
        setSession((prev) => (prev ? { ...prev, ...event.data } : prev));
      }
    });
    const poll = setInterval(() => {
      refreshSession().catch(() => {});
    }, 3000);
    return () => {
      unsub();
      clearInterval(poll);
    };
  }, [isBotLive, sessionId, refreshSession]);

  // Mic sessions: staged provisional nodes (PLAN.md).
  // Stage 1 — instant raw placeholder (no LLM) on the first partial words.
  // Stage 2 — debounced classify-partial rough guess (settles early ~90%).
  // Stage 3 — end_of_turn finalizes the SAME node record via process-session.
  const micStartRef = useRef(Date.now());
  const formingIdRef = useRef(null);
  const partialTextRef = useRef("");
  const stage2TimerRef = useRef(null);
  // Stage 2 fires at most ONCE per forming node, not on every debounce tick —
  // repeatedly re-guessing while someone was still mid-sentence was both
  // wasted spend (classify-partial calls that got overwritten moments later)
  // and visibly janky (the type/title kept changing 2-3x before Tier 1 ever
  // finalized it). One rough guess is enough to settle the card; Tier 1 is
  // authoritative regardless (PLAN.md).
  const stage2FiredRef = useRef(false);
  const [settledIds, setSettledIds] = useState(() => new Set());

  const handleMicPartial = useCallback(
    (text) => {
      const t = (text || "").trim();
      partialTextRef.current = t;
      if (t.split(/\s+/).length < 3) return; // wait for a few words

      if (!formingIdRef.current) {
        formingIdRef.current = "pending"; // guard against a create race
        stage2FiredRef.current = false;
        (async () => {
          try {
            const node = await Node.create({
              session_id: sessionId,
              // The session's real owner, not necessarily whoever is
              // currently holding the mic — a collaborator's own email here
              // would strand this node outside the owner's (and other
              // collaborators') $or:[created_by, owner_email] read scope.
              owner_email: session?.owner_email || user?.email,
              type: "waffle",
              title: t.slice(0, 90),
              summary: "",
              status: "na",
              provisional: true,
            });
            formingIdRef.current = node.id;
            setNodes((prev) =>
              prev.some((n) => n.id === node.id) ? prev : [...prev, node]
            );
            appendUserOp("create_node", { node });
          } catch {
            formingIdRef.current = null;
          }
        })();
      } else if (formingIdRef.current !== "pending") {
        const id = formingIdRef.current;
        setNodes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, title: t.slice(0, 90) } : n))
        );
      }

      // Stage 2: one debounced rough guess per forming node (not repeated on
      // every tick — see stage2FiredRef above).
      clearTimeout(stage2TimerRef.current);
      if (stage2FiredRef.current) return;
      stage2TimerRef.current = setTimeout(async () => {
        const id = formingIdRef.current;
        if (!id || id === "pending" || settledIds.has(id) || stage2FiredRef.current) return;
        stage2FiredRef.current = true;
        try {
          const res = await base44.functions.invoke("classify-partial", {
            session_id: sessionId,
            node_id: id,
            text: partialTextRef.current,
          });
          if (res.data?.ok && (res.data.confidence ?? 0) >= 0.9) {
            setSettledIds((prev) => new Set(prev).add(id));
          }
        } catch {
          // ignore — stage 3 is authoritative regardless
        }
      }, 500);
    },
    [sessionId, user, appendUserOp, settledIds]
  );

  const handleMicFinal = useCallback(
    async (turn) => {
      clearTimeout(stage2TimerRef.current);
      const provId =
        formingIdRef.current && formingIdRef.current !== "pending"
          ? formingIdRef.current
          : null;
      formingIdRef.current = null;
      stage2FiredRef.current = false;
      try {
        const utt = await Utterance.create({
          session_id: sessionId,
          // The session's real owner, not necessarily whoever is currently
          // holding the mic — a collaborator's own email here would strand
          // this utterance outside the owner's $or:[created_by, owner_email]
          // read scope, same bug as the provisional-node create above.
          owner_email: session?.owner_email || user?.email,
          speaker_label: session?.owner_email && session.owner_email !== user?.email ? user?.email : "Me",
          text: turn.transcript,
          start_ms: Date.now() - micStartRef.current,
          finalized: true,
          processed: false,
        });
        setUtterances((prev) => [...prev, utt]);
        queueForProcessing(utt.id, provId);
      } catch {
        // dropped utterance — the transcript panel simply won't show it
      }
    },
    [sessionId, user, queueForProcessing]
  );

  const endLiveSession = useCallback(async () => {
    setEnding(true);
    try {
      // Flush any batched-but-not-yet-sent utterances BEFORE flipping status.
      // Without this, a still-queued utterance's provisional node would never
      // get finalized/hidden by this same call (the wrap-up pass below
      // doesn't carry provisional ids), leaving a stray forming placeholder
      // behind alongside the real (freshly created) node.
      await flushQueue();
      // A mic continuation on an originally bot_live session ends like any
      // other mic session — the bot itself is long gone, nothing to tell it.
      if (session?.capture_source === "bot_live" && !micContinuing) {
        await base44.functions.invoke("recall-stop-bot", { session_id: sessionId });
      } else {
        await Session.update(sessionId, {
          status: "processing",
          ended_at: new Date().toISOString(),
        });
      }
      setMicContinuing(false);
      await refreshSession(); // status flip triggers the wrap-up pass below
    } finally {
      setEnding(false);
    }
  }, [session, sessionId, refreshSession, micContinuing, flushQueue]);

  // Re-open a completed meeting for mic capture — same lifecycle a personal
  // session uses (active -> processing -> complete), just re-entered from
  // "complete" instead of started fresh. billed_ms accumulates correctly
  // since it's recomputed from ALL utterances in the session on completion.
  const startMicContinuation = useCallback(async () => {
    await Session.update(sessionId, { status: "active" });
    setMicContinuing(true);
    micStartRef.current = Date.now();
    await refreshSession();
  }, [sessionId, refreshSession]);

  // Auto-select a node when arriving from search (?node=...)
  const wantedNodeRef = useRef(searchParams.get("node"));
  useEffect(() => {
    if (wantedNodeRef.current && nodes.some((n) => n.id === wantedNodeRef.current)) {
      selectNode(wantedNodeRef.current);
      wantedNodeRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // Live catch-up: queue every unprocessed utterance left over from a
  // previous visit (each claims its own row, so this is safe) — batched
  // through the same queue as live capture rather than one call each.
  const caughtUpRef = useRef(false);
  useEffect(() => {
    if (isLive && !caughtUpRef.current) {
      const stale = utterances.filter((u) => !u.processed);
      if (stale.length) {
        caughtUpRef.current = true;
        stale.forEach((u) => queueForProcessing(u.id));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, utterances]);

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
          // Fetch directly rather than refreshSession() — that setState's the
          // shared `session` (a dependency of this very effect), which tears
          // this effect down (cleanup sets `stopped = true`) while
          // consolidate-session is still in flight below. The `finally`
          // block's `setPhase(null)` would then get skipped by that same
          // `stopped` flag, leaving the header stuck on "Linking ideas…"
          // forever even though the backend call finished fine (confirmed:
          // a real zero-node session's consolidated_at got stamped
          // correctly, but the UI never noticed). Read-only fetch here,
          // shared state is refreshed once for real in the finally block.
          const s = await Session.get(sessionId);
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
          setJustTackled(true);
          clearTimeout(justTackledTimerRef.current);
          justTackledTimerRef.current = setTimeout(() => setJustTackled(false), 3000);
          refreshSession().catch(() => {});
          setUtterances((prev) => prev.map((u) => ({ ...u, processed: true })));
        }
      }
    })();

    return () => {
      stopped = true;
    };
  }, [session, sessionId, refreshSession]);

  // Post-session rating prompt — once per session, for live capture (bot
  // meetings or solo talk — not pasted imports, which don't really "end"),
  // only after it's actually finished processing and not already rated.
  // sessionStorage remembers a dismiss so reopening the board later doesn't
  // nag again; an actual rating is permanent on the Session record.
  useEffect(() => {
    if (!session) return;
    if (session.capture_source !== "bot_live" && session.capture_source !== "mic_live") return;
    if (session.status !== "complete" || session.rating != null) return;
    const dismissKey = `tackly:rating-dismissed:${sessionId}`;
    if (sessionStorage.getItem(dismissKey)) return;
    setShowRating(true);
  }, [session, sessionId]);

  const ratingCounts = useMemo(() => {
    const count = (type) => nodes.filter((n) => !n.hidden && n.type === type).length;
    return {
      ideas: count("idea"),
      decisions: count("decision"),
      questions: count("question"),
      actions: count("action"),
    };
  }, [nodes]);

  const submitRating = useCallback(
    async (rating, feedback) => {
      try {
        await Session.update(sessionId, { rating, rating_feedback: feedback || undefined });
      } catch {
        // rating is a nice-to-have, never block the board on it
      }
      setTimeout(() => setShowRating(false), 1400);
    },
    [sessionId]
  );

  const dismissRating = useCallback(() => {
    sessionStorage.setItem(`tackly:rating-dismissed:${sessionId}`, "1");
    setShowRating(false);
  }, [sessionId]);

  const selectNode = useCallback(
    (id) => {
      setSelectedId(id);
      const p = positions[id];
      if (p) {
        const size = sizes[id] || { w: 224, h: 120 };
        panToWorld(p.x + size.w / 2, p.y + size.h / 2);
      }
    },
    [positions, sizes, panToWorld]
  );

  // Node dragging: move a node, persist pos_x/pos_y, connectors recalc live.
  const onNodeDragMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    const scale = transformRef.current.scale || 1;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) {
      draggedRef.current = true;
    }
    setDragPos({
      id: d.id,
      x: d.ox + (e.clientX - d.sx) / scale,
      y: d.oy + (e.clientY - d.sy) / scale,
    });
  }, []);

  const onNodeDragEnd = useCallback(() => {
    window.removeEventListener("pointermove", onNodeDragMove);
    window.removeEventListener("pointerup", onNodeDragEnd);
    const d = dragRef.current;
    dragRef.current = null;
    const finalPos = dragPosRef.current;
    if (d && draggedRef.current && finalPos) {
      const pos_x = finalPos.x;
      const pos_y = finalPos.y;
      setNodes((prev) =>
        prev.map((n) => (n.id === d.id ? { ...n, pos_x, pos_y } : n))
      );
      Node.update(d.id, { pos_x, pos_y }).catch(() => {});
    }
    setDragPos(null);
  }, [onNodeDragMove]);

  const startNodeDrag = useCallback(
    (e, id) => {
      if (e.button != null && e.button !== 0) return;
      e.stopPropagation();
      const p = positions[id];
      if (!p) return;
      draggedRef.current = false;
      dragRef.current = { id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y };
      window.addEventListener("pointermove", onNodeDragMove);
      window.addEventListener("pointerup", onNodeDragEnd);
    },
    [positions, onNodeDragMove, onNodeDragEnd]
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
        owner_email: session?.owner_email || user?.email,
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

  const deleteNote = useCallback(
    async (nodeId, noteId) => {
      setNoteCounts((prev) => ({
        ...prev,
        [nodeId]: Math.max(0, (prev[nodeId] || 1) - 1),
      }));
      await NodeNote.delete(noteId);
      appendUserOp("delete_note", { node_id: nodeId, note_id: noteId });
    },
    [appendUserOp]
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
      const base = (session?.title || "tackly-board")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 60) || "tackly-board";
      if (format === "md") {
        exportMarkdown(boardToMarkdown(session?.title, nodes, edges), `${base}.md`);
        return;
      }
      const svg = boardToSvg(nodes, edges, sizes, positions, noteCounts, treeEdgeIds);
      if (!svg) return;
      if (format === "svg") exportSvg(svg, `${base}.svg`);
      else await exportPng(svg, `${base}.png`);
    },
    [nodes, edges, sizes, positions, session, noteCounts, treeEdgeIds]
  );

  if (notFound) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper">
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
    <div className="relative flex h-dvh flex-col bg-paper">
      {/* Overlay, not an early return — the canvas div below (and its
          viewportRef) must mount on the very first render so usePanZoom's
          wheel listener attaches to the real node instead of a still-null
          ref. See BoardLoadingScreen's comment for the full story. */}
      {!session && <BoardLoadingScreen className="absolute inset-0 z-40" />}
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
          {!phase && justTackled && (
            <span className="flex items-center gap-2 rounded-full border-2 border-ink bg-note-mint px-3 py-1 text-xs font-bold text-ink shadow-brutal-sm animate-fade-up">
              Tackled 👀
            </span>
          )}
          {!sharedRole && session && (
            <ShareDropdown
              session={session}
              onSessionChange={setSession}
              onEndSession={endLiveSession}
            />
          )}
          <TacklyAIPanel
            sessionId={sessionId}
            sessionTitle={session?.title}
            open={assistantOpen}
            onOpenChange={setAssistantOpen}
          />

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
                  <button
                    onClick={() => runExport("md")}
                    className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm font-medium text-ink hover:bg-note-lavender"
                  >
                    <FileText className="h-4 w-4" /> Markdown
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
          onPointerCancel={panHandlers.onPointerCancel}
          className="h-full touch-none cursor-grab overflow-hidden active:cursor-grabbing"
          style={{
            backgroundImage: "radial-gradient(circle, #E8E4DC 1px, transparent 1px)",
            backgroundSize: `${24 * transform.scale}px ${24 * transform.scale}px`,
            backgroundPosition: `${transform.x}px ${transform.y}px`,
          }}
        >
          <div
            className={`absolute left-0 top-0 origin-top-left ${
              autoPanning ? "transition-transform duration-[450ms] ease-out" : ""
            }`}
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              width: CANVAS_W,
              height: CANVAS_H,
            }}
          >
            <EdgeLayer
              edges={edges}
              positions={positions}
              sizes={sizes}
              treeEdgeIds={treeEdgeIds}
              animateDelays={
                new Map(
                  edges.map((e) => [
                    e.id,
                    edgeRevealDelay(initialOrderRef.current, initialEdgeIds.current, e),
                  ])
                )
              }
              width={CANVAS_W}
              height={CANVAS_H}
            />
            {nodes.map((node) => {
              const p = positions[node.id] || { x: 80, y: 80 };
              return (
                <div
                  key={node.id}
                  data-node
                  onPointerDown={(e) => startNodeDrag(e, node.id)}
                  className={`absolute touch-none ${
                    dragPos?.id === node.id ? "cursor-grabbing" : "cursor-grab"
                  }`}
                  style={{ left: p.x, top: p.y }}
                >
                  <NodeCard
                    ref={(el) => {
                      if (el) cardRefs.current.set(node.id, el);
                      else cardRefs.current.delete(node.id);
                    }}
                    node={node}
                    noteCount={noteCounts[node.id] || 0}
                    forming={!!node.provisional && !settledIds.has(node.id)}
                    animate
                    delayMs={nodeRevealDelay(initialOrderRef.current, node.id)}
                    className={selectedId === node.id ? "shadow-brutal-lg ring-2 ring-periwinkle" : ""}
                    onNotesClick={(id) => setNoteModalNodeId(id)}
                    onClick={() => {
                      // Suppress the click that follows a drag
                      if (draggedRef.current) {
                        draggedRef.current = false;
                        return;
                      }
                      setShowTranscript(false);
                      setSelectedId((cur) => (cur === node.id ? null : node.id));
                    }}
                  />
                </div>
              );
            })}
            {phase === "mapping" && (
              <div className="absolute" style={{ left: ghostPos.x, top: ghostPos.y }}>
                <GhostNodeCard />
              </div>
            )}
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

          {(isMicLive || isBotLive) && !showTranscript && (
            <FloatingTranscript
              utterances={utterances}
              onExpand={() => setShowTranscript(true)}
            />
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
            {(isMicLive || isBotLive) && (
              <button
                onClick={() => setAutoFollow((v) => !v)}
                title={autoFollow ? "Auto-follow new nodes: on" : "Auto-follow new nodes: off"}
                aria-pressed={autoFollow}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 border-ink shadow-brutal-sm transition-transform hover:-translate-y-px ${
                  autoFollow ? "bg-periwinkle text-white" : "bg-paper-raised text-ink"
                }`}
              >
                <Locate className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {isLive && <LiveUtteranceFeed utterances={utterances} />}
        {isMicLive && (
          <MicBar
            onFinalTurn={handleMicFinal}
            onPartial={handleMicPartial}
            onEnd={endLiveSession}
            ending={ending}
            onClaimMic={usesMicLock ? claimMic : undefined}
            onReleaseMic={usesMicLock ? releaseMic : undefined}
            blockedBy={
              usesMicLock && activeSpeakerEmail && activeSpeakerEmail !== user?.email
                ? activeSpeakerEmail
                : null
            }
          />
        )}
        {isBotLive && (
          <BotBar
            onEnd={endLiveSession}
            ending={ending}
            hasUtterances={utterances.length > 0}
          />
        )}
        {canContinueByVoice && (
          <button
            onClick={startMicContinuation}
            className="absolute inset-x-0 bottom-5 z-10 mx-auto flex h-12 w-fit items-center gap-2 rounded-xl border-2 border-ink bg-note-lavender px-6 text-sm font-bold text-ink shadow-brutal-sm transition-transform hover:-translate-y-0.5"
          >
            <Mic className="h-4 w-4" />
            Continue this thread by voice
          </button>
        )}
        {isDeadEnd && (
          <>
            {showDeadEndHint && (
              <div className="absolute inset-x-0 bottom-20 z-10 flex justify-center px-4">
                <div className="flex max-w-md items-start gap-2 rounded-xl border-2 border-ink bg-paper-raised px-3.5 py-2 text-sm font-medium text-ink shadow-brutal-sm animate-fade-up">
                  <span className="flex-1 text-center">
                    You can still add notes if you need to, otherwise create a new thread or speak with your AI
                    Assistant.
                  </span>
                  <button
                    onClick={() => setShowDeadEndHint(false)}
                    title="Dismiss"
                    className="shrink-0 rounded-full p-0.5 text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-5 z-10 mx-auto flex w-fit flex-col items-center gap-2 sm:flex-row sm:gap-3">
              <div className="flex h-12 items-center gap-2 rounded-xl border-2 border-ink bg-paper-sunken px-6 text-sm font-bold text-ink-soft shadow-brutal-sm">
                This thread has been tackled 👀
              </div>
              <button
                onClick={() => setAssistantOpen(true)}
                className="flex h-12 items-center gap-2 rounded-xl border-2 border-ink bg-periwinkle px-5 text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5"
              >
                <Sparkles className="h-4 w-4" />
                AI Assistant
              </button>
            </div>
          </>
        )}
        {showRating && (
          <RatingModal
            counts={ratingCounts}
            meeting={session?.capture_source === "bot_live"}
            onSubmit={submitRating}
            onDismiss={dismissRating}
          />
        )}
        {noteModalNodeId && nodes.some((n) => n.id === noteModalNodeId) && (
          <AddNoteModal
            node={nodes.find((n) => n.id === noteModalNodeId)}
            onAddNote={addNote}
            onDeleteNote={deleteNote}
            onClose={() => setNoteModalNodeId(null)}
          />
        )}
        {!showRating && <QuotaWarningModal />}

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
              onDeleteNote={deleteNote}
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
