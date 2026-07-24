import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowUp, Sparkles, X } from "lucide-react";

// Reveals assistant text a few characters at a time, fast — a lightweight
// stand-in for real token streaming (the backend returns one full response,
// not SSE) that still reads as "typing it out" rather than dumping the
// whole answer at once. Runs once per mount (message ids are stable, never
// re-created), so historical bubbles never re-animate on re-render.
function StreamingText({ text }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    let i = 0;
    let raf;
    const step = () => {
      i += 3;
      setShown(text.slice(0, i));
      if (i < text.length) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text]);
  return <>{shown}</>;
}

let idCounter = 0;
const nextId = () => `msg-${Date.now()}-${idCounter++}`;

// Per-board AI chat — scoped only to this session's own nodes (ask-tackly-ai
// enforces that server-side). Nothing is persisted: messages live only in
// this component's state for as long as the panel stays mounted, and a
// trimmed slice is resent as `history` on each call so multi-turn context
// still works within one visit without ever touching the database.
export function TacklyAIPanel({ sessionId, sessionTitle }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(false);
  const openRef = useRef(open);
  const scrollRef = useRef(null);

  useEffect(() => {
    openRef.current = open;
    if (open) setUnread(false);
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, open]);

  const send = async () => {
    const q = question.trim();
    if (!q || busy) return;
    setQuestion("");
    setBusy(true);
    const history = messages.slice(-40).map(({ role, text }) => ({ role, text }));
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text: q }]);
    try {
      const res = await base44.functions.invoke("ask-tackly-ai", { session_id: sessionId, question: q, history });
      const answer = res.data?.answer || "Something went wrong — try again?";
      setMessages((prev) => [...prev, { id: nextId(), role: "assistant", text: answer }]);
      // The request can outlive the panel being closed mid-flight — check the
      // CURRENT open state via ref, not the value this closure captured.
      if (!openRef.current) setUnread(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", text: "Something went wrong — try again?" },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Hide TacklyAI" : "Ask TacklyAI about this board"}
        className="relative flex h-8 items-center gap-1.5 rounded-lg border-2 border-ink bg-periwinkle px-2.5 text-sm font-semibold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5"
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden md:inline">TacklyAI</span>
        {unread && !open && (
          <span className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-ink bg-note-coral-edge" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-30 flex h-[28rem] w-80 flex-col overflow-hidden rounded-xl border-2 border-ink bg-paper-raised shadow-brutal sm:w-96">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-periwinkle-deep" />
                <span className="font-display text-sm font-bold text-ink">TacklyAI</span>
                <span className="truncate text-xs text-ink-faint">— {sessionTitle || "Untitled"}</span>
              </span>
              <button
                onClick={() => setOpen(false)}
                title="Hide"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {messages.length === 0 ? (
                <p className="rounded-xl bg-paper-sunken px-3 py-2 text-sm text-ink-soft">
                  Hey, wanna tackle through your thoughts? Ask me anything about this board.
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] animate-utterance-in rounded-xl px-3 py-2 text-sm ${
                      m.role === "user" ? "ml-auto bg-periwinkle text-white" : "bg-paper-sunken text-ink"
                    }`}
                  >
                    {m.role === "assistant" ? <StreamingText text={m.text} /> : m.text}
                  </div>
                ))
              )}
              {busy && (
                <div className="max-w-[85%] animate-utterance-in rounded-xl bg-paper-sunken px-3 py-2 text-sm text-ink-faint">
                  Thinking…
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-center gap-2 border-t border-line p-2"
            >
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about this board…"
                disabled={busy}
                className="h-9 flex-1 rounded-lg border-2 border-ink bg-paper px-3 text-sm shadow-brutal-sm placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-periwinkle-tint disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={busy || !question.trim()}
                title="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-periwinkle text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
