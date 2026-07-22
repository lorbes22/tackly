import { Mic, FileText } from "lucide-react";

export default function NewSession() {
  return (
    <div className="mx-auto max-w-xl animate-fade-up text-center">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
        New session
      </h1>
      <p className="mt-2 text-ink-soft">
        Capture is landing in the next build. Two ways in, both coming right up:
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-note bg-note-lavender p-6 text-left shadow-note -rotate-1">
          <Mic className="h-6 w-6 text-ink/70" />
          <h3 className="mt-3 font-display text-lg font-bold text-ink">
            Start talking
          </h3>
          <p className="mt-1 text-sm text-ink/70">
            Hold-to-talk live capture for solo thinking.
          </p>
        </div>
        <div className="rounded-note bg-note-sky p-6 text-left shadow-note rotate-1">
          <FileText className="h-6 w-6 text-ink/70" />
          <h3 className="mt-3 font-display text-lg font-bold text-ink">
            Add a meeting
          </h3>
          <p className="mt-1 text-sm text-ink/70">
            Paste or upload a transcript to map a meeting.
          </p>
        </div>
      </div>
    </div>
  );
}
