// The signature element: node cards styled as neubrutalist post-its —
// flat pastel fill, hard ink border, offset shadow, slight random rotation.
// Question and Risk nodes keep a dashed border while open.
import { forwardRef } from "react";

export const NODE_TYPE_STYLES = {
  topic: { fill: "bg-note-teal", label: "Topic" },
  idea: { fill: "bg-note-lavender", label: "Idea" },
  evidence: { fill: "bg-note-mint", label: "Evidence" },
  opinion: { fill: "bg-note-pink", label: "Opinion" },
  question: { fill: "bg-note-amber", label: "Question" },
  decision: { fill: "bg-note-sky", label: "Decision" },
  risk: { fill: "bg-note-coral", label: "Risk" },
  action: { fill: "bg-note-gold", label: "Action" },
  // Waffle (small talk with some content) recedes: muted fill + slightly
  // transparent so it doesn't compete with the analytical nodes
  waffle: { fill: "bg-note-gray", label: "🧇 Waffle", muted: true },
  // Legacy aliases: older sessions stored "fact"/"aside" before the rename —
  // keep them rendering correctly rather than falling back to Idea's style.
  fact: { fill: "bg-note-mint", label: "Evidence" },
  aside: { fill: "bg-note-gray", label: "🧇 Waffle", muted: true },
};

const STATUS_LABELS = {
  open: "Open",
  resolved: "Resolved",
  done: "Done",
};

export const NodeCard = forwardRef(function NodeCard(
  { node, onClick, onNotesClick, animate = false, className = "", noteCount = 0, forming = false },
  ref
) {
  const style = NODE_TYPE_STYLES[node.type] || NODE_TYPE_STYLES.idea;
  const isOpen =
    node.status === "open" && (node.type === "question" || node.type === "risk");
  const statusLabel =
    node.status && node.status !== "na" ? STATUS_LABELS[node.status] : null;
  // A still-forming (provisional) node is dashed + pulsing — deliberately
  // distinct from an open Question/Risk, which is dashed but steady.
  const dashed = forming || isOpen;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      style={{ "--note-rotation": `${node.rotation_deg || 0}deg` }}
      className={`group/node relative w-56 rounded-note border-2 border-ink p-3.5 text-left shadow-brutal transition-all [transform:rotate(var(--note-rotation))] hover:shadow-brutal-lg hover:!opacity-100 focus-visible:shadow-brutal-lg ${
        dashed ? "border-dashed" : ""
      } ${forming ? "animate-forming" : ""} ${style.muted ? "opacity-70" : ""} ${style.fill} ${animate ? "animate-pop-in" : ""} ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-ink/60">
          {style.label}
        </span>
        {statusLabel && (
          <span
            className={`rounded-full border border-ink px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ${
              node.status === "open" ? "bg-paper-raised text-ink" : "bg-ink text-paper"
            }`}
          >
            {statusLabel}
          </span>
        )}
      </div>
      <p className="mt-1.5 font-display text-[15px] font-bold leading-snug text-ink">
        {node.title}
      </p>
      {node.summary && (
        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-ink/70">
          {node.summary}
        </p>
      )}
      {/* Notes row: "X notes" stays visible whenever any exist; "Add note"
          only reveals on hover — both jump to the same focused notes panel. */}
      <div
        className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-ink/45 transition-all ${
          noteCount > 0
            ? "mt-2 max-h-5 border-t border-ink/10 pt-1.5 opacity-100"
            : "mt-0 max-h-0 overflow-hidden border-t-0 pt-0 opacity-0 group-hover/node:mt-2 group-hover/node:max-h-5 group-hover/node:border-t group-hover/node:border-ink/10 group-hover/node:pt-1.5 group-hover/node:opacity-100"
        }`}
      >
        {noteCount > 0 && (
          <span>
            {noteCount} {noteCount === 1 ? "note" : "notes"}
          </span>
        )}
        <span
          role="button"
          tabIndex={0}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onNotesClick?.(node.id);
          }}
          className={`opacity-0 transition-opacity hover:text-ink hover:underline group-hover/node:opacity-100 ${
            noteCount > 0 ? "ml-auto" : ""
          }`}
        >
          + Add note
        </span>
      </div>
    </button>
  );
});
