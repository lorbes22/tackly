// Small compatibility badges — Tackly's meeting bot works with all of these.
// Simplified brand-colored glyphs rather than pixel-exact logo reproductions
// (fine for a small "works with" strip), except Slack's mark, which is
// simple/iconic enough to approximate closely.

export function GoogleMeetIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
      <rect width="36" height="36" rx="10" fill="#00897B" />
      <rect x="9" y="12" width="14" height="12" rx="2.5" fill="#fff" />
      <path d="M23 16.5l5-3v9l-5-3z" fill="#fff" />
    </svg>
  );
}

export function TeamsIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
      <rect width="36" height="36" rx="10" fill="#5059C9" />
      <circle cx="15" cy="14" r="4" fill="#fff" />
      <circle cx="24" cy="15" r="3" fill="#fff" opacity="0.85" />
      <rect x="9" y="19" width="14" height="8" rx="4" fill="#fff" />
      <rect x="21" y="19" width="6.5" height="6.5" rx="3.25" fill="#fff" opacity="0.85" />
    </svg>
  );
}

export function ZoomIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
      <rect width="36" height="36" rx="10" fill="#2D8CFF" />
      <rect x="8" y="13" width="14" height="10" rx="2.5" fill="#fff" />
      <path d="M22 17l6-3.5v9L22 19z" fill="#fff" />
    </svg>
  );
}

export function SlackIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
      <rect width="36" height="36" rx="10" fill="#fff" />
      <g>
        <rect x="13" y="6" width="3.4" height="9" rx="1.7" fill="#36C5F0" />
        <rect x="17" y="6" width="3.4" height="9" rx="1.7" fill="#36C5F0" opacity="0.4" />
        <rect x="21" y="13" width="9" height="3.4" rx="1.7" fill="#2EB67D" />
        <rect x="21" y="17" width="9" height="3.4" rx="1.7" fill="#2EB67D" opacity="0.4" />
        <rect x="19.6" y="21" width="3.4" height="9" rx="1.7" fill="#ECB22E" />
        <rect x="15.6" y="21" width="3.4" height="9" rx="1.7" fill="#ECB22E" opacity="0.4" />
        <rect x="6" y="19.6" width="9" height="3.4" rx="1.7" fill="#E01E5A" />
        <rect x="6" y="15.6" width="9" height="3.4" rx="1.7" fill="#E01E5A" opacity="0.4" />
      </g>
    </svg>
  );
}

export function WebexIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
      <rect width="36" height="36" rx="10" fill="#00BCEB" />
      <circle cx="18" cy="18" r="8" fill="#fff" />
      <circle cx="18" cy="18" r="3.5" fill="#00BCEB" />
    </svg>
  );
}

export const PLATFORM_ICONS = [
  { Icon: GoogleMeetIcon, label: "Google Meet" },
  { Icon: TeamsIcon, label: "Microsoft Teams" },
  { Icon: ZoomIcon, label: "Zoom" },
  { Icon: SlackIcon, label: "Slack" },
  { Icon: WebexIcon, label: "Webex" },
];

// Inline row (used on the landing page's "Join a meeting" card).
export function PlatformIconRow({ className = "" }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`} title="Works with Google Meet, Microsoft Teams, Zoom, Slack, and Webex">
      {PLATFORM_ICONS.map(({ Icon, label }) => (
        <Icon key={label} className="h-5 w-5 rounded-md shadow-sm" />
      ))}
    </div>
  );
}

// Circular white pills, overlapping slightly (used next to a card title).
export function PlatformIconPills({ className = "" }) {
  return (
    <div className={`flex items-center -space-x-1.5 ${className}`} title="Works with Google Meet, Microsoft Teams, Zoom, Slack, and Webex">
      {PLATFORM_ICONS.map(({ Icon, label }) => (
        <span
          key={label}
          className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-white shadow-sm"
        >
          <Icon className="h-3.5 w-3.5 rounded-full" />
        </span>
      ))}
    </div>
  );
}
