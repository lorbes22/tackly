import { Link } from "react-router-dom";
import { LogoMark } from "@/components/Logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-paper-sunken">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <LogoMark className="h-7 w-7" />
          <div>
            <p className="font-display text-lg font-bold tracking-tight text-ink">tackly</p>
            <p className="text-sm text-ink-faint">Talk it out. See what you think.</p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-soft" aria-label="Legal">
          <Link to="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link to="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link to="/support" className="hover:text-ink">
            Support
          </Link>
          <a href="mailto:hello@tackly.co" className="hover:text-ink">
            hello@tackly.co
          </a>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 text-xs text-ink-faint">
          <span>© {new Date().getFullYear()} Tackly Inc.</span>
          <span>tackly.co</span>
        </div>
      </div>
    </footer>
  );
}
