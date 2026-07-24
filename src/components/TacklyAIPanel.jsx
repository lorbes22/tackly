import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Sparkles, X } from "lucide-react";

const ChatMessage = base44.entities.ChatMessage;

// Per-board AI chat — scoped only to this session's own nodes (ask-tackly-ai
// enforces that server-side). Self-contained: owns its own open/closed state,
// message history, and unread tracking, so Board.jsx just drops it in.
export function TacklyAIPanel({ sessionId }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
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
    if (open && !loaded) {
      ChatMessage.filter({ session_id: sessionId }, "created_date", 100)
        .then((rows) => setMessages(rows))
        .catch(() => {})
        .finally(() => setLoaded(true));
    }
  }, [open, loaded, sessionId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, open]);

  const send = async () => {
    const q = question.trim();
    if (!q || busy) return;
    setQuestion("");
    setBusy(true);
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, role: "user", text: q }]);
    try {
      const res = await base44.functions.invoke("ask-tackly-ai", { session_id: sessionId, question: q });
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        res.data?.question || { id: tempId, role: "user", text: q },
        ...(res.data?.answer ? [res.data.answer] : []),
      ]);
      // The request can outlive the panel being closed mid-flight — check the
      // CURRENT open state via ref, not the value this closure captured.
      if (!openRef.current) setUnread(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "assistant", text: "Something went wrong — try again?" },
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
              <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                <Sparkles className="h-3.5 w-3.5 text-periwinkle-deep" />
                TacklyAI
              </span>
              <button
                onClick={() => setOpen(false)}
                title="Hide"
                className="flex h-6 w-6 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
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
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      m.role === "user" ? "ml-auto bg-periwinkle text-white" : "bg-paper-sunken text-ink"
                    }`}
                  >
                    {m.text}
                  </div>
                ))
              )}
              {busy && (
                <div className="max-w-[85%] rounded-xl bg-paper-sunken px-3 py-2 text-sm text-ink-faint">
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
                className="h-9 flex-1 rounded-lg border border-line bg-paper px-3 text-sm placeholder:text-ink-faint focus:border-periwinkle disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={busy || !question.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-periwinkle text-white transition-colors hover:bg-periwinkle-deep disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
