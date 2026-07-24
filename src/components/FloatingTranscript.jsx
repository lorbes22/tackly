import { MessageSquareText } from "lucide-react";

// Desktop-only ambient transcript preview: floats over the canvas at low
// opacity so it's glanceable without competing with the board, goes full
// opacity on hover, and clicking it opens the same full transcript panel the
// header "Transcript" button does — this is just a low-commitment peek, not
// a second transcript UI to maintain.
export function FloatingTranscript({ utterances, onExpand }) {
  const recent = utterances.slice(-6);
  if (recent.length === 0) return null;

  return (
    <button
      type="button"
      onClick={onExpand}
      title="Click to open the full transcript"
      className="pointer-events-auto absolute right-5 top-5 z-10 hidden w-72 rounded-2xl border-2 border-ink bg-paper-raised/50 p-3 text-left opacity-40 shadow-brutal-sm backdrop-blur-sm transition-all duration-200 hover:opacity-100 lg:block"
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-soft">
        <MessageSquareText className="h-3 w-3" /> Live transcript
      </p>
      <div className="max-h-40 space-y-1 overflow-hidden">
        {recent.map((u) => (
          <p key={u.id} className="truncate text-xs text-ink-soft">
            {u.speaker_label && u.speaker_label !== "Me" && (
              <span className="font-semibold text-periwinkle-deep">{u.speaker_label}: </span>
            )}
            {u.text}
          </p>
        ))}
      </div>
    </button>
  );
}
