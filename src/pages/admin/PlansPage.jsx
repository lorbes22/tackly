import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { CreditCard } from "lucide-react";

const Plan = base44.entities.Plan;

// Plan RLS already allows admin-role updates directly (see plan.jsonc), so
// this writes straight through the entity client — no backend function
// needed just to set a field. Only stripe_price_id is editable here: it's
// the one thing that actually needs pairing up by hand after creating the
// matching recurring Price in the Stripe dashboard.
export default function PlansPage() {
  const [plans, setPlans] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Plan.list("price_monthly")
      .then((data) => {
        setPlans(data);
        setDrafts(Object.fromEntries(data.map((p) => [p.id, p.stripe_price_id || ""])));
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
            Pair each plan with its Stripe Price id to enable checkout.
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
          </div>
        ))}
      </div>
    </div>
  );
}
