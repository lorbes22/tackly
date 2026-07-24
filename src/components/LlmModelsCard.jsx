import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { BrainCircuit, CheckCircle2, Pencil, XCircle } from "lucide-react";

const LlmConfig = base44.entities.LlmConfig;

// Fallback defaults when no LlmConfig row exists for a tier — must match
// TIER1_MODEL / TIER2_MODEL in the backend functions (process-session /
// consolidate-session; classify-partial shares T1's config).
const TIER_DEFAULTS = {
  t1: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  t2: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  chat: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
};

const TIER_LABELS = {
  t1: {
    name: "T1 — Live classification",
    hint: "process-session + classify-partial's rough-guess pass — every utterance, live.",
  },
  t2: { name: "T2 — Consolidation", hint: "consolidate-session — end-of-session merge & cross-link pass." },
  chat: { name: "TacklyAI chat", hint: "ask-tackly-ai — per-board Q&A, on demand." },
};

const EMPTY_DRAFT = { provider: "anthropic", model: "", secret_env_var: "" };

// Small "this is live" indicator — a settled dot with a fading ring pulsing
// outward, the standard "currently active" affordance.
function PulseDot() {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
  );
}

function TierRow({ tier, active, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, error } | null

  const effective = active || { ...TIER_DEFAULTS[tier], secret_env_var: null, verified_at: null };
  const isDefault = !active;

  const startEditing = () => {
    setDraft({ provider: effective.provider, model: "", secret_env_var: "" });
    setResult(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setResult(null);
  };

  const saveAndTest = async () => {
    if (!draft.model.trim() || !draft.secret_env_var.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke("admin-set-llm-config", {
        tier,
        provider: draft.provider,
        model: draft.model.trim(),
        secret_env_var: draft.secret_env_var.trim(),
      });
      if (res.data?.ok) {
        setResult({ ok: true });
        setEditing(false);
        onSaved();
      } else {
        setResult({ ok: false, error: res.data?.error || "Test failed." });
      }
    } catch (err) {
      setResult({ ok: false, error: err.response?.data?.error || err.message });
    } finally {
      setBusy(false);
    }
  };

  const revert = async () => {
    setBusy(true);
    setResult(null);
    try {
      await base44.functions.invoke("admin-set-llm-config", { tier, revert: true });
      setEditing(false);
      onSaved();
    } catch (err) {
      setResult({ ok: false, error: err.response?.data?.error || err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink">{TIER_LABELS[tier].name}</p>
          <p className="text-xs text-ink-faint">{TIER_LABELS[tier].hint}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <PulseDot />
            <div className="text-right">
              <p className="font-mono text-sm text-ink">
                {effective.provider} / {effective.model}
              </p>
              <p className="text-xs text-ink-faint">
                {isDefault
                  ? "default"
                  : `live since ${new Date(effective.verified_at).toLocaleString()}`}
              </p>
            </div>
          </div>
          {!editing && (
            <button
              onClick={startEditing}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border-2 border-ink bg-paper-raised px-3 text-xs font-semibold text-ink shadow-brutal-sm transition-transform hover:-translate-y-0.5"
            >
              <Pencil className="h-3 w-3" />
              Change model
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_1fr]">
            <select
              value={draft.provider}
              onChange={(e) => setDraft((d) => ({ ...d, provider: e.target.value }))}
              disabled={busy}
              className="h-9 rounded-lg border border-line bg-paper-raised px-2.5 text-sm text-ink disabled:opacity-50"
            >
              <option value="anthropic">Anthropic</option>
              <option value="google">Google</option>
            </select>
            <input
              type="text"
              value={draft.model}
              onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
              placeholder="model id, e.g. gemini-3.5-flash-lite"
              disabled={busy}
              className="h-9 rounded-lg border border-line bg-paper-raised px-3 text-sm font-mono placeholder:text-ink-faint focus:border-periwinkle disabled:opacity-50"
            />
            <input
              type="text"
              value={draft.secret_env_var}
              onChange={(e) => setDraft((d) => ({ ...d, secret_env_var: e.target.value }))}
              placeholder="secret env var name"
              disabled={busy}
              className="h-9 rounded-lg border border-line bg-paper-raised px-3 text-sm font-mono placeholder:text-ink-faint focus:border-periwinkle disabled:opacity-50"
            />
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={saveAndTest}
              disabled={busy || !draft.model.trim() || !draft.secret_env_var.trim()}
              className="h-9 shrink-0 rounded-lg bg-periwinkle px-4 text-sm font-semibold text-white transition-colors hover:bg-periwinkle-deep disabled:opacity-50"
            >
              {busy ? "Testing…" : "Save & Test"}
            </button>
            <button
              onClick={cancelEditing}
              disabled={busy}
              className="h-9 shrink-0 rounded-lg px-3 text-sm font-medium text-ink-soft hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
            {!isDefault && (
              <button
                onClick={revert}
                disabled={busy}
                className="ml-auto h-9 shrink-0 text-xs font-medium text-periwinkle hover:text-periwinkle-deep disabled:opacity-50"
              >
                Revert to default
              </button>
            )}
          </div>
        </div>
      )}

      {result && (
        <p
          className={`mt-2 flex items-start gap-1.5 text-xs ${
            result.ok ? "text-emerald-700" : "text-note-coral-edge"
          }`}
        >
          {result.ok ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          {result.ok ? "Connected — this tier is live on the new model now." : result.error}
        </p>
      )}
    </div>
  );
}

export function LlmModelsCard() {
  const [configs, setConfigs] = useState(null);
  const [error, setError] = useState("");

  const load = () => {
    LlmConfig.list()
      .then((rows) => setConfigs(rows))
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const byTier = (tier) => configs?.find((c) => c.tier === tier) || null;

  return (
    <div className="mt-4 rounded-2xl border border-line bg-paper-raised p-5 shadow-note">
      <div className="flex items-center gap-2 text-ink">
        <BrainCircuit className="h-4 w-4" />
        <p className="text-sm font-bold">LLM models</p>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Which model each classification tier calls. Changing this takes effect immediately on the very
        next call — no deploy needed.
      </p>
      <p className="mt-2 rounded-lg border border-line bg-paper-sunken px-3 py-2 text-xs text-ink-soft">
        1. Set the API key as a secret from your terminal first — it's never entered here:{" "}
        <code className="font-mono text-ink">npx base44 secrets set YOUR_KEY_NAME=sk-...</code>
        <br />
        2. Click "Change model" below, then enter that exact secret name (not the value), the provider,
        and the model id string exactly as that provider's API expects it — Anthropic model ids from{" "}
        <span className="font-mono">docs.claude.com</span>, Google's from{" "}
        <span className="font-mono">ai.google.dev/gemini-api/docs/models</span>.
        <br />
        3. "Save & Test" fires one real call. It only activates — and only changes what's live — if that
        call succeeds; a failed test changes nothing.
      </p>

      {error && (
        <p className="mt-3 rounded-lg bg-note-coral px-3 py-2 text-sm text-ink" role="alert">
          {error}
        </p>
      )}

      {configs === null && !error ? (
        <p className="mt-3 text-sm text-ink-soft">Loading…</p>
      ) : (
        <div className="mt-3 space-y-3">
          <TierRow tier="t1" active={byTier("t1")} onSaved={load} />
          <TierRow tier="t2" active={byTier("t2")} onSaved={load} />
          <TierRow tier="chat" active={byTier("chat")} onSaved={load} />
        </div>
      )}
    </div>
  );
}
