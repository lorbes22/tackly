import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Mail } from "lucide-react";

export default function EmailsPage() {
  const [templates, setTemplates] = useState(null);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    base44.functions
      .invoke("admin-preview-email", {})
      .then((res) => {
        if (cancelled) return;
        setTemplates(res.data.templates);
        if (res.data.templates.length > 0) setSelected(res.data.templates[0].key);
      })
      .catch((err) => !cancelled && setError(err.response?.data?.error || err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setPreview(null);
    base44.functions
      .invoke("admin-preview-email", { template: selected })
      .then((res) => !cancelled && setPreview(res.data))
      .catch((err) => !cancelled && setError(err.response?.data?.error || err.message));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-periwinkle-tint">
          <Mail className="h-5 w-5 text-periwinkle-deep" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Emails</h1>
          <p className="text-ink-soft">Preview the transactional emails Tackly sends via Resend.</p>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-note-coral px-3 py-2 text-sm text-ink" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
        <div className="space-y-1">
          {templates === null ? (
            <p className="text-sm text-ink-soft">Loading…</p>
          ) : (
            templates.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setSelected(t.key)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selected === t.key
                    ? "bg-periwinkle-tint font-semibold text-periwinkle-deep"
                    : "text-ink-soft hover:bg-paper-sunken hover:text-ink"
                }`}
              >
                {t.name}
                <div className="text-xs font-normal text-ink-faint">{t.description}</div>
              </button>
            ))
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-paper-raised shadow-note">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-medium text-ink-soft">
              Subject: <span className="text-ink">{preview?.subject || "…"}</span>
            </span>
          </div>
          {preview ? (
            <iframe
              title="Email preview"
              srcDoc={preview.html}
              className="h-[600px] w-full"
              sandbox=""
            />
          ) : (
            <div className="flex h-[600px] items-center justify-center text-sm text-ink-soft">
              Loading preview…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
