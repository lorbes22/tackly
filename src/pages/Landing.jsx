import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/AuthContext";
import { ArrowRight } from "lucide-react";

// Static hero cluster — a taste of the board, in the real node palette
const heroNotes = [
  {
    type: "Idea",
    text: "What if onboarding was one question?",
    color: "bg-note-lavender",
    edge: "border-note-lavender-edge",
    rotation: "-rotate-3",
    pos: "left-0 top-4",
  },
  {
    type: "Decision",
    text: "Ship the beta to 20 users Friday",
    color: "bg-note-sky",
    edge: "border-note-sky-edge",
    rotation: "rotate-2",
    pos: "left-40 top-0",
  },
  {
    type: "Question",
    text: "Who owns the pricing page?",
    color: "bg-note-amber",
    edge: "border-note-amber-edge",
    rotation: "rotate-6",
    pos: "left-16 top-36",
    dashed: true,
  },
  {
    type: "Action",
    text: "Maya → draft the launch email",
    color: "bg-note-gold",
    edge: "border-note-gold-edge",
    rotation: "-rotate-2",
    pos: "left-64 top-44",
  },
];

function HeroNote({ note, index }) {
  return (
    <div
      className={`absolute w-44 rounded-note border p-3.5 shadow-note ${note.color} ${note.rotation} ${note.pos} ${
        note.dashed ? "border-dashed" : ""
      } ${note.edge} animate-pop-in`}
      style={{ animationDelay: `${300 + index * 180}ms` }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink/50">
        {note.type}
      </span>
      <p className="mt-1 text-sm font-medium leading-snug text-ink">{note.text}</p>
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? (
            <Link
              to="/app"
              className="flex h-10 items-center gap-1.5 rounded-xl bg-periwinkle px-4 text-sm font-semibold text-white transition-colors hover:bg-periwinkle-deep"
            >
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
              <Link
                to="/signup"
                className="flex h-10 items-center rounded-xl bg-periwinkle px-4 text-sm font-semibold text-white transition-colors hover:bg-periwinkle-deep"
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4">
        <section className="grid items-center gap-12 py-16 lg:grid-cols-2 lg:py-24">
          <div className="animate-fade-up">
            <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">
              Talk it out.
              <br />
              <span className="text-periwinkle">See what you think.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">
              Tackly turns meetings and rambling voice notes into a living map of
              ideas, decisions, and questions — one that remembers what you said
              last week.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/signup"
                className="flex h-12 items-center gap-2 rounded-xl bg-periwinkle px-6 text-base font-semibold text-white shadow-note transition-all hover:-translate-y-0.5 hover:bg-periwinkle-deep hover:shadow-note-lg"
              >
                Start mapping — free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <span className="text-sm text-ink-faint">
                No card. No setup. Just talk.
              </span>
            </div>
          </div>

          <div className="relative mx-auto hidden h-80 w-[28rem] lg:block" aria-hidden="true">
            {heroNotes.map((note, i) => (
              <HeroNote key={note.type} note={note} index={i} />
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 text-sm text-ink-faint">
          <span>© {new Date().getFullYear()} Tackly</span>
          <span>tackly.co</span>
        </div>
      </footer>
    </div>
  );
}
