import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/AuthContext";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { HeroNodePopups } from "@/components/landing/HeroNodePopups";
import { ScrollRevealText } from "@/components/landing/ScrollRevealText";
import { Faq } from "@/components/landing/Faq";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { PlatformIconRow } from "@/components/PlatformIcons";
import { ArrowRight, FileUp, Mic, Users } from "lucide-react";

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

  useDocumentMeta({
    title: "Tackly — listens while you speak, builds your thinking in real time",
    description:
      "Talk solo, join a meeting, or upload a transcript — Tackly turns it into a living map of ideas, decisions, and questions in real time.",
  });

  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
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
      </header>

      <main>
        <section className="relative mx-auto w-full max-w-5xl overflow-hidden px-4 py-16 sm:py-24">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-periwinkle-tint opacity-70 blur-3xl"
          />
          <HeroNodePopups />
          <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center text-center">
            <span
              className="animate-fade-up rounded-full border-2 border-ink bg-paper-raised px-3.5 py-1 text-xs font-bold uppercase tracking-widest text-ink-soft shadow-brutal-sm"
            >
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
                className="inline-block animate-fade-up text-periwinkle"
                style={{ animationDelay: "420ms" }}
              >
                thinking map.
              </span>
            </h1>
            <p
              className="mt-6 max-w-lg animate-fade-up text-lg leading-relaxed text-ink-soft"
              style={{ animationDelay: "580ms" }}
            >
              Tackly listens whilst you speak — and builds your thinking in real time.
            </p>
            <div className="mt-8 animate-fade-up" style={{ animationDelay: "700ms" }}>
              <Link to={user ? "/app" : "/signup"} className={PRIMARY_CTA_CLASS}>
                Try it for free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:pb-24">
          <div className="grid gap-5 sm:grid-cols-3">
            {HOW_IT_WORKS.map(({ icon: Icon, title, body, platforms }) => (
              <div
                key={title}
                className="rounded-2xl border-2 border-ink bg-paper-raised p-6 shadow-brutal-sm transition-transform hover:-translate-y-1"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-periwinkle-tint">
                  <Icon className="h-5 w-5 text-periwinkle-deep" />
                </div>
                <p className="mt-4 font-display text-lg font-bold text-ink">{title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{body}</p>
                {platforms && <PlatformIconRow className="mt-3" />}
              </div>
            ))}
          </div>
        </section>

        <ScrollRevealText text={ABOUT_TEXT} />

        <Faq />

        <section className="border-y border-line bg-periwinkle-tint">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-16 text-center sm:py-20">
            <h2 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Ready to see what you actually think?
            </h2>
            <p className="mt-3 max-w-md text-ink-soft">
              No card. No setup. Just talk.
            </p>
            <Link to={user ? "/app" : "/signup"} className={`mt-7 ${PRIMARY_CTA_CLASS}`}>
              Try it for free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
