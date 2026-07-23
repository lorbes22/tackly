// Connectors between node cards: soft arched cubic-bezier paths, no arrowheads
// (matches the reference tool's style). Positions come from the live layout map
// so a dragged node's connectors recalculate off its actual current spot.
// The parent tree edges render solid; secondary cross-links (Tier-2) render
// faint + dashed so the primary flow reads clearly instead of a tangle.
//
// "Smart connect" labels: a small pill at the midpoint of a connector naming
// the relation (blocks/causes/supports/contradicts/answers/expands) — smaller
// and quieter than a full node, only shown for relations with real semantic
// weight. The generic default relations (leads_to, relates_to) stay unlabeled
// to avoid cluttering every single connector.
const RELATION_LABELS = {
  expands: "expands",
  answers: "answers",
  supports: "supports",
  contradicts: "contradicts",
  causes: "causes",
  blocks: "blocks",
};

export function EdgeLayer({
  edges,
  positions,
  sizes,
  animateIds,
  treeEdgeIds,
  width,
  height,
}) {
  const rect = (id) => {
    const p = positions[id];
    if (!p) return null;
    const s = sizes[id] || { w: 224, h: 110 };
    return { x: p.x, y: p.y, w: s.w, h: s.h, cx: p.x + s.w / 2, cy: p.y + s.h / 2 };
  };

  // Draw cross-links first so the solid tree edges sit on top
  const ordered = [...edges].sort((e1, e2) => {
    const t1 = treeEdgeIds?.has(e1.id) ? 1 : 0;
    const t2 = treeEdgeIds?.has(e2.id) ? 1 : 0;
    return t1 - t2;
  });

  return (
    <svg
      width={width}
      height={height}
      className="pointer-events-none absolute inset-0 overflow-visible"
      aria-hidden="true"
    >
      {ordered.map((edge) => {
        const a = rect(edge.from_node_id);
        const b = rect(edge.to_node_id);
        if (!a || !b) return null;
        const isTree = !treeEdgeIds || treeEdgeIds.has(edge.id);

        // Exit/enter on the facing sides so the arch reads as flowing between
        // cards rather than through them. Normal tree flow is left-to-right.
        const rightward = b.cx >= a.cx;
        const x1 = rightward ? a.x + a.w : a.x;
        const y1 = a.cy;
        const x2 = rightward ? b.x : b.x + b.w;
        const y2 = b.cy;

        // Horizontal-tangent cubic bezier → a soft S-curve arch
        const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
        const c1x = rightward ? x1 + dx : x1 - dx;
        const c2x = rightward ? x2 - dx : x2 + dx;
        const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${c1x.toFixed(1)} ${y1.toFixed(1)}, ${c2x.toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;

        const label = RELATION_LABELS[edge.relation];
        // Cubic bezier midpoint at t=0.5: B = 0.125 P0 + 0.375 P1 + 0.375 P2 + 0.125 P3
        const mx = 0.125 * x1 + 0.375 * c1x + 0.375 * c2x + 0.125 * x2;
        const my = 0.5 * y1 + 0.5 * y2;
        const labelW = label ? label.length * 5.2 + 12 : 0;

        return (
          <g key={edge.id}>
            <path
              d={d}
              fill="none"
              stroke="#26241F"
              strokeWidth={isTree ? 2 : 1.5}
              strokeLinecap="round"
              strokeDasharray={isTree ? undefined : "2 7"}
              opacity={isTree ? 0.32 : 0.16}
              pathLength="1"
              className={animateIds?.has(edge.id) ? "edge-animate" : ""}
            />
            {label && (
              <g opacity={isTree ? 0.85 : 0.55}>
                <rect
                  x={mx - labelW / 2}
                  y={my - 8}
                  width={labelW}
                  height={16}
                  rx={8}
                  fill="#FAF8F4"
                  stroke="#26241F"
                  strokeWidth="1"
                />
                <text
                  x={mx}
                  y={my + 3}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill="#26241F"
                  fontFamily="Inter, sans-serif"
                  letterSpacing="0.02em"
                >
                  {label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
