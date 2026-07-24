import { useMemo } from "react";
import { lerp, useScrollProgress } from "@/lib/scrollReveal";

// Word-by-word opacity reveal, tied directly to scroll position: each word
// is dim until the scroll progress "reading cursor" reaches it, then settles
// to full opacity. No IntersectionObserver — this needs continuous scrub,
// not a one-time trigger.
export function ScrollRevealText({ text }) {
  const [wrapRef, progress] = useScrollProgress();
  const words = useMemo(() => text.split(" "), [text]);
  const total = words.length;

  return (
    <section ref={wrapRef} className="relative h-[150vh]">
      <div className="sticky top-0 flex min-h-screen items-center justify-center px-6">
        <p className="max-w-3xl text-center font-display text-4xl font-bold leading-snug text-ink sm:text-6xl sm:leading-snug">
          {words.map((word, i) => {
            const local = Math.min(1, Math.max(0, progress * total - i));
            return (
              <span key={i} className="mr-2 inline-block" style={{ opacity: lerp(0.14, 1, local) }}>
                {word}
              </span>
            );
          })}
        </p>
      </div>
    </section>
  );
}
