import { useEffect, useRef, useState } from "react";

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Smoothstep easing — gentler start/end than linear interpolation.
export function smoothstep(t) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
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
