import { useEffect } from "react";
import { Bot, Mic, Square } from "lucide-react";
import { useHoldToTalk } from "@/lib/useHoldToTalk";

// Bottom-center live capture controls for the board.

export function MicBar({ onFinalTurn, onEnd, ending }) {
  const { state, partial, error, startHold, endHold } = useHoldToTalk({
    onFinalTurn,
  });

  // Hold Space to talk (ignoring inputs/buttons focus interactions)
  useEffect(() => {
    const isTyping = (e) =>
      ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName) ||
      e.target?.isContentEditable;
    const down = (e) => {
      if (e.code === "Space" && !e.repeat && !isTyping(e)) {
        e.preventDefault();
        startHold();
      }
    };
    const up = (e) => {
      if (e.code === "Space" && !isTyping(e)) {
        e.preventDefault();
        endHold();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [startHold, endHold]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex flex-col items-center gap-2 px-4">
      {(partial || error) && (
        <div
          className={`pointer-events-auto max-w-lg rounded-note border-2 border-ink px-3.5 py-2 text-sm font-medium text-ink shadow-brutal-sm ${
            error ? "bg-note-coral" : "bg-paper-raised"
          }`}
        >
          {error || partial}
        </div>
      )}
      <div className="pointer-events-auto flex items-center gap-3">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            startHold();
          }}
          onPointerUp={endHold}
          onPointerLeave={() => state !== "idle" && endHold()}
          className={`flex h-14 items-center gap-2.5 rounded-2xl border-2 border-ink px-6 font-display text-base font-bold text-ink shadow-brutal transition-all select-none ${
            state === "listening"
              ? "translate-x-0.5 translate-y-0.5 bg-note-coral shadow-brutal-sm"
              : state === "connecting"
              ? "bg-note-amber"
              : "bg-note-mint hover:-translate-y-0.5"
          }`}
        >
          <Mic className="h-5 w-5" />
          {state === "listening"
            ? "Listening — keep holding"
            : state === "connecting"
            ? "Connecting…"
            : "Hold to talk (or hold Space)"}
        </button>
        <button
          type="button"
          onClick={onEnd}
          disabled={ending}
          className="flex h-14 items-center gap-2 rounded-2xl border-2 border-ink bg-paper-raised px-5 text-sm font-bold text-ink shadow-brutal transition-all hover:-translate-y-0.5 disabled:opacity-60"
        >
          <Square className="h-4 w-4" />
          {ending ? "Wrapping up…" : "End session"}
        </button>
      </div>
    </div>
  );
}

export function BotBar({ onEnd, ending, hasUtterances }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3">
        <div className="flex h-14 items-center gap-2.5 rounded-2xl border-2 border-ink bg-note-sky px-5 font-display text-sm font-bold text-ink shadow-brutal">
          <Bot className="h-5 w-5" />
          {hasUtterances
            ? "Bot is listening — nodes appear as people talk"
            : "Bot is joining your meeting…"}
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink opacity-40" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ink" />
          </span>
        </div>
        <button
          type="button"
          onClick={onEnd}
          disabled={ending}
          className="flex h-14 items-center gap-2 rounded-2xl border-2 border-ink bg-paper-raised px-5 text-sm font-bold text-ink shadow-brutal transition-all hover:-translate-y-0.5 disabled:opacity-60"
        >
          <Square className="h-4 w-4" />
          {ending ? "Wrapping up…" : "End session"}
        </button>
      </div>
    </div>
  );
}
