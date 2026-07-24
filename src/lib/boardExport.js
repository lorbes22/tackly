// Export the board as a self-contained SVG (lossless) or PNG (rasterized from
// that same SVG). No external deps: nodes and edges are rebuilt as plain SVG
// shapes + text, so canvas rasterization stays untainted.

const TYPE_HEX = {
  topic: "#D6EEEB",
  idea: "#E6E1F8",
  evidence: "#DCEFE3",
  opinion: "#FADCEB",
  question: "#FCE8C8",
  decision: "#DBEAF9",
  risk: "#F7DFDA",
  action: "#F9EDAF",
  waffle: "#E9E7E2",
  // Legacy aliases for nodes created before the taxonomy rename
  fact: "#DCEFE3",
  aside: "#E9E7E2",
};
const TYPE_LABEL = {
  topic: "TOPIC",
  idea: "IDEA",
  evidence: "EVIDENCE",
  opinion: "OPINION",
  question: "QUESTION",
  decision: "DECISION",
  risk: "RISK",
  action: "ACTION",
  waffle: "WAFFLE",
  fact: "EVIDENCE",
  aside: "WAFFLE",
};
const INK = "#26241F";
const PAPER = "#FAF8F4";
const GOLD = "#F9EDAF";
const PAD = 80;
const CARD_W = 224;
const CARD_H = 120;

// Same relation vocabulary + labels as EdgeLayer, so exports show the same
// smart-connect pills instead of going unlabeled.
const RELATION_LABELS = {
  expands: "expands",
  answers: "answers",
  supports: "supports",
  contradicts: "contradicts",
  causes: "causes",
  blocks: "blocks",
  addresses: "addresses",
};

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

export function boardToSvg(nodes, edges, sizes = {}, positions = {}, noteCounts = {}, treeEdgeIds = null) {
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

  const rects = new Map(
    nodes.map((n) => {
      const s = sz(n.id);
      const x = px(n);
      const y = py(n);
      return [n.id, { x, y, w: s.w, h: s.h, cx: x + s.w / 2, cy: y + s.h / 2 }];
    })
  );

  // Edges: same soft arched cubic-bezier + relation-label pills as the live
  // EdgeLayer, so an export looks identical to the board it came from —
  // draw cross-links first so the solid tree edges sit on top.
  const ordered = [...edges].sort((e1, e2) => {
    const t1 = !treeEdgeIds || treeEdgeIds.has(e1.id) ? 1 : 0;
    const t2 = !treeEdgeIds || treeEdgeIds.has(e2.id) ? 1 : 0;
    return t1 - t2;
  });
  const edgeSvg = ordered
    .map((e) => {
      const a = rects.get(e.from_node_id);
      const b = rects.get(e.to_node_id);
      if (!a || !b) return "";
      const isTree = !treeEdgeIds || treeEdgeIds.has(e.id);

      const rightward = b.cx >= a.cx;
      const x1 = rightward ? a.x + a.w : a.x;
      const y1 = a.cy;
      const x2 = rightward ? b.x : b.x + b.w;
      const y2 = b.cy;

      const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
      const c1x = rightward ? x1 + dx : x1 - dx;
      const c2x = rightward ? x2 - dx : x2 + dx;
      const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${c1x.toFixed(1)} ${y1.toFixed(1)}, ${c2x.toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;

      const label = RELATION_LABELS[e.relation];
      const mx = 0.125 * x1 + 0.375 * c1x + 0.375 * c2x + 0.125 * x2;
      const my = 0.5 * y1 + 0.5 * y2;
      const labelW = label ? label.length * 5.2 + 12 : 0;

      const pathSvg = `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${isTree ? 2 : 1.5}" stroke-linecap="round"${
        isTree ? "" : ' stroke-dasharray="2 7"'
      } opacity="${isTree ? 0.32 : 0.16}" />`;
      const labelSvg = label
        ? `<g opacity="${isTree ? 0.85 : 0.55}">
  <rect x="${(mx - labelW / 2).toFixed(1)}" y="${(my - 8).toFixed(1)}" width="${labelW.toFixed(1)}" height="16" rx="8" fill="${PAPER}" stroke="${INK}" stroke-width="1" />
  <text x="${mx.toFixed(1)}" y="${(my + 3).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="${INK}" font-family="Inter, sans-serif" letter-spacing="0.02em">${esc(label)}</text>
</g>`
        : "";
      return pathSvg + labelSvg;
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
      // Matches NodeCard's top-right "-right-2 -top-2" gold pill: a little
      // page icon + bare count, overlapping the card's top-right corner.
      const noteCount = noteCounts[n.id] || 0;
      const noteW = 22 + String(noteCount).length * 7;
      const noteSvg =
        noteCount > 0
          ? `<g transform="translate(${s.w - noteW / 2} 0)">
  <rect x="${-noteW / 2}" y="-12" width="${noteW}" height="24" rx="12" fill="${GOLD}" stroke="${INK}" stroke-width="2" />
  <rect x="${-noteW / 2 + 8}" y="-5" width="9" height="10" rx="1.5" fill="none" stroke="${INK}" stroke-width="1.3" />
  <text x="${noteW / 2 - 6}" y="4" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="${INK}">${esc(String(noteCount))}</text>
</g>`
          : "";
      return `<g transform="translate(${x} ${y}) rotate(${rot} ${s.w / 2} ${s.h / 2})">
  <rect x="4" y="4" width="${s.w}" height="${s.h}" rx="10" fill="${INK}" />
  <rect x="0" y="0" width="${s.w}" height="${s.h}" rx="10" fill="${fill}" stroke="${INK}" stroke-width="2"${dashed ? ' stroke-dasharray="6 4"' : ""} />
  <text x="14" y="22" font-family="Inter, sans-serif" font-size="9" font-weight="700" letter-spacing="1.5" fill="${INK}" opacity="0.6">${TYPE_LABEL[n.type] || "NODE"}</text>
  ${titleSvg}${summarySvg}
  ${noteSvg}
</g>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="${vbW}" height="${vbH}">
  <rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="${PAPER}" />
  <g>${edgeSvg}</g>
  <g>${nodeSvg}</g>
</svg>`;
}

// Markdown export — a clean, LLM-readable rendering of the board: the
// parent/child tree (the board's real structure) plus any extra cross-links
// consolidate-session added, listed separately since those aren't part of
// the tree itself.
export function boardToMarkdown(title, nodes, edges) {
  if (nodes.length === 0) return `# ${title || "Untitled thread"}\n\n_No nodes yet._\n`;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map();
  for (const n of nodes) {
    if (!n.parent_id || !byId.has(n.parent_id)) continue;
    if (!children.has(n.parent_id)) children.set(n.parent_id, []);
    children.get(n.parent_id).push(n);
  }
  const roots = nodes.filter((n) => !n.parent_id || !byId.has(n.parent_id));

  const line = (n, depth) => {
    const indent = "  ".repeat(depth);
    const label = (n.type || "node").toUpperCase();
    const summary = n.summary ? ` — ${n.summary}` : "";
    return `${indent}- **[${label}]** ${n.title || "(untitled)"}${summary}`;
  };

  const seen = new Set();
  const lines = [];
  const walk = (n, depth) => {
    if (seen.has(n.id)) return; // guards a stray cycle, shouldn't happen
    seen.add(n.id);
    lines.push(line(n, depth));
    for (const child of children.get(n.id) || []) walk(child, depth + 1);
  };
  for (const r of roots) walk(r, 0);

  const treeEdgeKeys = new Set(
    nodes.filter((n) => n.parent_id).map((n) => `${n.parent_id}->${n.id}`)
  );
  const crossLinks = (edges || []).filter(
    (e) => !treeEdgeKeys.has(`${e.from_node_id}->${e.to_node_id}`)
  );
  const crossLinkLines = crossLinks
    .map((e) => {
      const from = byId.get(e.from_node_id);
      const to = byId.get(e.to_node_id);
      if (!from || !to) return null;
      return `- ${from.title} —(${e.relation || "relates_to"})→ ${to.title}`;
    })
    .filter(Boolean);

  return [
    `# ${title || "Untitled thread"}`,
    "",
    "## Map",
    "",
    lines.join("\n"),
    ...(crossLinkLines.length ? ["", "## Additional connections", "", crossLinkLines.join("\n")] : []),
    "",
  ].join("\n");
}

export function exportMarkdown(md, filename) {
  if (!md) return;
  triggerDownload(new Blob([md], { type: "text/markdown;charset=utf-8" }), filename);
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
