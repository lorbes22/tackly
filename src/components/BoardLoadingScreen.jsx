import { LogoMark } from "@/components/Logo";

// Replaces the blank white flash that used to show while a board's initial
// data was still in flight — same paper background as the board itself so
// there's no color pop when the real content mounts a moment later.
export function BoardLoadingScreen({ label = "Loading your board…" }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-5 bg-paper">
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
