import { useEffect, useRef, useState } from "react";

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Smoothstep easing — gentler start/end than linear interpolation.
export function smoothstep(t) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

// Remaps a 0->1 progress value onto a [start, end] sub-range, smoothstep-
// eased — used to stagger several elements off ONE shared scroll-progress
// number (each gets its own start/end window) without needing a separate
// scroll listener per element.
export function windowedProgress(t, start, end) {
  if (end <= start) return t >= end ? 1 : 0;
  return smoothstep((t - start) / (end - start));
}

// True once the viewport is at least `minWidth` wide (defaults to Tailwind's
// `sm` breakpoint). Used to gate a JS-driven scroll effect to desktop only —
// see HeroMethodCards for why this matters: `useScrollProgress`'s "shorter
// than the viewport" fallback (progress stays 0 until the section's top
// edge reaches the top of the screen) reads fine on a tall desktop scroll
// track, but on mobile — where the section is often shorter than the
// viewport — it left cards stuck mid-transform (rotated, faded, offset)
// for the entire time the section was scrolling into view, a real bug
// found live. Simplest fix: don't run the transform math at all below this
// width, rather than trying to make the fallback math work for every
// possible section height.
export function useIsDesktop(minWidth = 640) {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= minWidth
  );

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [minWidth]);

  return isDesktop;
}

// Tracks how far a (tall) element has scrolled through the viewport, as a
// 0 -> 1 progress value. Used to drive scroll-linked reveal animations
// without a dedicated scroll library.
export function useScrollProgress() {
  const ref = useRef(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let ticking = false;

    function measure() {
      ticking = false;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = el.offsetHeight - window.innerHeight;
      const raw = total > 0 ? -rect.top / total : rect.top <= 0 ? 1 : 0;
      setProgress(Math.min(1, Math.max(0, raw)));
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(measure);
    }

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return [ref, progress];
}
