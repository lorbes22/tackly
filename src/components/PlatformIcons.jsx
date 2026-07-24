import { LogoMark } from "@/components/Logo";

// Real brand SVGs (user-provided), served as static files from public/icons.
// Tackly's own mark is appended at the end of the list as a component
// instead of a file, since we already have it.
const PLATFORM_FILES = [
  { src: "/icons/google-meet.svg", label: "Google Meet" },
  { src: "/icons/microsoft-teams.svg", label: "Microsoft Teams" },
  { src: "/icons/zoom.svg", label: "Zoom" },
  { src: "/icons/slack.svg", label: "Slack" },
  { src: "/icons/webex.svg", label: "Webex" },
];

const ALL_LABEL = "Works with Google Meet, Microsoft Teams, Zoom, Slack, Webex, and Tackly";

// Inline row (used next to a card title).
export function PlatformIconRow({ className = "" }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`} title={ALL_LABEL}>
      {PLATFORM_FILES.map(({ src, label }) => (
        <img key={label} src={src} alt={label} className="h-5 w-5 rounded-md" />
      ))}
      <LogoMark className="h-5 w-5 rounded-md" />
    </div>
  );
}

// Circular white pills, overlapping slightly (used next to a card title).
export function PlatformIconPills({ className = "" }) {
  return (
    <div className={`flex items-center -space-x-1.5 ${className}`} title={ALL_LABEL}>
      {PLATFORM_FILES.map(({ src, label }) => (
        <span
          key={label}
          className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-white shadow-sm"
        >
          <img src={src} alt={label} className="h-3.5 w-3.5 rounded-full" />
        </span>
      ))}
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-white shadow-sm">
        <LogoMark className="h-3.5 w-3.5 rounded-full" />
      </span>
    </div>
  );
}
