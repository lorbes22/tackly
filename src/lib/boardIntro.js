// The "replay" reveal effect used the first time a board's initial data
// lands — nodes pop in one by one in creation order, with each edge
// connecting right after both its endpoints have appeared. Deliberately
// pure/delay-only: every node and edge mounts into the DOM immediately at
// its final layout position, so nothing here ever re-triggers d3-hierarchy
// layout or causes positions to shift mid-reveal — only a CSS
// animation-delay changes, which is why this is safe to run on every board
// load without repeating the real-time performance regression (see
// FINDINGS.md) that came from the rendering pipeline doing real work on a
// timer.
const STAGGER_MS = 70;
const MAX_TOTAL_MS = 2200;
const EDGE_OFFSET_MS = 40;

// nodes: array of { id, created_date }. Returns Map<nodeId, orderIndex>.
export function buildRevealOrder(nodes) {
  const ordered = [...nodes].sort(
    (a, b) => new Date(a.created_date) - new Date(b.created_date)
  );
  const order = new Map();
  ordered.forEach((node, i) => order.set(node.id, i));
  return order;
}

// ms delay before this node's pop-in animation starts. Nodes outside the
// initial order (added live afterward) get 0 — instant, matching the
// existing live-append behavior exactly.
export function nodeRevealDelay(order, nodeId) {
  if (!order || !order.has(nodeId)) return 0;
  const count = order.size;
  const per = count > 1 ? Math.min(STAGGER_MS, MAX_TOTAL_MS / count) : 0;
  return Math.round(order.get(nodeId) * per);
}

// ms delay before this edge "connects" — right after both its endpoint
// nodes have appeared. Only edges present at initial load are staggered;
// edges added later keep the existing instant-connect behavior (delay 0).
export function edgeRevealDelay(order, initialEdgeIds, edge) {
  if (!initialEdgeIds || !initialEdgeIds.has(edge.id)) return 0;
  return (
    Math.max(
      nodeRevealDelay(order, edge.from_node_id),
      nodeRevealDelay(order, edge.to_node_id)
    ) + EDGE_OFFSET_MS
  );
}
