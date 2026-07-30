import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/AuthContext";
import { ArrowRight } from "lucide-react";

const LINK_GROUPS = [
  {
    heading: "Product",
    links: [
      { to: "/#how-it-works", label: "How it works" },
      { to: "/plans", label: "Pricing" },
      { to: "/articles", label: "Articles" },
    ],
  },
  {
    heading: "Company",
    links: [
      { to: "/support", label: "Support" },
      { to: "/terms", label: "Terms" },
      { to: "/privacy", label: "Privacy" },
    ],
  },
];

export function SiteFooter() {
  const { user } = useAuth();

  return (
    <footer className="relative overflow-hidden border-t-2 border-ink bg-paper-sunken">
      {/* Same dot-grid nod used behind the hero, faded in at the top edge
          only — a quiet bookend rather than a repeat of the same big moment. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{
          backgroundImage: "radial-gradient(circle, #E8E4DC 1.5px, transparent 1.5px)",
          backgroundSize: "28px 28px",
          maskImage: "linear-gradient(to bottom, black, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-12 pt-16 sm:pt-20">
        <div className="flex flex-col items-start justify-between gap-8 border-b border-line pb-12 sm:flex-row sm:items-end">
          <div>
            <Logo />
            <p className="mt-4 max-w-sm font-display text-2xl font-bold leading-snug tracking-tight text-ink sm:text-3xl">
              Talk it out. Watch your thinking take shape.
            </p>
          </div>
          <Link
            to={user ? "/app" : "/signup"}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 border-ink bg-periwinkle px-5 font-display text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5 hover:bg-periwinkle-deep"
          >
            {user ? "Open your threads" : "Try it for free"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-10 pt-12 sm:grid-cols-[1.4fr_1fr_1fr]">
          <p className="max-w-xs text-sm text-ink-faint">
            An AI notetaker that maps what you actually think — not just what you said.
          </p>
          {LINK_GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="font-display text-xs font-bold uppercase tracking-widest text-ink-faint">
                {group.heading}
              </p>
              <nav className="mt-3 flex flex-col gap-2 text-sm text-ink-soft" aria-label={group.heading}>
                {group.links.map((l) => (
                  <Link key={l.to} to={l.to} className="w-fit hover:text-ink">
                    {l.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>
      </div>

      <div className="relative border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Tackly Inc.</span>
          <a href="mailto:hello@tackly.co" className="hover:text-ink">
            hello@tackly.co
          </a>
        </div>
      </div>
    </footer>
  );
}
