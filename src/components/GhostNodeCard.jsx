import { Sparkles } from "lucide-react";

// Contentless placeholder shown adjacent to the most recent node while a
// new one is being classified — the header pill says "mapping", this makes
// it visible directly on the board. Its position is just a guess; the real
// node replaces it via the usual op flow and the layout corrects itself.
// A diagonal light sweep (skeleton-loader style) layers on top of the
// existing breathing pulse so it reads as "actively being built", not just
// a static box waiting around. `shadow-brutal` matches the offset drop-
// shadow every real NodeCard has — real user feedback (Token Test V5) was
// that this card read as flat/2D next to the real ones, which all have that
// depth; keep the light sweep, just add the same shadow.
export function GhostNodeCard() {
  return (
    <div className="pointer-events-none relative flex h-[84px] w-56 animate-forming items-center justify-center gap-2 overflow-hidden rounded-note border-2 border-dashed border-ink/30 bg-paper-sunken/70 text-ink-soft shadow-brutal">
      <div
        className="absolute inset-0 animate-shimmer"
        style={{
          backgroundImage:
            "linear-gradient(100deg, transparent 30%, rgba(100,102,233,0.22) 50%, transparent 70%)",
          backgroundSize: "200% 100%",
        }}
      />
      <Sparkles className="relative h-3.5 w-3.5" />
      <span className="relative font-display text-xs font-bold uppercase tracking-widest">
        Tackling…
      </span>
    </div>
  );
}
