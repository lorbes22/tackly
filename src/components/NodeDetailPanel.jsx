import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { NODE_TYPE_STYLES } from "@/components/NodeCard";
import { ArrowRight, Check, RotateCcw, X } from "lucide-react";

const RELATION_LABELS = {
  expands: "expands",
  answers: "answers",
  blocks: "blocks",
  relates_to: "related to",
};

function statusAction(node) {
  if (node.type === "action") {
    return node.status === "done"
      ? { next: "open", label: "Reopen", icon: RotateCcw }
      : { next: "done", label: "Mark done", icon: Check };
  }
  if (node.type === "question" || node.type === "risk") {
    return node.status === "resolved"
      ? { next: "open", label: "Reopen", icon: RotateCcw }
      : { next: "resolved", label: "Mark resolved", icon: Check };
  }
  return null;
}

export function NodeDetailPanel({
  node,
  nodes,
  edges,
  utterances,
  onClose,
  onSelectNode,
  onStatusChange,
}) {
  const [linkedUtteranceIds, setLinkedUtteranceIds] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLinkedUtteranceIds(null);
    base44.entities.NodeUtteranceLink.filter({ node_id: node.id }, "created_date", 100)
      .then((links) => {
        if (!cancelled) setLinkedUtteranceIds(links.map((l) => l.utterance_id));
      })
      .catch(() => !cancelled && setLinkedUtteranceIds([]));
    return () => {
      cancelled = true;
    };
  }, [node.id]);

  const style = NODE_TYPE_STYLES[node.type] || NODE_TYPE_STYLES.idea;
  const action = statusAction(node);

  const excerpts =
    linkedUtteranceIds === null
      ? null
      : utterances.filter((u) => linkedUtteranceIds.includes(u.id));

  const related = edges
    .filter((e) => e.from_node_id === node.id || e.to_node_id === node.id)
    .map((e) => {
      const otherId = e.from_node_id === node.id ? e.to_node_id : e.from_node_id;
      const other = nodes.find((n) => n.id === otherId);
      return other
        ? { edge: e, other, outgoing: e.from_node_id === node.id }
        : null;
    })
    .filter(Boolean);

  const toggleStatus = async () => {
    if (!action) return;
    onStatusChange(node.id, action.next);
    try {
      await base44.entities.Node.update(node.id, { status: action.next });
    } catch {
      onStatusChange(node.id, node.status); // roll back on failure
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className={`border-b-2 border-ink px-4 py-4 ${style.fill}`}>
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink/60">
            {style.label}
            {node.status && node.status !== "na" && ` · ${node.status}`}
          </span>
          <button
            onClick={onClose}
            title="Close"
            className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-lg text-ink/60 transition-colors hover:bg-ink/10 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 className="mt-1 font-display text-lg font-bold leading-snug text-ink">
          {node.title}
        </h2>
        {action && (
          <button
            onClick={toggleStatus}
            className="mt-3 flex h-8 items-center gap-1.5 rounded-lg border-2 border-ink bg-paper-raised px-3 text-xs font-bold text-ink shadow-brutal-sm transition-transform hover:-translate-y-px"
          >
            <action.icon className="h-3.5 w-3.5" />
            {action.label}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {node.summary && (
          <p className="text-sm leading-relaxed text-ink">{node.summary}</p>
        )}

        {related.length > 0 && (
          <section className="mt-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              Connections
            </h3>
            <div className="mt-2 space-y-1.5">
              {related.map(({ edge, other, outgoing }) => {
                const otherStyle = NODE_TYPE_STYLES[other.type] || NODE_TYPE_STYLES.idea;
                return (
                  <button
                    key={edge.id}
                    onClick={() => onSelectNode(other.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-2 text-left text-sm transition-colors hover:border-ink"
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full border border-ink ${otherStyle.fill}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">
                        {other.title}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-ink-faint">
                        {outgoing ? (
                          <>
                            {RELATION_LABELS[edge.relation]}
                            <ArrowRight className="h-3 w-3" />
                          </>
                        ) : (
                          <>
                            <ArrowRight className="h-3 w-3 rotate-180" />
                            {RELATION_LABELS[edge.relation]}
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            From the transcript
          </h3>
          {excerpts === null ? (
            <div className="mt-3 flex justify-center py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-periwinkle" />
            </div>
          ) : excerpts.length === 0 ? (
            <p className="mt-2 text-sm text-ink-faint">No linked excerpts.</p>
          ) : (
            <div className="mt-2 space-y-2.5">
              {excerpts.map((u) => (
                <blockquote
                  key={u.id}
                  className="rounded-lg border-l-2 border-periwinkle bg-paper px-3 py-2"
                >
                  {u.speaker_label && (
                    <span className="text-xs font-semibold text-periwinkle-deep">
                      {u.speaker_label}
                    </span>
                  )}
                  <p className="text-sm leading-relaxed text-ink">“{u.text}”</p>
                </blockquote>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
