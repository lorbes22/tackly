import { Link } from "react-router-dom";

export function LogoMark({ className = "h-8 w-8" }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" className="fill-periwinkle" />
      <g transform="rotate(-8 32 32)">
        <path
          d="M21,18 L43,18 A6,6 0 0 1 49,24 L49,28 A5,5 0 0 0 49,38 L49,42 A6,6 0 0 1 43,48 L21,48 A6,6 0 0 1 15,42 L15,24 A6,6 0 0 1 21,18 Z"
          className="fill-paper"
        />
        <rect x="20" y="25" width="22" height="3.4" rx="1.7" className="fill-note-lavender-edge" />
        <rect x="20" y="32.5" width="14" height="3.4" rx="1.7" className="fill-note-lavender-edge" />
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
