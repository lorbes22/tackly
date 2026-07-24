import { Sparkles } from "lucide-react";

// Contentless placeholder shown adjacent to the most recent node while a
// new one is being classified — the header pill says "mapping", this makes
// it visible directly on the board. Its position is just a guess; the real
// node replaces it via the usual op flow and the layout corrects itself.
export function GhostNodeCard() {
  return (
    <div className="pointer-events-none flex h-[84px] w-56 animate-forming items-center justify-center gap-2 rounded-note border-2 border-dashed border-ink/30 bg-paper-sunken/70 text-ink-soft">
      <Sparkles className="h-3.5 w-3.5" />
      <span className="font-display text-xs font-bold uppercase tracking-widest">
        Tackling…
      </span>
    </div>
  );
}
