// Connectors between node cards: soft arched cubic-bezier paths, no arrowheads
// (matches the reference tool's style). Positions come from the live layout map
// so a dragged node's connectors recalculate off its actual current spot.

export function EdgeLayer({ edges, positions, sizes, animateIds, width, height }) {
  const rect = (id) => {
    const p = positions[id];
    if (!p) return null;
    const s = sizes[id] || { w: 224, h: 110 };
    return { x: p.x, y: p.y, w: s.w, h: s.h, cx: p.x + s.w / 2, cy: p.y + s.h / 2 };
  };

  return (
    <svg
      width={width}
      height={height}
      className="pointer-events-none absolute inset-0 overflow-visible"
      aria-hidden="true"
    >
      {edges.map((edge) => {
        const a = rect(edge.from_node_id);
        const b = rect(edge.to_node_id);
        if (!a || !b) return null;

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

        return (
          <path
            key={edge.id}
            d={d}
            fill="none"
            stroke="#26241F"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.32"
            pathLength="1"
            className={animateIds?.has(edge.id) ? "edge-animate" : ""}
          />
        );
      })}
    </svg>
  );
}
