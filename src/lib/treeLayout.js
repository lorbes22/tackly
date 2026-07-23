import { hierarchy, tree } from "d3-hierarchy";

// Compute board positions with d3-hierarchy: a left-to-right tree, supporting
// multiple independent root branches (stacked vertically). A node dragged by
// the user (pos_x/pos_y set) overrides its auto-computed spot; everything else
// flows from parent_id. Returns { [nodeId]: { x, y } } in world space.
//
// Vertical (breadth) spacing is SIZE-AWARE: d3's tree() only reserves a fixed
// slot per node (nodeSize), which doesn't know a card's actual rendered
// height. Cards vary from ~90px (no summary) to ~180px (2-line title + 3-line
// summary), and a fixed slot smaller than that caused siblings to visually
// overlap. So d3 is used only to get topology (depth) and a sensible breadth
// ORDER (its `x`, which keeps subtrees grouped/centered) — the actual Y
// coordinate is then assigned by walking each depth column in that order and
// stacking with the real measured height (or a safe fallback) + a margin.

const COL_GAP = 340; // horizontal spacing between depths
const ORIGIN_X = 120;
const ORIGIN_Y = 160;
const DEFAULT_H = 150; // fallback card height before it's been measured
const MIN_H = 90; // shortest a real card ever renders (no summary)
const MARGIN_Y = 26; // breathing room between stacked siblings

export function computeLayout(nodes, sizes = {}) {
  const positions = {};
  if (!nodes || nodes.length === 0) return positions;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map();
  const roots = [];
  for (const n of nodes) {
    const pid = n.parent_id && byId.has(n.parent_id) ? n.parent_id : null;
    if (pid) {
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid).push(n.id);
    } else {
      roots.push(n.id);
    }
  }

  // Single synthetic super-root over all real roots so multiple independent
  // branches lay out together (d3 keeps them from crossing/overlapping).
  const root = hierarchy(
    { id: "__super__" },
    (d) =>
      (d.id === "__super__" ? roots : childrenOf.get(d.id) || []).map((id) => ({
        id,
      }))
  );

  // nodeSize here only drives d3's internal breadth ORDERING math, not the
  // final coordinates we use — a placeholder gap is fine.
  tree().nodeSize([DEFAULT_H + MARGIN_Y, COL_GAP])(root);

  // Group every real node by real depth (super-root is depth 0, so subtract 1)
  const byDepth = new Map(); // depth -> [{ id, order }]
  root.each((d) => {
    if (d.data.id === "__super__") return;
    const depth = d.depth - 1;
    if (!byDepth.has(depth)) byDepth.set(depth, []);
    byDepth.get(depth).push({ id: d.data.id, order: d.x });
  });

  const cardHeight = (id) => {
    const h = sizes[id]?.h;
    return typeof h === "number" && h > 0 ? Math.max(h, MIN_H) : DEFAULT_H;
  };

  for (const [depth, entries] of byDepth) {
    // Preserve d3's breadth order (keeps related subtrees grouped/centered),
    // then stack top-to-bottom using each card's REAL height.
    entries.sort((a, b) => a.order - b.order);
    let cursorY = ORIGIN_Y;
    for (const { id } of entries) {
      positions[id] = { x: ORIGIN_X + depth * COL_GAP, y: cursorY };
      cursorY += cardHeight(id) + MARGIN_Y;
    }
  }

  // Manual drag overrides win over the auto layout
  for (const n of nodes) {
    if (typeof n.pos_x === "number" && typeof n.pos_y === "number") {
      positions[n.id] = { x: n.pos_x, y: n.pos_y };
    }
  }

  return positions;
}
