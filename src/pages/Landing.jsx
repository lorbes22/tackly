import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/AuthContext";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { HeroNodePopups } from "@/components/landing/HeroNodePopups";
import { HeroMethodCards } from "@/components/landing/HeroMethodCards";
import { TalkingBars } from "@/components/landing/TalkingBars";
import { Badges } from "@/components/landing/Badges";
import { ScrollRevealText } from "@/components/landing/ScrollRevealText";
import { TacklyAIPreview } from "@/components/landing/TacklyAIPreview";
import { ShareBoardPreview } from "@/components/landing/ShareBoardPreview";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Faq } from "@/components/landing/Faq";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { PlanCards } from "@/components/PlanCards";
import { ArrowRight, FileUp, Mic, Share2, Sparkles, Users } from "lucide-react";

const HOW_IT_WORKS = [
  {
    icon: Mic,
    title: "Talk solo",
    body: "Hold to talk whenever an idea shows up. Tackly turns the ramble into a structured map as you go.",
  },
  {
    icon: Users,
    title: "Join a meeting",
    body: "Tackly's bot joins your call, listens in real time, and builds the board while everyone's still talking.",
    platforms: true,
  },
  {
    icon: FileUp,
    title: "Upload a transcript",
    body: "Already have one? Paste or upload it and get the same living map, no meeting required.",
  },
];

const ABOUT_TEXT =
  "Every call 📞. Every rambling idea 💡. Every meeting 🗣️. All turned into a living map 🧠 — automatically.";

const NAV_CTA_CLASS =
  "flex h-10 items-center gap-1.5 rounded-xl border-2 border-ink bg-periwinkle px-4 font-display text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5 hover:bg-periwinkle-deep";

const PRIMARY_CTA_CLASS =
  "flex h-12 items-center gap-2 rounded-xl border-2 border-ink bg-periwinkle px-7 font-display text-base font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5 hover:bg-periwinkle-deep";

export default function Landing() {
  const { user } = useAuth();
  const { hash } = useLocation();

  // React Router's <Link> to a same-page hash (the footer's "How it works")
  // just updates the URL without scrolling — only a genuine full navigation
  // gets the browser's native hash-scroll behavior for free. One-time
  // scrollIntoView per hash change, not a scroll listener, so this can't
  // reintroduce the class of bug FINDINGS.md warns about.
  useEffect(() => {
    if (!hash) return;
    const el = document.querySelector(hash);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash]);

  useDocumentMeta({
    title: "Tackly — the AI notetaker that maps your thinking, not just your transcript",
    description:
      "Most AI notetakers hand you a transcript with a summary bolted on. Tackly maps ideas, decisions, risks, and questions live — from meetings, solo voice notes, or a pasted transcript — so you get structure, not just text.",
  });

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-paper/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="flex items-center gap-2">
            {user ? (
              <Link to="/app" className={NAV_CTA_CLASS}>
                Open your threads
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="flex h-10 items-center rounded-xl px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
                >
                  Log in
                </Link>
                <Link to="/signup" className={NAV_CTA_CLASS}>
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="relative mx-auto w-full max-w-5xl overflow-hidden px-4 py-16 sm:py-24">
          {/* The board canvas's own dot-grid, faded in behind the hero — a
              quiet nod that this marketing page sits on the same "paper" as
              the real product. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: "radial-gradient(circle, #E8E4DC 1.5px, transparent 1.5px)",
              backgroundSize: "28px 28px",
              maskImage: "radial-gradient(ellipse 60% 55% at 50% 30%, black 0%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse 60% 55% at 50% 30%, black 0%, transparent 75%)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-periwinkle-tint opacity-70 blur-3xl"
          />
          <HeroNodePopups />
          <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center text-center">
            <Badges />
            <span className="animate-fade-up flex items-center gap-2 rounded-full border-2 border-ink bg-paper-raised px-3.5 py-1 text-xs font-bold uppercase tracking-widest text-ink-soft shadow-brutal-sm">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-periwinkle opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-periwinkle" />
              </span>
              Now mapping thought in real time
            </span>
            <h1 className="mt-5 flex flex-wrap justify-center gap-x-3 gap-y-1 font-display text-5xl font-bold leading-[1.1] tracking-tight text-ink sm:text-7xl">
              {["Turn", "speech", "into", "a"].map((word, i) => (
                <span
                  key={word}
                  className="inline-block animate-fade-up"
                  style={{ animationDelay: `${60 + i * 90}ms` }}
                >
                  {word}
                </span>
              ))}
              <span
                className="relative inline-block animate-fade-up"
                style={{ animationDelay: "420ms" }}
              >
                thinking map.
                {/* A hand-drawn underline carries the accent color instead of
                    filling the text with it — reads as a highlight, not a
                    second color competing with the rest of the headline. */}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 200 14"
                  preserveAspectRatio="none"
                  className="absolute -bottom-1 left-0 h-[0.22em] w-full text-periwinkle sm:-bottom-2"
                >
                  <path
                    d="M2,9 Q40,2 75,7 T150,6 T198,9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="7"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>
            <p
              className="mt-7 max-w-lg animate-fade-up text-lg leading-relaxed text-ink-soft"
              style={{ animationDelay: "580ms" }}
            >
              Tackly listens whilst you speak — and builds your thinking in real time.
            </p>
            <div
              className="mt-8 flex animate-fade-up flex-col items-center gap-2.5"
              style={{ animationDelay: "700ms" }}
            >
              <Link to={user ? "/app" : "/signup"} className={PRIMARY_CTA_CLASS}>
                Try it for free
                <TalkingBars />
              </Link>
              <p className="text-xs font-medium text-ink-faint">No credit card. Free to start.</p>
            </div>
          </div>
        </section>

        <HeroMethodCards items={HOW_IT_WORKS} />

        <ScrollRevealText text={ABOUT_TEXT} />

        {/* Both product deep-dives share one tinted band — a beat of visual
            rhythm between the plain-paper marketing sections above and
            below, and a cue that these two cards are "see it in action"
            rather than "read about it". */}
        <section className="border-y-2 border-ink/10 bg-paper-sunken py-16 sm:pb-40 sm:pt-24">
          <div className="relative mx-auto w-full max-w-6xl px-4">
            {/* Sticky-stack: each card pins a little lower than the one
                before it (pure CSS position:sticky, no scroll listener), so
                scrolling past fans them out like a small deck instead of
                just swapping one card for the next. */}
            <div
              className="sticky top-16 z-10 rounded-2xl border-2 border-ink bg-paper-raised p-6 shadow-brutal-sm sm:p-8"
              style={{ marginBottom: "1.5rem" }}
            >
              <div className="grid items-center gap-8 sm:grid-cols-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-periwinkle-tint">
                      <Sparkles className="h-5 w-5 text-periwinkle-deep" />
                    </div>
                    <p className="font-display text-xl font-bold text-ink">AI Assistant</p>
                    <span className="rounded-full border-2 border-ink bg-note-mint px-2.5 py-0.5 text-xs font-bold text-ink">
                      On every plan
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-ink-soft">
                    Ask questions right on the board — "what was the main action?", "what risks came up?" — and get
                    answers grounded only in that thread's own nodes and transcript. No digging back through the map
                    yourself, and nothing about the chat is stored — ask, get your answer, move on.
                  </p>
                </div>

                <TacklyAIPreview />
              </div>
            </div>

            <div className="sticky top-32 z-20 rounded-2xl border-2 border-ink bg-paper-raised p-6 shadow-brutal-sm sm:p-8">
              <div className="grid items-center gap-8 sm:grid-cols-2">
                <div className="sm:order-last">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-periwinkle-tint">
                      <Share2 className="h-5 w-5 text-periwinkle-deep" />
                    </div>
                    <p className="font-display text-xl font-bold text-ink">Ready to share</p>
                    <span className="rounded-full border-2 border-ink bg-note-sky px-2.5 py-0.5 text-xs font-bold text-ink">
                      No account needed
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-ink-soft">
                    Everything tackled, ready to share. One click turns a finished thread into a clean, read-only
                    board anyone can open — the map, not the meeting. Or invite up to three collaborators for full
                    access while you're still mapping it together.
                  </p>
                </div>

                <ShareBoardPreview />
              </div>
            </div>
          </div>
        </section>

        <HowItWorks />

        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:py-24">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-periwinkle-deep">
              Simple, honest pricing
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Plans &amp; pricing
            </h2>
            <p className="mt-3 text-ink-soft">
              Free to start — 30 minutes of rambling a month, meetings included.
            </p>
          </div>
          <PlanCards className="mx-auto mt-8 max-w-4xl" />
        </section>

        <Faq />

        <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:pb-24">
          <div className="relative overflow-hidden rounded-2xl border-2 border-ink bg-periwinkle px-4 py-16 text-center shadow-brutal sm:py-20">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-white/10 blur-2xl"
            />
            <h2 className="relative font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to see what you actually think?
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-periwinkle-tint/90">
              No card. No setup. Just talk.
            </p>
            <Link
              to={user ? "/app" : "/signup"}
              className="relative mt-7 inline-flex h-12 items-center gap-2 rounded-xl border-2 border-ink bg-white px-7 font-display text-base font-bold text-periwinkle-deep shadow-brutal-sm transition-transform hover:-translate-y-0.5"
            >
              Try it for free
              <TalkingBars />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
