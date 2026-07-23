import { useState } from "react";
import { Mic, Users, FileText, Download } from "lucide-react";

// Small decorative preview: 4 mini node cards pop in and connect, looping,
// to give a first-glance feel for what the real board does — much smaller
// and simpler than the real NodeCard/EdgeLayer, purely illustrative.
function NodePreview() {
  const cards = [
    { key: "a", label: "Topic", type: "New feature idea", cls: "bg-note-teal border-note-teal-edge", x: 8, y: 6, delay: "0s" },
    { key: "b", label: "Idea", type: "Ship it Friday", cls: "bg-note-lavender border-note-lavender-edge", x: 172, y: 0, delay: "0.35s" },
    { key: "c", label: "Question", type: "Who owns this?", cls: "bg-note-amber border-note-amber-edge", x: 20, y: 96, delay: "0.7s" },
    { key: "d", label: "Decision", type: "Launch Monday", cls: "bg-note-sky border-note-sky-edge", x: 188, y: 104, delay: "1.05s" },
  ];
  const lines = [
    { x1: 78, y1: 34, x2: 172, y2: 26, delay: "0.6s" },
    { x1: 60, y1: 46, x2: 60, y2: 96, delay: "0.95s" },
    { x1: 232, y1: 40, x2: 228, y2: 104, delay: "1.3s" },
  ];

  return (
    <div className="relative mx-auto h-[150px] w-[360px] max-w-full">
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="#C3BFB6"
            strokeWidth="2"
            strokeDasharray="4 3"
            className="animate-onboard-line"
            style={{ animationDelay: l.delay }}
          />
        ))}
      </svg>
      {cards.map((c) => (
        <div
          key={c.key}
          className={`absolute w-[150px] rounded-lg border-2 px-2.5 py-1.5 shadow-brutal-sm animate-onboard-card ${c.cls}`}
          style={{ left: c.x, top: c.y, animationDelay: c.delay }}
        >
          <div className="text-[9px] font-bold uppercase tracking-wide text-ink-soft">
            {c.label}
          </div>
          <div className="truncate text-xs font-semibold text-ink">{c.type}</div>
        </div>
      ))}
    </div>
  );
}

const FEATURES = [
  {
    icon: Mic,
    title: "Solo",
    body: "Hold to talk and think out loud — nodes appear as you go.",
  },
  {
    icon: Users,
    title: "Meetings",
    body: "Invite the Tackly bot to a call. It listens and maps in real time — no setup.",
  },
  {
    icon: FileText,
    title: "Transcripts",
    body: "Paste in any transcript to map it after the fact.",
  },
  {
    icon: Download,
    title: "Export anywhere",
    body: "Export a board as an image, or as markdown to hand straight to Claude.",
  },
];

export function OnboardingModal({ waitlistMode, onDone }) {
  const [step, setStep] = useState(0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-md rounded-2xl border-2 border-ink bg-paper-raised p-7 text-center shadow-brutal animate-fade-up">
        {step === 0 ? (
          <>
            <p className="font-display text-2xl font-bold text-ink">Meet Tackly</p>
            <p className="mt-2 text-sm text-ink-soft">
              Talk it out. Watch your ideas, decisions, and questions map themselves as you go.
            </p>
            <div className="mt-5">
              <NodePreview />
            </div>
            {waitlistMode && (
              <p className="mt-5 rounded-lg bg-note-lavender px-3 py-2 text-xs font-medium text-ink">
                I'm still building Tackly, so you can enjoy it for free in the meantime.
              </p>
            )}
            <button
              onClick={() => setStep(1)}
              className="mt-6 h-11 w-full rounded-xl border-2 border-ink bg-periwinkle font-display text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5"
            >
              Get started
            </button>
          </>
        ) : (
          <>
            <p className="font-display text-2xl font-bold text-ink">What you can do</p>
            <div className="mt-5 space-y-3 text-left">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex items-start gap-3 rounded-xl bg-paper-sunken p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-periwinkle-tint">
                    <f.icon className="h-4 w-4 text-periwinkle-deep" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-ink">{f.title}</p>
                    <p className="text-xs text-ink-soft">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={onDone}
              className="mt-6 h-11 w-full rounded-xl border-2 border-ink bg-periwinkle font-display text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5"
            >
              Start mapping
            </button>
          </>
        )}
      </div>
    </div>
  );
}
