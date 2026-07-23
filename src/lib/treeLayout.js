import { hierarchy, tree } from "d3-hierarchy";

// Compute board positions with d3-hierarchy: a left-to-right tree, supporting
// multiple independent root branches (stacked vertically). A node dragged by
// the user (pos_x/pos_y set) overrides its auto-computed spot; everything else
// flows from parent_id. Returns { [nodeId]: { x, y } } in world space.

const ROW_GAP = 150; // vertical spacing between siblings (breadth)
const COL_GAP = 340; // horizontal spacing between depths (parent -> child)
const ORIGIN_X = 120;
const ORIGIN_Y = 160;

export function computeLayout(nodes) {
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
  // branches lay out together without overlapping.
  const root = hierarchy(
    { id: "__super__" },
    (d) =>
      (d.id === "__super__" ? roots : childrenOf.get(d.id) || []).map((id) => ({
        id,
      }))
  );

  tree().nodeSize([ROW_GAP, COL_GAP])(root);

  let minX = Infinity;
  let minY = Infinity;
  root.each((d) => {
    if (d.data.id === "__super__") return;
    // Rotate to left-to-right: d3 depth (d.y) -> screen X, breadth (d.x) -> screen Y
    const x = d.y;
    const y = d.x;
    positions[d.data.id] = { x, y };
    if (x < minX) minX = x;
    if (y < minY) minY = y;
  });

  // Shift so the whole tree sits at a stable origin (breadth can go negative)
  const dx = ORIGIN_X - (isFinite(minX) ? minX : 0);
  const dy = ORIGIN_Y - (isFinite(minY) ? minY : 0);
  for (const id of Object.keys(positions)) {
    positions[id].x += dx;
    positions[id].y += dy;
  }

  // Manual drag overrides win over the auto layout
  for (const n of nodes) {
    if (typeof n.pos_x === "number" && typeof n.pos_y === "number") {
      positions[n.id] = { x: n.pos_x, y: n.pos_y };
    }
  }

  return positions;
}
