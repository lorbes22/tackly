import { useState } from "react";
import { FileText, Mic, Users, X } from "lucide-react";

const FEATURES = [
  {
    icon: Mic,
    title: "Talk solo",
    body: "Hold to talk and think out loud.",
  },
  {
    icon: Users,
    title: "Join a meeting",
    body: "Our bot listens and maps live.",
  },
  {
    icon: FileText,
    title: "Upload a transcript",
    body: "Paste one in, get a map back.",
  },
];

// Two steps: "Meet Tackly" (minimal, feature containers) then, only when
// waitlist mode is on, a dedicated step for the waitlist note. Without
// waitlist mode there's nothing more to say, so step 0's button finishes
// onboarding directly.
export function OnboardingModal({ waitlistMode, onDone, previewMode = false }) {
  const [step, setStep] = useState(0);
  const hasSecondStep = !!waitlistMode;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="relative w-full max-w-md rounded-2xl border-2 border-ink bg-paper-raised p-8 text-center shadow-brutal animate-fade-up">
        {previewMode && (
          <button
            onClick={onDone}
            title="Close preview"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {step === 0 ? (
          <>
            <p className="font-display text-4xl font-bold tracking-tight text-ink">Meet Tackly</p>
            <p className="mt-3 text-sm text-ink-soft">
              Talk it out. Watch your ideas, decisions, and questions map themselves.
            </p>
            <div className="mt-7 grid grid-cols-3 gap-2.5 text-left">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-xl border-2 border-ink bg-paper-sunken p-2.5">
                  <f.icon className="h-4 w-4 text-periwinkle-deep" />
                  <p className="mt-2 font-display text-xs font-bold leading-tight text-ink">
                    {f.title}
                  </p>
                  <p className="mt-1 text-[10px] leading-snug text-ink-soft">{f.body}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => (hasSecondStep ? setStep(1) : onDone())}
              className="mt-7 h-11 w-full rounded-xl border-2 border-ink bg-periwinkle font-display text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5"
            >
              {hasSecondStep ? "Continue" : "Get started"}
            </button>
          </>
        ) : (
          <>
            <p className="font-display text-3xl font-bold tracking-tight text-ink">
              Still early days 🌱
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
              I'm still building Tackly, so you can enjoy it for free in the meantime.
            </p>
            <button
              onClick={onDone}
              className="mt-8 h-11 w-full rounded-xl border-2 border-ink bg-periwinkle font-display text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5"
            >
              Get started
            </button>
          </>
        )}
      </div>
    </div>
  );
}
