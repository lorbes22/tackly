import { useEffect, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";

// Three sample exchanges, cycling so the mock always has something happening
// rather than sitting static. Re-keyed per cycle so the bubbles replay the
// same entrance animation the real chat panel uses on every switch.
const EXAMPLES = [
  {
    q: "Can I speak with my thoughts?",
    a: "That's my whole job — I already read this entire board before you finished typing. ⚡ Ask away.",
  },
  {
    q: "What was the main risk we found?",
    a: "Legal sign-off was missing before launch — it's the one thing blocking everything else here. 🚩",
  },
  {
    q: "Did we actually decide anything?",
    a: "Three decisions, one action assigned — I read the whole thread faster than you typed that question. ⚡",
  },
];

const CYCLE_MS = 4500;

// Static mock of the real board panel (TacklyAIPanel) — not functional, just
// a preview of what it looks like in use.
export function TacklyAIPreview() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % EXAMPLES.length), CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  const example = EXAMPLES[index];

  return (
    <div className="overflow-hidden rounded-xl border-2 border-ink bg-paper shadow-brutal-sm">
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
        <Sparkles className="h-3.5 w-3.5 text-periwinkle-deep" />
        <span className="font-display text-sm font-bold text-ink">AI Assistant</span>
        <span className="text-xs text-ink-faint">— Sunday brain dump</span>
      </div>

      <div key={index} className="space-y-2 px-3 py-4">
        <div className="ml-auto w-fit max-w-[85%] animate-utterance-in rounded-xl bg-periwinkle px-3 py-2 text-sm text-white">
          {example.q}
        </div>
        <div
          className="w-fit max-w-[85%] animate-utterance-in rounded-xl bg-paper-sunken px-3 py-2 text-sm text-ink"
          style={{ animationDelay: "300ms" }}
        >
          {example.a}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-line p-2">
        <input
          type="text"
          readOnly
          placeholder="Ask about this board…"
          className="h-9 flex-1 rounded-lg border-2 border-ink bg-paper px-3 text-sm shadow-brutal-sm placeholder:text-ink-faint"
        />
        <button
          type="button"
          tabIndex={-1}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-periwinkle text-white shadow-brutal-sm"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
