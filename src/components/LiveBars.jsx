import { useEffect, useRef, useState } from "react";
import { Bot, Mic, Square } from "lucide-react";
import { useHoldToTalk } from "@/lib/useHoldToTalk";

// Live feed of recent utterances above the capture bar. Each utterance floats
// up and fades the moment it's been processed into the map, rather than just
// vanishing — a small "that thought landed" cue. Uses dedicated
// utterance-in/utterance-out animations (tailwind.config.js) rather than the
// generic fade-up/float-away used elsewhere — a slight spring-in on arrival
// and a softer blur+dissolve on exit, per feedback that these felt too
// abrupt/mechanical.
export function LiveUtteranceFeed({ utterances }) {
  const [exiting, setExiting] = useState(() => new Set());
  const timers = useRef(new Map());
  // Utterances already processed when this board opened are "already gone" —
  // they must NOT flash through the feed on entry (that was the transcript
  // flash bug). Only ones that go unprocessed -> processed while mounted animate.
  const handled = useRef(null);
  if (handled.current === null) {
    handled.current = new Set(
      utterances.filter((u) => u.processed).map((u) => u.id)
    );
  }

  useEffect(() => {
    for (const u of utterances) {
      if (u.processed && !handled.current.has(u.id) && !timers.current.has(u.id)) {
        handled.current.add(u.id);
        setExiting((prev) => new Set(prev).add(u.id));
        const t = setTimeout(() => {
          timers.current.delete(u.id);
          setExiting((prev) => {
            const next = new Set(prev);
            next.delete(u.id);
            return next;
          });
        }, 740);
        timers.current.set(u.id, t);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utterances]);

  useEffect(() => () => {
    for (const t of timers.current.values()) clearTimeout(t);
  }, []);

  // Show the tail: still-unprocessed utterances plus ones currently floating out
  const visible = utterances
    .filter((u) => !u.processed || exiting.has(u.id))
    .slice(-4);

  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex flex-col items-center gap-1.5 px-4">
      {visible.map((u) => (
        <div
          key={u.id}
          className={`max-w-md rounded-xl border-2 border-ink bg-paper-raised px-3 py-1.5 text-sm text-ink shadow-brutal-sm ${
            exiting.has(u.id) ? "animate-utterance-out" : "animate-utterance-in"
          }`}
        >
          {u.speaker_label && u.speaker_label !== "Me" && (
            <span className="mr-1.5 text-xs font-semibold text-periwinkle-deep">
              {u.speaker_label}
            </span>
          )}
          {u.text}
        </div>
      ))}
    </div>
  );
}

// "Tackling" — the listening indicator shown while the mic is held.
// Animated equalizer bars so it reads as actively hearing you.
function TacklingIndicator() {
  return (
    <span className="flex items-end gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-ink animate-eq-bar"
          style={{ height: "14px", animationDelay: `${i * 140}ms` }}
        />
      ))}
    </span>
  );
}

// Bottom-center live capture controls for the board.

export function MicBar({
  onFinalTurn,
  onPartial,
  onEnd,
  ending,
  onClaimMic,
  onReleaseMic,
  blockedBy,
}) {
  const { state, partial, error, startHold, endHold } = useHoldToTalk({
    onFinalTurn,
    onPartial,
  });
  // Only meaningful when onClaimMic is passed (a board with collaborators) —
  // a brief "checking…" state while the claim round-trip is in flight, so
  // there's no dead silence between pressing and either starting or getting
  // blocked by whoever else is talking.
  const [claiming, setClaiming] = useState(false);

  const tryStart = async () => {
    if (blockedBy) return;
    if (onClaimMic) {
      setClaiming(true);
      const ok = await onClaimMic();
      setClaiming(false);
      if (!ok) return;
    }
    startHold();
  };
  const tryEnd = () => {
    if (state === "idle") return;
    endHold();
    onReleaseMic?.();
  };

  // Hold Space to talk (ignoring inputs/buttons focus interactions)
  useEffect(() => {
    const isTyping = (e) =>
      ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName) ||
      e.target?.isContentEditable;
    const down = (e) => {
      if (e.code === "Space" && !e.repeat && !isTyping(e)) {
        e.preventDefault();
        tryStart();
      }
    };
    const up = (e) => {
      if (e.code === "Space" && !isTyping(e)) {
        e.preventDefault();
        tryEnd();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startHold, endHold, blockedBy, onClaimMic, onReleaseMic]);

  const disabled = !!blockedBy || claiming;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex flex-col items-center gap-2 px-4">
      {blockedBy && (
        <div className="pointer-events-auto max-w-lg rounded-note border-2 border-ink bg-note-amber px-3.5 py-2 text-sm font-medium text-ink shadow-brutal-sm">
          {blockedBy} is speaking right now
        </div>
      )}
      {!blockedBy && (partial || error) && (
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
          disabled={disabled}
          onPointerDown={(e) => {
            e.preventDefault();
            tryStart();
          }}
          onPointerUp={tryEnd}
          onPointerLeave={() => state !== "idle" && tryEnd()}
          className={`flex h-14 items-center gap-2.5 rounded-2xl border-2 border-ink px-6 font-display text-base font-bold text-ink shadow-brutal transition-all select-none disabled:opacity-60 ${
            state === "listening"
              ? "translate-x-0.5 translate-y-0.5 bg-note-coral shadow-brutal-sm"
              : state === "connecting" || claiming
              ? "bg-note-amber"
              : "bg-note-mint hover:-translate-y-0.5"
          }`}
        >
          {state === "listening" ? (
            <>
              <TacklingIndicator />
              Tackling… keep holding
            </>
          ) : state === "connecting" || claiming ? (
            <>
              <Mic className="h-5 w-5" />
              Connecting…
            </>
          ) : (
            <>
              <Mic className="h-5 w-5" />
              Hold to talk (or hold Space)
            </>
          )}
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
