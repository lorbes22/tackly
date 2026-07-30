import { PlatformIconRow } from "@/components/PlatformIcons";

// A one-time entrance, not a scroll effect — all three cards start stacked
// near the same spot (card 2 on card 1, card 3 on card 2 and 1, per the
// deck-of-cards feedback) and deal apart into their grid slots on mount, so
// it replays fresh on every page load. Deliberately NOT scroll-linked or
// scroll-pinned (an earlier version was, and it pushed this section far
// enough from the hero that it stopped reading as part of it) — this now
// sits in normal document flow, right where the plain static grid used to.
const STACK = [
  { x: -30, y: 0, rotate: -4 },
  { x: -22, y: 6, rotate: 2 },
  { x: -14, y: 12, rotate: 7 },
];
const STAGGER_MS = 110;

export function HeroMethodCards({ items }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:pb-24">
      <div className="grid gap-5 sm:grid-cols-3">
        {items.map(({ icon: Icon, title, body, platforms }, i) => {
          const stack = STACK[i] ?? STACK[STACK.length - 1];
          return (
            <div
              key={title}
              style={{
                "--stack-x": `${stack.x}px`,
                "--stack-y": `${stack.y}px`,
                "--stack-rotate": `${stack.rotate}deg`,
                animationDelay: `${i * STAGGER_MS}ms`,
                zIndex: items.length - i,
              }}
              className="animate-stack-in rounded-2xl border-2 border-ink bg-paper-raised p-6 shadow-brutal-sm transition-transform hover:-translate-y-1"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink bg-periwinkle-tint">
                <Icon className="h-5 w-5 text-periwinkle-deep" />
              </div>
              <div className="mt-4 flex items-center gap-2">
                <p className="font-display text-lg font-bold text-ink">{title}</p>
                {platforms && <PlatformIconRow />}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
