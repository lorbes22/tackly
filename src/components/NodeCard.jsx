// The signature element: node cards styled as neubrutalist post-its —
// flat pastel fill, hard ink border, offset shadow, slight random rotation.
// Question and Risk nodes keep a dashed border while open.
import { forwardRef } from "react";
import { StickyNote } from "lucide-react";

export const NODE_TYPE_STYLES = {
  topic: { fill: "bg-note-teal", label: "Topic" },
  idea: { fill: "bg-note-lavender", label: "Idea" },
  evidence: { fill: "bg-note-mint", label: "Evidence" },
  opinion: { fill: "bg-note-pink", label: "Opinion" },
  question: { fill: "bg-note-amber", label: "Question" },
  decision: { fill: "bg-note-sky", label: "Decision" },
  risk: { fill: "bg-note-coral", label: "Risk" },
  action: { fill: "bg-note-gold", label: "Action" },
  // Fact: a standalone verifiable data point with no argumentative role
  // (background info, a date, a number mentioned in passing) — distinct from
  // Evidence, which is specifically backing up a claim/decision/risk (always
  // has a clear parent it supports). "fact" was also this project's original
  // pre-rename name for what's now Evidence; any very old record still using
  // it that way just renders as the new Fact style now — a cosmetic-only
  // overlap on legacy test data, not a live concern.
  fact: { fill: "bg-note-sage", label: "Fact" },
  // Plan: a multi-step forward-looking goal/strategy — broader than a single
  // Action (one task), more concrete than a Topic (which just frames a
  // subject). Individual actions can attach under a plan.
  plan: { fill: "bg-note-plum", label: "Plan" },
  // Update: a report that something was recently changed, fixed, added, or
  // otherwise updated — distinct from Evidence (backs up some OTHER claim)
  // and Decision (a live commitment being made right now).
  update: { fill: "bg-note-azure", label: "Update" },
  // Waffle (small talk with some content) recedes: muted fill + slightly
  // transparent so it doesn't compete with the analytical nodes
  waffle: { fill: "bg-note-gray", label: "🧇 Waffle", muted: true },
  // Legacy alias: older sessions stored "aside" before the rename — keep it
  // rendering correctly rather than falling back to Idea's style.
  aside: { fill: "bg-note-gray", label: "🧇 Waffle", muted: true },
};

const STATUS_LABELS = {
  open: "Open",
  resolved: "Resolved",
  done: "Done",
};

export const NodeCard = forwardRef(function NodeCard(
  {
    node,
    onClick,
    onNotesClick,
    animate = false,
    delayMs = 0,
    className = "",
    noteCount = 0,
    forming = false,
  },
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
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(e);
        }
      }}
      style={{
        "--note-rotation": `${node.rotation_deg || 0}deg`,
        ...(animate && delayMs > 0 ? { animationDelay: `${delayMs}ms` } : {}),
      }}
      className={`group/node relative w-56 cursor-pointer rounded-note border-2 border-ink p-3.5 text-left shadow-brutal outline-none transition-all [transform:rotate(var(--note-rotation))] hover:shadow-brutal-lg hover:!opacity-100 focus-visible:shadow-brutal-lg ${
        dashed ? "border-dashed" : ""
      } ${forming ? "animate-forming" : ""} ${style.muted ? "opacity-70" : ""} ${style.fill} ${animate ? "animate-pop-in" : ""} ${className}`}
    >
      {noteCount > 0 && (
        <button
          type="button"
          title={`${noteCount} ${noteCount === 1 ? "note" : "notes"}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onNotesClick?.(node.id);
          }}
          className="absolute -right-2 -top-2 z-10 flex h-6 cursor-pointer items-center gap-1 rounded-full border-2 border-ink bg-note-gold px-1.5 text-[10px] font-bold text-ink shadow-brutal-sm transition-transform hover:-translate-y-0.5"
        >
          <StickyNote className="h-3 w-3" />
          {noteCount}
        </button>
      )}
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
      {/* "+ Add note" reveals on hover for any card, note count or not —
          only when a handler exists at all (owner/editor), never on the
          read-only shared board. */}
      {onNotesClick && (
        <div className="mt-0 max-h-0 overflow-hidden pt-0 opacity-0 transition-all group-hover/node:mt-2 group-hover/node:max-h-6 group-hover/node:border-t group-hover/node:border-ink/10 group-hover/node:pt-1.5 group-hover/node:opacity-100">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onNotesClick(node.id);
            }}
            className="text-[10px] font-bold uppercase leading-none tracking-wide text-ink/45 hover:text-ink hover:underline"
          >
            + Add note
          </button>
        </div>
      )}
    </div>
  );
});
