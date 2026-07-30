import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Check } from "lucide-react";

// Shared plan-cards grid — used on the public /plans page, the landing
// page's pricing teaser, and the "view plans" popup from Settings. Free is
// always the primary, fully-opaque plan (no Stripe price needed, everyone's
// on it by default). Plans are shown as real/visible regardless of
// AppConfig.waitlist_mode — that flag only affects onboarding copy — a
// plan only reads as unavailable when it genuinely has no stripe_price_id
// configured yet.
export function PlanCards({ className = "" }) {
  const { user } = useAuth();
  const [plans, setPlans] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    base44.entities.Plan.list("price_monthly").then(setPlans).catch(() => setPlans([]));
  }, []);

  const upgrade = async (planId) => {
    setError("");
    setBusyId(planId);
    try {
      const res = await base44.functions.invoke("create-checkout-session", { plan_id: planId });
      if (res.data?.url) window.location.href = res.data.url;
      else setError(res.data?.error || "Couldn't start checkout.");
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't start checkout.");
    } finally {
      setBusyId(null);
    }
  };

  if (!plans) return null;

  return (
    <div className={className}>
      {error && (
        <p className="mb-4 rounded-xl border border-note-coral-edge/40 bg-note-coral/30 px-3.5 py-2 text-center text-sm text-ink">
          {error}
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-3">
        {plans.map((plan, i) => {
          const isFree = !plan.price_monthly;
          const isCurrent = !!user && (user.plan_id || "") === plan.id;
          const isDefaultFree = !!user && isFree && !user.plan_id;
          // Plus (the middle paid tier) is flagged as the most-used plan —
          // a fixed marketing tag, not tied to waitlist mode or any state.
          const mostUsed = !isFree && i === 1;

          return (
            <div
              key={plan.id}
              className={`relative flex h-full flex-col rounded-2xl border-2 border-ink p-6 shadow-brutal-sm ${
                isFree ? "bg-periwinkle-tint" : "bg-paper-raised"
              }`}
            >
              {mostUsed && (
                <span className="absolute -top-3 left-6 rounded-full border-2 border-ink bg-note-gold px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink shadow-brutal-sm">
                  Most used
                </span>
              )}
              <div>
                <p className="font-display text-lg font-bold text-ink">{plan.name}</p>
                <p className="mt-1 font-display text-3xl font-bold text-ink">
                  {isFree ? "£0" : `£${plan.price_monthly}`}
                  <span className="text-sm font-medium text-ink-soft">/mo</span>
                </p>
                {plan.description && (
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{plan.description}</p>
                )}
                {plan.features?.length > 0 && (
                  <ul className="mt-5 space-y-3 border-t border-ink/10 pt-5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm leading-snug text-ink-soft">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-periwinkle-deep" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* mt-auto pins every card's CTA to the same bottom edge
                  regardless of how many features the plan above it lists —
                  cards are already equal-height via the grid, this just
                  stops the button floating wherever its own content ends. */}
              <div className="mt-auto pt-5">
                {isCurrent || isDefaultFree ? (
                  <p className="flex h-10 items-center justify-center gap-1.5 rounded-xl border-2 border-ink bg-paper-raised font-display text-sm font-bold text-ink shadow-brutal-sm">
                    <Check className="h-4 w-4" /> Current plan
                  </p>
                ) : !user ? (
                  <Link
                    to="/signup"
                    className="flex h-10 items-center justify-center rounded-xl border-2 border-ink bg-periwinkle font-display text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5"
                  >
                    {isFree ? "Get started free" : "Get started"}
                  </Link>
                ) : isFree ? null : plan.stripe_price_id ? (
                  <button
                    onClick={() => upgrade(plan.id)}
                    disabled={busyId === plan.id}
                    className="flex h-10 w-full items-center justify-center rounded-xl border-2 border-ink bg-periwinkle font-display text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                  >
                    {busyId === plan.id ? "Redirecting…" : "Upgrade"}
                  </button>
                ) : (
                  <p className="flex h-10 items-center justify-center rounded-xl border-2 border-ink/30 text-sm font-medium text-ink-faint">
                    Not available yet
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
