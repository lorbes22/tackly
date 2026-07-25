import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";

const LINK_GROUPS = [
  {
    heading: "Product",
    links: [
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
  return (
    <footer className="border-t border-line bg-paper-sunken">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-ink-faint">Talk it out. See what you think.</p>
        </div>
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
      <div className="border-t border-line">
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
