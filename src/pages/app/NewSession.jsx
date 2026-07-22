import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { parseTranscript } from "@/lib/transcript";
import { FileText, Mic, Upload } from "lucide-react";

const CHUNK = 200;

export default function NewSession() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = params.get("mode") === "talk" ? "talk" : "import";

  const [title, setTitle] = useState("");
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const parsed = raw.trim() ? parseTranscript(raw) : [];

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRaw(await file.text());
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (parsed.length === 0) {
      setError("Paste or upload a transcript first — we need words to map.");
      return;
    }
    setBusy(true);
    try {
      const session = await base44.entities.Session.create({
        type: "meeting",
        title:
          title.trim() ||
          `Meeting — ${new Date().toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}`,
        source: "import",
        status: "processing",
        started_at: new Date().toISOString(),
      });

      for (let i = 0; i < parsed.length; i += CHUNK) {
        await base44.entities.Utterance.bulkCreate(
          parsed.slice(i, i + CHUNK).map((u) => ({ ...u, session_id: session.id }))
        );
      }

      base44.entities.UsageEvent.create({
        event_type: "transcript_imported",
        meta: { session_id: session.id, utterances: parsed.length },
      }).catch(() => {});

      navigate(`/app/board/${session.id}`);
    } catch (err) {
      setError(err.message || "Couldn't create the session. Try again.");
      setBusy(false);
    }
  };

  if (mode === "talk") {
    return (
      <div className="mx-auto max-w-xl animate-fade-up text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-periwinkle-tint">
          <Mic className="h-6 w-6 text-periwinkle-deep" />
        </div>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink">
          Start talking
        </h1>
        <p className="mt-2 text-ink-soft">
          Hold-to-talk live capture is the next phase of the build. Meanwhile,
          meeting transcripts already map — try adding one.
        </p>
        <button
          onClick={() => navigate("/app/new?mode=import")}
          className="mt-6 h-11 rounded-xl bg-periwinkle px-5 text-sm font-semibold text-white transition-colors hover:bg-periwinkle-deep"
        >
          Add a meeting instead
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
        Add a meeting
      </h1>
      <p className="mt-1 text-ink-soft">
        Paste a transcript — or upload one — and Tackly maps it into nodes.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Product sync — onboarding rework"
            className="h-11 w-full rounded-xl border border-line bg-paper-raised px-3.5 text-sm placeholder:text-ink-faint focus:border-periwinkle"
          />
        </label>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Transcript</span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 text-sm font-medium text-periwinkle hover:text-periwinkle-deep"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload a file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.vtt,.srt,.md"
              onChange={handleFile}
              className="hidden"
            />
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={12}
            placeholder={`Priya: Let's get started — today is about the onboarding rework.\nDan: Activation dropped to 34% last month.\nPriya: What if onboarding was a single question?`}
            className="w-full resize-y rounded-xl border border-line bg-paper-raised p-3.5 font-mono text-[13px] leading-relaxed placeholder:text-ink-faint focus:border-periwinkle"
          />
          <p className="mt-1.5 text-xs text-ink-faint">
            {parsed.length > 0
              ? `${parsed.length} utterances detected${
                  parsed.some((u) => u.speaker_label)
                    ? ` · speakers: ${[
                        ...new Set(parsed.map((u) => u.speaker_label).filter(Boolean)),
                      ]
                        .slice(0, 4)
                        .join(", ")}`
                    : ""
                }`
              : "Lines like “Name: what they said” keep speakers attached."}
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-note-coral px-3 py-2 text-sm text-ink" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || parsed.length === 0}
          className="flex h-12 items-center gap-2 rounded-xl bg-periwinkle px-6 text-sm font-semibold text-white transition-colors hover:bg-periwinkle-deep disabled:opacity-50"
        >
          {busy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          Map this meeting
        </button>
      </form>
    </div>
  );
}
