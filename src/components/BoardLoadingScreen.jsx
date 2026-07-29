import { LogoMark } from "@/components/Logo";

// Replaces the blank white flash that used to show while a board's initial
// data was still in flight — same paper background as the board itself so
// there's no color pop when the real content mounts a moment later.
//
// `className` lets a caller render this as an overlay (e.g. "absolute
// inset-0 z-40") on top of the real canvas markup instead of replacing the
// page's whole return — that matters because usePanZoom's wheel listener
// attaches once, on mount, against whatever the canvas ref currently points
// to. If the canvas div itself is swapped out for this loading screen via
// an early `return`, the ref is null when that effect runs and never gets
// a second chance to attach once the real canvas mounts later. Keeping the
// canvas div always mounted (overlay on top, not instead of) avoids that.
export function BoardLoadingScreen({ label = "Loading your board…", className = "h-dvh" }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-5 bg-paper ${className}`}>
      <LogoMark className="h-10 w-10 animate-pulse" />
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 animate-bounce rounded-full bg-periwinkle"
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </div>
      <p className="text-sm text-ink-faint">{label}</p>
    </div>
  );
}
