import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Settings } from "lucide-react";

const AppConfig = base44.entities.AppConfig;

export default function ConfigPage() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    AppConfig.list()
      .then((rows) => !cancelled && setConfig(rows[0] || null))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleWaitlist = async () => {
    if (!config) return;
    setSaving(true);
    setError("");
    const next = !config.waitlist_mode;
    try {
      await AppConfig.update(config.id, { waitlist_mode: next });
      setConfig((prev) => ({ ...prev, waitlist_mode: next }));
    } catch (err) {
      setError(err.message || "Couldn't update config.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-periwinkle-tint">
          <Settings className="h-5 w-5 text-periwinkle-deep" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Config</h1>
          <p className="text-ink-soft">App-wide settings.</p>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-note-coral px-3 py-2 text-sm text-ink" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-line bg-paper-raised p-5 shadow-note">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-ink">Waitlist mode</p>
            <p className="mt-1 text-sm text-ink-soft">
              Shows a note in onboarding that Tackly is still being built and free for now.
            </p>
          </div>
          <button
            onClick={toggleWaitlist}
            disabled={!config || saving}
            role="switch"
            aria-checked={!!config?.waitlist_mode}
            className={`relative h-7 w-12 shrink-0 rounded-full border-2 border-ink transition-colors disabled:opacity-50 ${
              config?.waitlist_mode ? "bg-periwinkle" : "bg-paper-sunken"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-paper-raised border border-ink transition-transform ${
                config?.waitlist_mode ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
