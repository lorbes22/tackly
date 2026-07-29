import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Award, Pencil, Plus, Trash2 } from "lucide-react";

const Badge = base44.entities.Badge;

const EMPTY_DRAFT = { name: "", embed_html: "" };

function BadgeRow({ badge, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  const startEditing = () => {
    setDraft({ name: badge.name, embed_html: badge.embed_html });
    setEditing(true);
  };

  const save = async () => {
    if (!draft.name.trim() || !draft.embed_html.trim()) return;
    setBusy(true);
    try {
      await Badge.update(badge.id, {
        name: draft.name.trim(),
        embed_html: draft.embed_html.trim(),
      });
      setEditing(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    setBusy(true);
    try {
      await Badge.update(badge.id, { enabled: !badge.enabled });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${badge.name}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await Badge.delete(badge.id);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink">{badge.name}</p>
          <p className="text-xs text-ink-faint">{badge.enabled ? "Live on landing page" : "Hidden"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            disabled={busy}
            role="switch"
            aria-checked={!!badge.enabled}
            className={`relative h-6 w-11 shrink-0 rounded-full border-2 border-ink transition-colors disabled:opacity-50 ${
              badge.enabled ? "bg-periwinkle" : "bg-paper-sunken"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full border border-ink bg-paper-raised transition-transform ${
                badge.enabled ? "translate-x-4.5" : "translate-x-0.5"
              }`}
            />
          </button>
          {!editing && (
            <button
              onClick={startEditing}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border-2 border-ink bg-paper-raised px-3 text-xs font-semibold text-ink shadow-brutal-sm transition-transform hover:-translate-y-0.5"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          )}
          <button
            onClick={remove}
            disabled={busy}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-note-coral hover:text-ink disabled:opacity-50"
            title="Delete badge"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Admin label, e.g. Product Hunt — Featured"
            disabled={busy}
            className="h-9 w-full rounded-lg border border-line bg-paper-raised px-3 text-sm placeholder:text-ink-faint focus:border-periwinkle disabled:opacity-50"
          />
          <textarea
            value={draft.embed_html}
            onChange={(e) => setDraft((d) => ({ ...d, embed_html: e.target.value }))}
            placeholder="Paste the badge's embed code (the <a><img></a> snippet)"
            rows={4}
            disabled={busy}
            className="w-full rounded-lg border border-line bg-paper-raised px-3 py-2 font-mono text-xs placeholder:text-ink-faint focus:border-periwinkle disabled:opacity-50"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={busy || !draft.name.trim() || !draft.embed_html.trim()}
              className="h-9 shrink-0 rounded-lg bg-periwinkle px-4 text-sm font-semibold text-white transition-colors hover:bg-periwinkle-deep disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={busy}
              className="h-9 shrink-0 rounded-lg px-3 text-sm font-medium text-ink-soft hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function BadgesCard() {
  const [badges, setBadges] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  const load = () => {
    Badge.list("sort_order")
      .then((rows) => setBadges(rows))
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const addBadge = async () => {
    if (!draft.name.trim() || !draft.embed_html.trim()) return;
    setBusy(true);
    setError("");
    try {
      await Badge.create({
        name: draft.name.trim(),
        embed_html: draft.embed_html.trim(),
        enabled: true,
        sort_order: badges?.length || 0,
      });
      setDraft(EMPTY_DRAFT);
      setAdding(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-line bg-paper-raised p-5 shadow-note">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-ink">
          <Award className="h-4 w-4" />
          <p className="text-sm font-bold">Badges</p>
        </div>
        {!adding && (
          <button
            onClick={() => {
              setDraft(EMPTY_DRAFT);
              setAdding(true);
            }}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border-2 border-ink bg-paper-raised px-3 text-xs font-semibold text-ink shadow-brutal-sm transition-transform hover:-translate-y-0.5"
          >
            <Plus className="h-3 w-3" />
            Add badge
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Award badges (Product Hunt, and whatever comes next) shown above the landing page hero.
        Paste the raw embed code from the provider — no code deploy needed to add, edit, or hide one.
      </p>

      {error && (
        <p className="mt-3 rounded-lg bg-note-coral px-3 py-2 text-sm text-ink" role="alert">
          {error}
        </p>
      )}

      {adding && (
        <div className="mt-3 space-y-2 rounded-xl border border-line bg-paper p-4">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Admin label, e.g. Product Hunt — Featured"
            disabled={busy}
            className="h-9 w-full rounded-lg border border-line bg-paper-raised px-3 text-sm placeholder:text-ink-faint focus:border-periwinkle disabled:opacity-50"
          />
          <textarea
            value={draft.embed_html}
            onChange={(e) => setDraft((d) => ({ ...d, embed_html: e.target.value }))}
            placeholder="Paste the badge's embed code (the <a><img></a> snippet)"
            rows={4}
            disabled={busy}
            className="w-full rounded-lg border border-line bg-paper-raised px-3 py-2 font-mono text-xs placeholder:text-ink-faint focus:border-periwinkle disabled:opacity-50"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={addBadge}
              disabled={busy || !draft.name.trim() || !draft.embed_html.trim()}
              className="h-9 shrink-0 rounded-lg bg-periwinkle px-4 text-sm font-semibold text-white transition-colors hover:bg-periwinkle-deep disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add"}
            </button>
            <button
              onClick={() => setAdding(false)}
              disabled={busy}
              className="h-9 shrink-0 rounded-lg px-3 text-sm font-medium text-ink-soft hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {badges === null && !error ? (
        <p className="mt-3 text-sm text-ink-soft">Loading…</p>
      ) : badges && badges.length === 0 && !adding ? (
        <p className="mt-3 text-sm text-ink-faint">No badges yet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {badges?.map((badge) => (
            <BadgeRow key={badge.id} badge={badge} onSaved={load} />
          ))}
        </div>
      )}
    </div>
  );
}
