import { useState } from "react";
import { Star, X } from "lucide-react";

// Quirky post-session rating prompt. Shown once, right after a session
// finishes processing (meeting or solo), summarizing what got mapped so the
// ask for a rating comes with a reason to feel good about it. Stars pick a
// rating immediately; an optional feedback field reveals once one's picked,
// so leaving feedback is never required to submit.
export function RatingModal({ counts, meeting = false, onSubmit, onDismiss }) {
  const [hovered, setHovered] = useState(0);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
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

  const submit = () => {
    setSent(true);
    onSubmit(rating, feedback.trim());
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-ink/40 px-4">
      <div className="relative w-full max-w-sm rounded-2xl border-2 border-ink bg-paper-raised p-6 text-center shadow-brutal animate-fade-up">
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
            <p className="font-display text-xl font-bold text-ink">
              {meeting ? "How'd that meeting go? 👀" : "How'd that session go? 👀"}
            </p>
            <p className="mt-2 text-sm text-ink-soft">{summary}</p>
            <div className="mt-5 flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setRating(n)}
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

            {rating > 0 && (
              <div className="mt-4 animate-fade-up text-left">
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Anything you want to add? (optional)"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm placeholder:text-ink-faint focus:border-periwinkle"
                />
                <button
                  onClick={submit}
                  className="mt-3 h-10 w-full rounded-xl border-2 border-ink bg-periwinkle font-display text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5"
                >
                  Send
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
