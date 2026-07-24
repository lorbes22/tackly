import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Check, Pencil, Trash2, X } from "lucide-react";

const NodeNote = base44.entities.NodeNote;

// A single note, shown identically in AddNoteModal and NodeDetailPanel —
// hover reveals edit/delete, edit swaps in a small textarea in place.
export function NoteItem({ note, onUpdated, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await NodeNote.update(note.id, { text });
      onUpdated({ ...note, text });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onDelete(note.id);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="rounded-lg border-2 border-ink bg-note-gold/60 px-3 py-2 shadow-brutal-sm">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          className="w-full resize-none rounded-md border border-ink/20 bg-paper-raised px-2 py-1 text-sm text-ink focus:border-periwinkle"
        />
        <div className="mt-1.5 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={() => {
              setDraft(note.text);
              setEditing(false);
            }}
            title="Cancel"
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink/60 hover:bg-ink/10 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !draft.trim()}
            title="Save"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-periwinkle text-white hover:bg-periwinkle-deep disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/notei relative rounded-lg border-2 border-ink bg-note-gold/60 py-2 pl-3 pr-16 text-sm text-ink shadow-brutal-sm">
      {note.text}
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover/notei:opacity-100">
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Edit note"
          className="flex h-6 w-6 items-center justify-center rounded-md text-ink/50 hover:bg-ink/10 hover:text-ink"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          title="Delete note"
          className="flex h-6 w-6 items-center justify-center rounded-md text-ink/50 hover:bg-note-coral hover:text-ink disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
