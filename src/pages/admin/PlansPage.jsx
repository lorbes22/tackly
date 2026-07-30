import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Check, CreditCard, Pencil, Plus, X } from "lucide-react";

const Plan = base44.entities.Plan;

// Plan RLS already allows admin-role updates directly (see plan.jsonc), so
// this writes straight through the entity client — no backend function
// needed. Two things are editable: the Stripe Price id (paired by hand
// after creating the matching recurring Price in the Stripe dashboard,
// explicit Save since it's easy to mistype), and the marketing "perks"
// list shown on the plan cards (add/remove/edit each save immediately —
// short strings, nothing worth a page-level draft state for).
function FeatureEditor({ plan, onChange }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Which perk (by index) is mid-edit, and its in-progress text — separate
  // from `draft` (the "add a new perk" field) since both can't be active
  // for the same row at once anyway, but keeping them distinct avoids the
  // add-field accidentally inheriting an edit-in-progress value.
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState("");

  const persist = async (features) => {
    setBusy(true);
    setError("");
    try {
      await Plan.update(plan.id, { features });
      onChange(features);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Couldn't save that change.");
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    persist([...(plan.features || []), text]);
  };

  const remove = (index) => {
    if (busy) return;
    persist((plan.features || []).filter((_, i) => i !== index));
  };

  const startEdit = (index) => {
    if (busy) return;
    setEditingIndex(index);
    setEditValue(plan.features[index]);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditValue("");
  };

  const saveEdit = () => {
    const text = editValue.trim();
    if (!text || busy) return;
    const next = [...plan.features];
    next[editingIndex] = text;
    setEditingIndex(null);
    setEditValue("");
    persist(next);
  };

  return (
    <div className="mt-4">
      <span className="mb-1.5 block text-xs font-medium text-ink-soft">Perks shown on this plan's card</span>
      <ul className="space-y-1.5">
        {(plan.features || []).map((f, i) =>
          editingIndex === i ? (
            <li key={`${f}-${i}`} className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveEdit();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEdit();
                  }
                }}
                className="h-8 flex-1 rounded-lg border border-periwinkle bg-paper-raised px-3 text-sm focus:outline-none"
              />
              <button
                onClick={saveEdit}
                disabled={busy || !editValue.trim()}
                title="Save"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-note-mint hover:text-ink disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={cancelEdit}
                disabled={busy}
                title="Cancel"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-paper-sunken hover:text-ink disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ) : (
            <li
              key={`${f}-${i}`}
              className="group flex items-center justify-between gap-2 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink"
            >
              <button
                onClick={() => startEdit(i)}
                disabled={busy}
                title="Click to edit"
                className="flex-1 truncate text-left disabled:opacity-50"
              >
                {f}
              </button>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  onClick={() => startEdit(i)}
                  disabled={busy}
                  title="Edit perk"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-paper-sunken hover:text-ink disabled:opacity-50"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => remove(i)}
                  disabled={busy}
                  title="Remove perk"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-note-coral hover:text-ink disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </li>
          )
        )}
        {(plan.features || []).length === 0 && (
          <li className="text-sm text-ink-faint">No perks listed yet.</li>
        )}
      </ul>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a perk…"
          className="h-9 flex-1 rounded-lg border border-line bg-paper-raised px-3 text-sm placeholder:text-ink-faint focus:border-periwinkle"
        />
        <button
          onClick={add}
          disabled={busy || !draft.trim()}
          title="Add perk"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-periwinkle text-white transition-colors hover:bg-periwinkle-deep disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-note-coral-edge">{error}</p>}
    </div>
  );
}

export default function PlansPage() {
  const [plans, setPlans] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [descDrafts, setDescDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Plan.list("price_monthly")
      .then((data) => {
        setPlans(data);
        setDrafts(Object.fromEntries(data.map((p) => [p.id, p.stripe_price_id || ""])));
        setDescDrafts(Object.fromEntries(data.map((p) => [p.id, p.description || ""])));
      })
      .catch((err) => setError(err.message || "Couldn't load plans."));
  }, []);

  const save = async (planId) => {
    setSavingId(planId);
    setError("");
    try {
      await Plan.update(planId, { stripe_price_id: drafts[planId].trim() });
      setPlans((prev) =>
        prev.map((p) => (p.id === planId ? { ...p, stripe_price_id: drafts[planId].trim() } : p))
      );
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Couldn't save that plan.");
    } finally {
      setSavingId(null);
    }
  };

  const saveDescription = async (planId) => {
    setSavingId(`${planId}-desc`);
    setError("");
    try {
      const description = descDrafts[planId].trim();
      await Plan.update(planId, { description });
      setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, description } : p)));
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Couldn't save that plan.");
    } finally {
      setSavingId(null);
    }
  };

  const setFeatures = (planId, features) => {
    setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, features } : p)));
  };

  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-periwinkle-tint">
          <CreditCard className="h-5 w-5 text-periwinkle-deep" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            Plans &amp; billing
          </h1>
          <p className="text-sm text-ink-soft">
            Pair each plan with its Stripe Price id, and edit the perks shown on its card.
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-note-coral-edge/40 bg-note-coral/30 px-3.5 py-2 text-sm text-ink">
          {error}
        </p>
      )}

      <div className="mt-6 space-y-3">
        {plans === null && <p className="text-sm text-ink-soft">Loading…</p>}
        {plans?.map((plan) => (
          <div
            key={plan.id}
            className="rounded-2xl border border-line bg-paper-raised p-5 shadow-note"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-base font-bold text-ink">{plan.name}</p>
                <p className="text-xs text-ink-soft">
                  {plan.price_monthly > 0 ? `£${plan.price_monthly}/mo` : "Free"} ·{" "}
                  {plan.minute_limit > 0 ? `${plan.minute_limit} min/month` : "Unlimited minutes"}
                </p>
              </div>
            </div>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">
                One-line description (shown under the price on the card)
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={descDrafts[plan.id] ?? ""}
                  onChange={(e) => setDescDrafts((prev) => ({ ...prev, [plan.id]: e.target.value }))}
                  placeholder="The full product — capped at 30 minutes a month."
                  className="h-10 flex-1 rounded-lg border border-line bg-paper-raised px-3 text-sm placeholder:text-ink-faint focus:border-periwinkle"
                />
                <button
                  onClick={() => saveDescription(plan.id)}
                  disabled={
                    savingId === `${plan.id}-desc` || descDrafts[plan.id] === (plan.description || "")
                  }
                  className="h-10 shrink-0 rounded-lg bg-periwinkle px-4 text-sm font-semibold text-white transition-colors hover:bg-periwinkle-deep disabled:opacity-50"
                >
                  {savingId === `${plan.id}-desc` ? "Saving…" : "Save"}
                </button>
              </div>
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">
                Stripe Price id
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={drafts[plan.id] ?? ""}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [plan.id]: e.target.value }))}
                  placeholder="price_..."
                  className="h-10 flex-1 rounded-lg border border-line bg-paper-raised px-3 text-sm font-mono placeholder:text-ink-faint focus:border-periwinkle"
                />
                <button
                  onClick={() => save(plan.id)}
                  disabled={savingId === plan.id || drafts[plan.id] === (plan.stripe_price_id || "")}
                  className="h-10 shrink-0 rounded-lg bg-periwinkle px-4 text-sm font-semibold text-white transition-colors hover:bg-periwinkle-deep disabled:opacity-50"
                >
                  {savingId === plan.id ? "Saving…" : "Save"}
                </button>
              </div>
            </label>

            <FeatureEditor plan={plan} onChange={(features) => setFeatures(plan.id, features)} />
          </div>
        ))}
      </div>
    </div>
  );
}
