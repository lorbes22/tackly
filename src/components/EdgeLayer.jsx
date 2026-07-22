// Connectors between node cards: straight ink lines with an arrowhead,
// drawn under the cards. New edges draw themselves in gently.

export function EdgeLayer({ edges, nodes, sizes, animateIds, width, height }) {
  const centers = new Map(
    nodes.map((n) => {
      const size = sizes[n.id] || { w: 224, h: 110 };
      return [
        n.id,
        { x: (n.position_x ?? 80) + size.w / 2, y: (n.position_y ?? 80) + size.h / 2 },
      ];
    })
  );

  return (
    <svg
      width={width}
      height={height}
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="edge-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0.5 L7,4 L0,7.5" fill="none" stroke="#26241F" strokeWidth="1.4" opacity="0.45" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const from = centers.get(edge.from_node_id);
        const to = centers.get(edge.to_node_id);
        if (!from || !to) return null;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        // Trim each end where the line crosses that card's border (+margin)
        const borderDist = (id, margin) => {
          const size = sizes[id] || { w: 224, h: 110 };
          const hw = size.w / 2 + margin;
          const hh = size.h / 2 + margin;
          return Math.min(
            ux !== 0 ? hw / Math.abs(ux) : Infinity,
            uy !== 0 ? hh / Math.abs(uy) : Infinity
          );
        };
        const startTrim = borderDist(edge.from_node_id, 4);
        const endTrim = borderDist(edge.to_node_id, 8);
        if (startTrim + endTrim >= len) return null; // cards overlap
        return (
          <line
            key={edge.id}
            x1={from.x + ux * startTrim}
            y1={from.y + uy * startTrim}
            x2={to.x - ux * endTrim}
            y2={to.y - uy * endTrim}
            stroke="#26241F"
            strokeWidth="2"
            opacity="0.3"
            pathLength="1"
            markerEnd="url(#edge-arrow)"
            className={animateIds?.has(edge.id) ? "edge-animate" : ""}
          />
        );
      })}
    </svg>
  );
}
