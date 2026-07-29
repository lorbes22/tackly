import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { parseTranscript } from "@/lib/transcript";
import { Bot, FileText, Mic, Upload } from "lucide-react";

const CHUNK = 200;

function ModeTab({ to, icon: Icon, label, active }) {
  return (
    <Link
      to={to}
      className={`flex h-10 items-center gap-2 rounded-xl border-2 px-4 text-sm font-bold transition-all ${
        active
          ? "border-ink bg-note-lavender text-ink shadow-brutal-sm"
          : "border-transparent text-ink-soft hover:bg-paper-sunken hover:text-ink"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

export default function NewSession() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const mode = ["talk", "bot", "import"].includes(params.get("mode"))
    ? params.get("mode")
    : "import";

  const [title, setTitle] = useState("");
  const [raw, setRaw] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
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

  const checkQuota = async (sessionType) => {
    const res = await base44.functions.invoke("check-quota", {
      session_type: sessionType,
    });
    if (!res.data.allowed) {
      base44.entities.UsageEvent.create({
        user_id: user?.id,
        event_type: "paywall_shown",
        meta: { session_type: sessionType, reason: res.data.reason, plan_name: res.data.plan_name },
      }).catch(() => {});
      throw new Error(res.data.reason);
    }
  };

  const startTalking = async () => {
    setError("");
    setBusy(true);
    try {
      await checkQuota("personal");
      const session = await base44.entities.Session.create({
        type: "personal",
        title:
          title.trim() ||
          `Thinking — ${new Date().toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}`,
        capture_source: "mic_live",
        status: "active",
        owner_user_id: user?.id,
        owner_email: user?.email,
        started_at: new Date().toISOString(),
      });
      base44.entities.UsageEvent.create({
        user_id: user?.id,
        event_type: "session_started",
        meta: { session_id: session.id, capture_source: "mic_live" },
      }).catch(() => {});
      navigate(`/app/board/${session.id}`);
    } catch (err) {
      setError(err.message || "Couldn't start the session. Try again.");
      setBusy(false);
    }
  };

  const inviteBot = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await checkQuota("meeting");
      const res = await base44.functions.invoke("recall-start-bot", {
        meeting_url: meetingUrl.trim(),
        title,
      });
      navigate(`/app/board/${res.data.session_id}`);
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || "Couldn't send the bot. Try again."
      );
      setBusy(false);
    }
  };

  const importTranscript = async (e) => {
    e.preventDefault();
    setError("");
    if (parsed.length === 0) {
      setError("Paste or upload a transcript first — we need words to map.");
      return;
    }
    setBusy(true);
    try {
      await checkQuota("meeting");
      const session = await base44.entities.Session.create({
        type: "meeting",
        title:
          title.trim() ||
          `Meeting — ${new Date().toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}`,
        capture_source: "import",
        status: "processing",
        owner_user_id: user?.id,
        owner_email: user?.email,
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

  const titleField = (placeholder) => (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">Title</span>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-line bg-paper-raised px-3.5 text-sm placeholder:text-ink-faint focus:border-periwinkle"
      />
    </label>
  );

  const errorNote = error && (
    <p className="rounded-lg bg-note-coral px-3 py-2 text-sm text-ink" role="alert">
      {error}
    </p>
  );

  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
        New session
      </h1>
      <div className="mt-6 flex flex-wrap gap-2">
        <ModeTab to="/app/new?mode=talk" icon={Mic} label="Start talking" active={mode === "talk"} />
        <ModeTab to="/app/new?mode=bot" icon={Bot} label="Invite the bot" active={mode === "bot"} />
        <ModeTab to="/app/new?mode=import" icon={FileText} label="Import a transcript" active={mode === "import"} />
      </div>

      {mode === "talk" && (
        <div className="mt-8 space-y-5">
          <p className="text-ink-soft">
            A personal thinking session: hold a key, talk, and watch your
            thoughts land as nodes. One speaker, live.
          </p>
          {titleField("Thinking out loud — pricing strategy")}
          {errorNote}
          <button
            onClick={startTalking}
            disabled={busy}
            className="flex h-12 items-center gap-2 rounded-xl bg-periwinkle px-6 text-sm font-semibold text-white transition-colors hover:bg-periwinkle-deep disabled:opacity-60"
          >
            {busy ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            Open the board & start talking
          </button>
          <p className="text-xs text-ink-faint">
            Your browser will ask for microphone access on the first hold.
          </p>
        </div>
      )}

      {mode === "bot" && (
        <form onSubmit={inviteBot} className="mt-8 space-y-5">
          <p className="text-ink-soft">
            Paste a Zoom, Google Meet, or Teams link. A Tackly bot joins the
            call and the board maps the conversation live.
          </p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Meeting link
            </span>
            <input
              type="url"
              required
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              className="h-11 w-full rounded-xl border border-line bg-paper-raised px-3.5 text-sm placeholder:text-ink-faint focus:border-periwinkle"
            />
          </label>
          {titleField("Product sync — onboarding rework")}
          {errorNote}
          <button
            type="submit"
            disabled={busy || !meetingUrl.trim()}
            className="flex h-12 items-center gap-2 rounded-xl bg-periwinkle px-6 text-sm font-semibold text-white transition-colors hover:bg-periwinkle-deep disabled:opacity-50"
          >
            {busy ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
            Send the bot & open the board
          </button>
          <p className="text-xs text-ink-faint">
            The bot appears as “Tackly” in the call. It may wait in the lobby
            until someone lets it in.
          </p>
        </form>
      )}

      {mode === "import" && (
        <form onSubmit={importTranscript} className="mt-8 space-y-5">
          <p className="text-ink-soft">
            Already have a transcript from elsewhere? Paste or upload it.
          </p>
          {titleField("Product sync — onboarding rework")}
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
              rows={10}
              placeholder={`Priya: Let's get started — today is about the onboarding rework.\nDan: Activation dropped to 34% last month.\nPriya: What if onboarding was a single question?`}
              className="w-full resize-y rounded-xl border border-line bg-paper-raised p-3.5 font-mono text-[13px] leading-relaxed placeholder:text-ink-faint focus:border-periwinkle"
            />
            <p className="mt-1.5 text-xs text-ink-faint">
              {parsed.length > 0
                ? `${parsed.length} utterances detected${
                    parsed.some((u) => u.speaker_label)
                      ? ` · speakers: ${[
                          ...new Set(
                            parsed.map((u) => u.speaker_label).filter(Boolean)
                          ),
                        ]
                          .slice(0, 4)
                          .join(", ")}`
                      : ""
                  }`
                : "Lines like “Name: what they said” keep speakers attached."}
            </p>
          </div>
          {errorNote}
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
      )}
    </div>
  );
}
