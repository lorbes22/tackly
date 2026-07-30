import { ArrowDown, Mic, Sparkles } from "lucide-react";
import { NodeCard } from "@/components/NodeCard";

// Reused for card 1's decorative "listening" visual — same equalizer-bar
// language as the real hold-to-talk indicator (LiveBars.jsx), just bigger,
// so this card previews something that actually looks like the product
// rather than a generic icon.
function MicPulse() {
  return (
    <div className="flex h-full items-center justify-center py-10">
      <span className="flex items-end gap-2" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="w-2.5 origin-bottom rounded-full bg-ink animate-eq-bar"
            style={{ height: "40px", animationDelay: `${i * 120}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

const CARDS = [
  {
    bg: "bg-note-mint",
    icon: Mic,
    title: "You talk.",
    body: "Hold to talk, invite the bot into a meeting, or paste a transcript — however the thought shows up.",
    preview: <MicPulse />,
  },
  {
    bg: "bg-note-amber",
    icon: Sparkles,
    title: "Tackly listens and maps it live.",
    body: "Every sentence gets weighed, classified, and placed on the board while you're still talking — not after.",
    preview: (
      <div className="flex h-full items-center justify-center py-8" aria-hidden="true">
        <NodeCard
          node={{
            type: "decision",
            title: "Ship the beta Friday",
            summary: "QA signs off, then we go.",
            rotation_deg: -2,
            status: "na",
          }}
          forming
        />
      </div>
    ),
  },
  {
    bg: "bg-note-sky",
    icon: ArrowDown,
    title: "You get a living map, not a transcript.",
    body: "Decisions, risks, questions, actions — structured and connected, not just words on a page.",
    preview: (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-6" aria-hidden="true">
        <NodeCard
          node={{ type: "risk", title: "Legal sign-off missing", summary: null, rotation_deg: -1.5, status: "open" }}
        />
        <ArrowDown className="h-4 w-4 text-ink-faint" />
        <NodeCard
          node={{ type: "action", title: "Priya: chase legal today", summary: null, rotation_deg: 1.5, status: "na" }}
        />
      </div>
    ),
  },
];

// Same sticky-stack technique as the AI Assistant / Ready-to-share pair —
// pure CSS `position: sticky` with an increasing top offset and z-index per
// card, no scroll listener needed. Each card settles a little lower than
// the one before it, so as you scroll past, the next card slides up and
// fans out just below the previous one instead of just replacing it.
export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto w-full max-w-6xl px-4 pb-16 sm:pb-24 sm:scroll-mt-8">
      <div className="mx-auto max-w-xl text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-periwinkle-deep">How it works</p>
        <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Say it once. Watch it map itself.
        </h2>
      </div>

      <div className="relative mt-10">
        {CARDS.map(({ bg, icon: Icon, title, body, preview }, i) => (
          <div
            key={title}
            className="sticky"
            style={{ top: `${4.5 + i * 1.5}rem`, zIndex: i + 1, marginBottom: i === CARDS.length - 1 ? 0 : "1.5rem" }}
          >
            <div
              className={`grid items-center gap-6 rounded-2xl border-2 border-ink p-6 shadow-brutal sm:grid-cols-2 sm:p-8 ${bg}`}
            >
              <div className={i % 2 === 1 ? "sm:order-last" : ""}>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink bg-paper-raised">
                  <Icon className="h-5 w-5 text-ink" />
                </div>
                <p className="mt-4 font-display text-xl font-bold text-ink">{title}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink/70">{body}</p>
              </div>
              {preview}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
