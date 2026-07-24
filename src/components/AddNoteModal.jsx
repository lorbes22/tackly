import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { NODE_TYPE_STYLES } from "@/components/NodeCard";
import { Plus, X } from "lucide-react";

const NodeNote = base44.entities.NodeNote;

// Centered popup for adding a note straight from a card's hover row — a
// dedicated modal rather than reusing the side panel's scroll-to-notes flow,
// which was triggering the browser to scroll the whole document (not just
// the panel) and leave a large empty margin at the bottom of the page.
export function AddNoteModal({ node, onAddNote, onClose }) {
  const [notes, setNotes] = useState(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    NodeNote.filter({ node_id: node.id }, "created_date", 200)
      .then((rows) => !cancelled && setNotes(rows))
      .catch(() => !cancelled && setNotes([]));
    inputRef.current?.focus();
    return () => {
      cancelled = true;
    };
  }, [node.id]);

  const style = NODE_TYPE_STYLES[node.type] || NODE_TYPE_STYLES.idea;

  const submit = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const note = await onAddNote(node.id, text);
      if (note) setNotes((prev) => [...(prev || []), note]);
      setDraft("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border-2 border-ink bg-paper-raised p-6 shadow-brutal animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink/50">
              {style.label}
            </p>
            <p className="truncate font-display text-base font-bold text-ink">{node.title}</p>
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {notes === null ? (
          <div className="mt-4 flex justify-center py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-periwinkle" />
          </div>
        ) : (
          notes.length > 0 && (
            <div className="mt-4 max-h-40 space-y-2 overflow-y-auto">
              {notes.map((n) => (
                <div
                  key={n.id}
                  className="rounded-lg border-2 border-ink bg-note-gold/60 px-3 py-2 text-sm text-ink shadow-brutal-sm"
                >
                  {n.text}
                </div>
              ))}
            </div>
          )
        )}

        <form onSubmit={submit} className="mt-4 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a note…"
            className="h-10 flex-1 rounded-lg border border-line bg-paper px-3 text-sm placeholder:text-ink-faint focus:border-periwinkle"
          />
          <button
            type="submit"
            disabled={!draft.trim() || saving}
            title="Add note"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-periwinkle text-white shadow-brutal-sm transition-transform hover:-translate-y-px disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
