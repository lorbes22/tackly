import { Logo } from "@/components/Logo";

const backdropNotes = [
  { color: "bg-note-lavender", rotation: "-rotate-6", pos: "left-[8%] top-[18%]" },
  { color: "bg-note-mint", rotation: "rotate-3", pos: "left-[4%] top-[58%]" },
  { color: "bg-note-amber", rotation: "rotate-6", pos: "right-[6%] top-[22%]" },
  { color: "bg-note-sky", rotation: "-rotate-3", pos: "right-[9%] top-[64%]" },
];

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-paper px-4 py-12">
      {backdropNotes.map((n, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`absolute hidden h-24 w-24 rounded-note opacity-60 shadow-note lg:block ${n.color} ${n.rotation} ${n.pos}`}
        />
      ))}

      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-2xl border border-line bg-paper-raised p-8 shadow-panel">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            {title}
          </h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-soft">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function GoogleButton({ onClick, label = "Continue with Google" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-paper-raised text-sm font-medium text-ink transition-colors hover:bg-paper-sunken"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.97 10.97 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        />
      </svg>
      {label}
    </button>
  );
}

export function Divider() {
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden="true">
      <div className="h-px flex-1 bg-line" />
      <span className="text-xs font-medium uppercase tracking-wider text-ink-faint">
        or
      </span>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}

export function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <input
        {...props}
        className="h-11 w-full rounded-xl border border-line bg-paper-raised px-3.5 text-sm text-ink placeholder:text-ink-faint focus:border-periwinkle"
      />
    </label>
  );
}

export function SubmitButton({ children, busy, ...props }) {
  return (
    <button
      type="submit"
      disabled={busy}
      {...props}
      className="flex h-11 w-full items-center justify-center rounded-xl bg-periwinkle text-sm font-semibold text-white transition-colors hover:bg-periwinkle-deep disabled:opacity-60"
    >
      {busy ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      ) : (
        children
      )}
    </button>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <p className="rounded-lg bg-note-coral px-3 py-2 text-sm text-ink" role="alert">
      {children}
    </p>
  );
}
