// Same equalizer-bar language as the real "Tackling…" listening indicator
// (LiveBars.jsx's TacklingIndicator) — reused on the marketing CTAs that
// invite someone to start talking, instead of a generic arrow. `bg-current`
// so it inherits whichever button's text color it sits inside.
export function TalkingBars({ className = "" }) {
  return (
    <span className={`flex items-end gap-[3px] ${className}`} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-current animate-eq-bar"
          style={{ height: "16px", animationDelay: `${i * 140}ms` }}
        />
      ))}
    </span>
  );
}
