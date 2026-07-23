// Export the board as a self-contained SVG (lossless) or PNG (rasterized from
// that same SVG). No external deps: nodes and edges are rebuilt as plain SVG
// shapes + text, so canvas rasterization stays untainted.

const TYPE_HEX = {
  idea: "#E6E1F8",
  fact: "#DCEFE3",
  opinion: "#FADCEB",
  question: "#FCE8C8",
  decision: "#DBEAF9",
  risk: "#F7DFDA",
  action: "#F9EDAF",
  aside: "#E9E7E2",
};
const TYPE_LABEL = {
  idea: "IDEA",
  fact: "FACT",
  opinion: "OPINION",
  question: "QUESTION",
  decision: "DECISION",
  risk: "RISK",
  action: "ACTION",
  aside: "ASIDE",
};
const INK = "#26241F";
const PAPER = "#FAF8F4";
const PAD = 80;
const CARD_W = 224;
const CARD_H = 120;

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Greedy word-wrap to a rough character budget per line
function wrap(text, maxChars, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > maxChars) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines - 1) break;
    } else {
      line = line ? line + " " + w : w;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.length) {
    const used = lines.join(" ").split(/\s+/).length;
    if (used < words.length) lines[maxLines - 1] = lines[maxLines - 1] + "…";
  }
  return lines;
}

export function boardToSvg(nodes, edges, sizes = {}, positions = {}) {
  if (nodes.length === 0) return null;
  const sz = (id) => sizes[id] || { w: CARD_W, h: CARD_H };
  const px = (n) => positions[n.id]?.x ?? n.position_x ?? 80;
  const py = (n) => positions[n.id]?.y ?? n.position_y ?? 80;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const x = px(n);
    const y = py(n);
    const s = sz(n.id);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + s.w);
    maxY = Math.max(maxY, y + s.h);
  }
  const vbX = minX - PAD;
  const vbY = minY - PAD;
  const vbW = maxX - minX + PAD * 2;
  const vbH = maxY - minY + PAD * 2;

  const centers = new Map(
    nodes.map((n) => {
      const s = sz(n.id);
      return [n.id, { x: px(n) + s.w / 2, y: py(n) + s.h / 2 }];
    })
  );

  // Edges (straight ink lines with arrowheads, trimmed to card borders)
  const edgeSvg = edges
    .map((e) => {
      const f = centers.get(e.from_node_id);
      const t = centers.get(e.to_node_id);
      if (!f || !t) return "";
      const dx = t.x - f.x, dy = t.y - f.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const trim = (id, m) => {
        const s = sz(id);
        const hw = s.w / 2 + m, hh = s.h / 2 + m;
        return Math.min(ux !== 0 ? hw / Math.abs(ux) : 1e9, uy !== 0 ? hh / Math.abs(uy) : 1e9);
      };
      const st = trim(e.from_node_id, 4), en = trim(e.to_node_id, 8);
      if (st + en >= len) return "";
      return `<line x1="${(f.x + ux * st).toFixed(1)}" y1="${(f.y + uy * st).toFixed(1)}" x2="${(t.x - ux * en).toFixed(1)}" y2="${(t.y - uy * en).toFixed(1)}" stroke="${INK}" stroke-width="2" opacity="0.35" marker-end="url(#arrow)" />`;
    })
    .join("");

  // Nodes as neubrutal cards
  const nodeSvg = nodes
    .map((n) => {
      const s = sz(n.id);
      const x = px(n);
      const y = py(n);
      const rot = n.rotation_deg || 0;
      const fill = TYPE_HEX[n.type] || TYPE_HEX.idea;
      const dashed =
        n.status === "open" && (n.type === "question" || n.type === "risk");
      const titleLines = wrap(n.title, 26, 2);
      const summaryLines = n.summary ? wrap(n.summary, 34, 3) : [];
      let ty = 44;
      const titleSvg = titleLines
        .map((l) => {
          const line = `<text x="14" y="${ty}" font-family="Gabarito, sans-serif" font-size="15" font-weight="700" fill="${INK}">${esc(l)}</text>`;
          ty += 19;
          return line;
        })
        .join("");
      ty += 2;
      const summarySvg = summaryLines
        .map((l) => {
          const line = `<text x="14" y="${ty}" font-family="Inter, sans-serif" font-size="11.5" fill="${INK}" opacity="0.72">${esc(l)}</text>`;
          ty += 15;
          return line;
        })
        .join("");
      return `<g transform="translate(${x} ${y}) rotate(${rot} ${s.w / 2} ${s.h / 2})">
  <rect x="4" y="4" width="${s.w}" height="${s.h}" rx="10" fill="${INK}" />
  <rect x="0" y="0" width="${s.w}" height="${s.h}" rx="10" fill="${fill}" stroke="${INK}" stroke-width="2"${dashed ? ' stroke-dasharray="6 4"' : ""} />
  <text x="14" y="22" font-family="Inter, sans-serif" font-size="9" font-weight="700" letter-spacing="1.5" fill="${INK}" opacity="0.6">${TYPE_LABEL[n.type] || "NODE"}</text>
  ${titleSvg}${summarySvg}
</g>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="${vbW}" height="${vbH}">
  <defs>
    <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0.5 L7,4 L0,7.5" fill="none" stroke="${INK}" stroke-width="1.4" opacity="0.45" />
    </marker>
  </defs>
  <rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="${PAPER}" />
  <g>${edgeSvg}</g>
  <g>${nodeSvg}</g>
</svg>`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSvg(svg, filename) {
  if (!svg) return;
  triggerDownload(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), filename);
}

export async function exportPng(svg, filename, scale = 2) {
  if (!svg) return;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    await new Promise((resolve) =>
      canvas.toBlob((b) => {
        if (b) triggerDownload(b, filename);
        resolve();
      }, "image/png")
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
