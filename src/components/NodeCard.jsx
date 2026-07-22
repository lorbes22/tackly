// The signature element: node cards styled as neubrutalist post-its —
// flat pastel fill, hard ink border, offset shadow, slight random rotation.
// Question and Risk nodes keep a dashed border while open.

export const NODE_TYPE_STYLES = {
  idea: { fill: "bg-note-lavender", label: "Idea" },
  fact: { fill: "bg-note-mint", label: "Fact" },
  question: { fill: "bg-note-amber", label: "Question" },
  decision: { fill: "bg-note-sky", label: "Decision" },
  risk: { fill: "bg-note-coral", label: "Risk" },
  action: { fill: "bg-note-gold", label: "Action" },
};

const STATUS_LABELS = {
  open: "Open",
  resolved: "Resolved",
  done: "Done",
};

export function NodeCard({ node, onClick, animate = false, className = "" }) {
  const style = NODE_TYPE_STYLES[node.type] || NODE_TYPE_STYLES.idea;
  const isOpen =
    node.status === "open" && (node.type === "question" || node.type === "risk");
  const statusLabel =
    node.status && node.status !== "na" ? STATUS_LABELS[node.status] : null;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ "--note-rotation": `${node.rotation_deg || 0}deg` }}
      className={`w-56 rounded-note border-2 border-ink p-3.5 text-left shadow-brutal transition-shadow [transform:rotate(var(--note-rotation))] hover:shadow-brutal-lg focus-visible:shadow-brutal-lg ${
        isOpen ? "border-dashed" : ""
      } ${style.fill} ${animate ? "animate-pop-in" : ""} ${className}`}
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
    </button>
  );
}
