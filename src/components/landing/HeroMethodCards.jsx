import { useScrollProgress, useIsDesktop, lerp, windowedProgress } from "@/lib/scrollReveal";
import { PlatformIconRow } from "@/components/PlatformIcons";

// The three "how it works" cards start stacked directly on top of one
// another (like a small deck) and fan out into their final grid slots as
// the section scrolls past — same scroll-progress-drives-a-number pattern
// as ScrollRevealText, just applied to transform/opacity per card instead
// of per word. Deliberately only ever touches transform + opacity (both
// compositor-only, no layout/reflow) and never re-triggers layout or grows
// the rendered set, for the same reason boardIntro.js does — see
// FINDINGS.md's rollback-incident lesson on scroll/timer-driven real work.
//
// Desktop-only (see useIsDesktop) — on mobile the section isn't given the
// extra scroll-track height the effect needs, and a real bug was found live
// where that left cards stuck mid-transform (rotated, faded, offset) for the
// whole time the section scrolled into view. Mobile just gets the cards at
// rest, in a plain single-column stack.
const STACK_OFFSET = [130, 0, -130]; // % of the card's own width
const STACK_ROTATE = [-7, 2, 7]; // deg
const SCROLL_TRACK_HEIGHT = "sm:h-[220vh]";

export function HeroMethodCards({ items }) {
  const [wrapRef, progress] = useScrollProgress();
  const isDesktop = useIsDesktop();

  return (
    <section ref={wrapRef} className={`relative ${SCROLL_TRACK_HEIGHT}`}>
      <div className="sm:sticky sm:top-0 sm:flex sm:min-h-screen sm:items-center">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:py-0">
          <div className="grid gap-5 sm:grid-cols-3">
            {items.map(({ icon: Icon, title, body, platforms }, i) => {
              const local = isDesktop ? windowedProgress(progress, i * 0.12, 0.55 + i * 0.12) : 1;
              const x = lerp(STACK_OFFSET[i] ?? 0, 0, local);
              const rotate = lerp(STACK_ROTATE[i] ?? 0, 0, local);
              const opacity = lerp(0.25, 1, Math.min(1, local * 1.6));
              return (
                <div
                  key={title}
                  style={{
                    transform: `translateX(${x}%) rotate(${rotate}deg)`,
                    opacity,
                  }}
                  className="rounded-2xl border-2 border-ink bg-paper-raised p-6 shadow-brutal-sm transition-transform duration-200 hover:-translate-y-1 sm:will-change-transform"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-periwinkle-tint">
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
        </div>
      </div>
    </section>
  );
}
