import { useEffect, useRef } from "react";
import { MessageSquareText } from "lucide-react";

// Desktop-only ambient transcript preview: floats over the canvas at low
// opacity so it's glanceable without competing with the board, goes full
// opacity on hover, and clicking it opens the same full transcript panel the
// header "Transcript" button does — this is just a low-commitment peek, not
// a second transcript UI to maintain.
//
// Redesigned after real feedback (Token Test V5): originally rendered as
// plain truncated text lines, which read as "all the words jumbled
// together." Now each utterance is its own bordered bubble — the same visual
// language as the bubbles that pop up above the hold-to-talk button
// (LiveBars.jsx's LiveUtteranceFeed) — in a scrollable, chat-style column
// that auto-stays pinned to the newest utterance, with that newest bubble
// getting a periwinkle glow/light-sweep until a newer one supersedes it.
export function FloatingTranscript({ utterances, onExpand }) {
  const recent = utterances.slice(-20);
  const scrollRef = useRef(null);
  const latestId = recent.length ? recent[recent.length - 1].id : null;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [latestId]);

  if (recent.length === 0) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onExpand?.(e);
        }
      }}
      title="Click to open the full transcript"
      className="pointer-events-auto absolute right-5 top-5 z-10 hidden w-72 cursor-pointer rounded-2xl border-2 border-ink bg-paper-raised/50 p-3 opacity-40 shadow-brutal-sm backdrop-blur-sm transition-all duration-200 hover:opacity-100 lg:block"
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-soft">
        <MessageSquareText className="h-3 w-3" /> Live transcript
      </p>
      <div ref={scrollRef} className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
        {recent.map((u) => {
          const isLatest = u.id === latestId;
          return (
            <div
              key={u.id}
              className={`relative overflow-hidden rounded-xl border border-line bg-paper-raised px-2.5 py-1.5 text-xs text-ink-soft ${
                isLatest ? "border-periwinkle/70 text-ink" : ""
              }`}
            >
              {isLatest && (
                <div
                  className="pointer-events-none absolute inset-0 animate-shimmer"
                  style={{
                    backgroundImage:
                      "linear-gradient(100deg, transparent 30%, rgba(100,102,233,0.28) 50%, transparent 70%)",
                    backgroundSize: "200% 100%",
                  }}
                />
              )}
              <span className="relative">
                {u.speaker_label && u.speaker_label !== "Me" && (
                  <span className="mr-1 font-semibold text-periwinkle-deep">
                    {u.speaker_label}:
                  </span>
                )}
                {u.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
