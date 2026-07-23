import { useState } from "react";
import { Star, X } from "lucide-react";

// Quirky post-meeting rating prompt. Shown once, right after a meeting
// session finishes processing, summarizing what got mapped so the ask
// for a rating comes with a reason to feel good about it.
export function RatingModal({ counts, onSubmit, onDismiss }) {
  const [hovered, setHovered] = useState(0);
  const [rating, setRating] = useState(0);
  const [sent, setSent] = useState(false);

  const parts = [];
  if (counts.ideas) parts.push(`${counts.ideas} idea${counts.ideas === 1 ? "" : "s"}`);
  if (counts.decisions) parts.push(`${counts.decisions} decision${counts.decisions === 1 ? "" : "s"}`);
  if (counts.questions) parts.push(`${counts.questions} question${counts.questions === 1 ? "" : "s"}`);
  if (counts.actions) parts.push(`${counts.actions} action${counts.actions === 1 ? "" : "s"}`);
  const summary =
    parts.length > 0
      ? `We mapped out ${parts.slice(0, -1).join(", ")}${
          parts.length > 1 ? " and " : ""
        }${parts[parts.length - 1]} while you talked — ready whenever you need it.`
      : "We mapped out everything that was said while you talked — ready whenever you need it.";

  const handlePick = (n) => {
    setRating(n);
    setSent(true);
    onSubmit(n);
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border-2 border-ink bg-paper-raised p-6 text-center shadow-brutal animate-fade-up">
        <button
          onClick={onDismiss}
          className="absolute right-4 top-4 text-ink-faint hover:text-ink"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        {sent ? (
          <>
            <p className="font-display text-xl font-bold text-ink">Appreciate it!</p>
            <p className="mt-2 text-sm text-ink-soft">Back to mapping your next thought.</p>
          </>
        ) : (
          <>
            <p className="font-display text-xl font-bold text-ink">How'd that meeting go? 👀</p>
            <p className="mt-2 text-sm text-ink-soft">{summary}</p>
            <div className="mt-5 flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => handlePick(n)}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  className="p-0.5 transition-transform hover:-translate-y-0.5"
                >
                  <Star
                    className={`h-8 w-8 ${
                      (hovered || rating) >= n
                        ? "fill-note-gold-edge text-note-gold-edge"
                        : "text-ink-faint"
                    }`}
                  />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
