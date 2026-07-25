import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "Do I need to install anything?",
    a: "No. Tackly runs in your browser — hold to talk, invite the bot to a call, or paste a transcript. Nothing to download.",
  },
  {
    q: "Does it work for solo thinking, not just meetings?",
    a: "Yes — that's actually where Tackly started. Hold the mic and think out loud whenever you're alone; it maps you just as well as it maps a room full of people.",
  },
  {
    q: "What happens to my recordings and transcripts?",
    a: "They're used only to build your boards. See the Privacy Policy for the full detail on what's collected and how it's handled.",
  },
  {
    q: "Can I get my board out of Tackly?",
    a: "Yes — export any board as a PNG, an SVG, or Markdown you can hand straight to an AI assistant.",
  },
  {
    q: "What's the AI Assistant?",
    a: "A chat scoped to one board at a time — ask things like \"what was the main action?\" or \"what risks came up?\" and get answers grounded only in that thread's own nodes and transcript, never anything else. It's free on every plan, and nothing about the conversation is stored — leave the board and it's gone.",
  },
  {
    q: "What does it cost?",
    a: "Tackly's free while it's being built. Paid plans are on the way for heavier use, but nothing changes underfoot without notice.",
  },
];

function FaqItem({ item, open, onToggle }) {
  return (
    <div className="rounded-2xl border-2 border-ink bg-paper-raised shadow-brutal-sm">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="font-display text-base font-bold text-ink">{item.q}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-4 text-sm leading-relaxed text-ink-soft">{item.a}</p>
        </div>
      </div>
    </div>
  );
}

export function Faq() {
  const [openIndex, setOpenIndex] = useState(-1);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:py-24">
      <h2 className="text-center font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        Questions, answered
      </h2>
      <div className="mt-8 space-y-3">
        {FAQS.map((item, i) => (
          <FaqItem
            key={item.q}
            item={item}
            open={openIndex === i}
            onToggle={() => setOpenIndex((cur) => (cur === i ? -1 : i))}
          />
        ))}
      </div>
    </section>
  );
}
