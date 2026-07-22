import { Link } from "react-router-dom";

export function LogoMark({ className = "h-8 w-8" }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" className="fill-periwinkle" />
      <g transform="rotate(-6 32 32)">
        <rect x="17" y="17" width="30" height="30" rx="5" className="fill-paper" />
        <rect x="22" y="26" width="20" height="3" rx="1.5" className="fill-note-lavender-edge" />
        <rect x="22" y="33" width="14" height="3" rx="1.5" className="fill-note-lavender-edge" />
      </g>
    </svg>
  );
}

export function Logo({ to = "/", className = "" }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 rounded-lg ${className}`}
    >
      <LogoMark />
      <span className="font-display text-xl font-bold tracking-tight text-ink">
        tackly
      </span>
    </Link>
  );
}
