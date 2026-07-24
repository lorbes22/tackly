import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Check } from "lucide-react";

// Shared plan-cards grid — used on the public /plans page and the landing
// page's pricing teaser. Free is always the primary, fully-opaque plan (no
// Stripe price needed, everyone's on it by default); paid plans dim to a
// "coming soon" state while AppConfig.waitlist_mode is on, since checkout
// isn't meant to be usable yet in that mode.
export function PlanCards({ className = "" }) {
  const { user } = useAuth();
  const [plans, setPlans] = useState(null);
  const [waitlistMode, setWaitlistMode] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    base44.entities.Plan.list("price_monthly").then(setPlans).catch(() => setPlans([]));
    base44.entities.AppConfig.list()
      .then((rows) => setWaitlistMode(!!rows[0]?.waitlist_mode))
      .catch(() => {});
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
          const dimmed = !isFree && waitlistMode;
          const popular = !isFree && i === 1;

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border-2 border-ink p-6 shadow-brutal-sm transition-opacity ${
                isFree ? "bg-periwinkle-tint" : "bg-paper-raised"
              } ${dimmed ? "opacity-50" : ""}`}
            >
              {popular && !dimmed && (
                <span className="absolute -top-3 left-6 rounded-full border-2 border-ink bg-note-gold px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink shadow-brutal-sm">
                  Popular
                </span>
              )}
              {dimmed && (
                <span className="absolute -top-3 left-6 rounded-full border-2 border-ink bg-paper-sunken px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-soft shadow-brutal-sm">
                  Coming soon
                </span>
              )}
              <p className="font-display text-lg font-bold text-ink">{plan.name}</p>
              <p className="mt-1 font-display text-3xl font-bold text-ink">
                {isFree ? "£0" : `£${plan.price_monthly}`}
                <span className="text-sm font-medium text-ink-soft">/mo</span>
              </p>
              {plan.features?.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-ink-soft">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-periwinkle-deep" />
                      {f}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-5">
                {isCurrent || isDefaultFree ? (
                  <p className="flex h-10 items-center justify-center gap-1.5 rounded-xl border-2 border-ink bg-paper-raised font-display text-sm font-bold text-ink shadow-brutal-sm">
                    <Check className="h-4 w-4" /> Current plan
                  </p>
                ) : isFree ? (
                  user ? null : (
                    <Link
                      to="/signup"
                      className="flex h-10 items-center justify-center rounded-xl border-2 border-ink bg-periwinkle font-display text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5"
                    >
                      Get started free
                    </Link>
                  )
                ) : dimmed ? (
                  <p className="flex h-10 items-center justify-center rounded-xl border-2 border-ink/30 text-sm font-medium text-ink-faint">
                    Not open yet
                  </p>
                ) : !user ? (
                  <Link
                    to="/signup"
                    className="flex h-10 items-center justify-center rounded-xl border-2 border-ink bg-periwinkle font-display text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5"
                  >
                    Get started
                  </Link>
                ) : plan.stripe_price_id ? (
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
