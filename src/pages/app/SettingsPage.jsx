import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { UsageBadge } from "@/components/UsageBadge";
import { PlansModal } from "@/components/PlansModal";
import { Calendar, PartyPopper } from "lucide-react";

// Just this account's plan: usage, manage-billing, and a "view plans"
// button that pops the full comparison grid up as a modal (PlansModal) —
// logged-in users stay on Settings rather than being navigated to the
// public /plans page.
function PlansSection() {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPlans, setShowPlans] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const checkoutStatus = searchParams.get("checkout");

  useEffect(() => {
    if (!checkoutStatus) return;
    if (checkoutStatus === "success") refresh();
  }, [checkoutStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissCheckoutStatus = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("checkout");
    setSearchParams(next, { replace: true });
  };

  const manageBilling = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await base44.functions.invoke("create-billing-portal-session", {});
      if (res.data?.url) window.location.href = res.data.url;
      else setError(res.data?.error || "Couldn't open billing portal.");
    } catch {
      setError("Couldn't open billing portal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mt-5">
        {error && (
          <p className="mb-3 rounded-xl border border-note-coral-edge/40 bg-note-coral/30 px-3.5 py-2 text-sm text-ink">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {user?.stripe_customer_id && (
            <button
              onClick={manageBilling}
              disabled={busy}
              className="h-9 rounded-lg border border-line px-3.5 text-sm font-medium text-ink transition-colors hover:bg-paper-sunken disabled:opacity-60"
            >
              {busy ? "Opening…" : "Manage billing"}
            </button>
          )}
          <button
            onClick={() => setShowPlans(true)}
            className="flex h-9 items-center justify-center rounded-lg px-3.5 text-sm font-medium text-periwinkle-deep transition-colors hover:bg-periwinkle-tint"
          >
            View all plans →
          </button>
        </div>
      </div>

      {showPlans && <PlansModal onClose={() => setShowPlans(false)} />}

      {(checkoutStatus === "success" || checkoutStatus === "cancel") && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
          onClick={dismissCheckoutStatus}
        >
          <div
            className="w-full max-w-sm rounded-2xl border-2 border-ink bg-paper-raised p-6 text-center shadow-brutal animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
                checkoutStatus === "success" ? "bg-note-mint" : "bg-paper-sunken"
              }`}
            >
              <PartyPopper
                className={`h-6 w-6 ${
                  checkoutStatus === "success" ? "text-ink" : "text-ink-faint"
                }`}
              />
            </div>
            <p className="mt-4 font-display text-lg font-bold text-ink">
              {checkoutStatus === "success" ? "You're upgraded!" : "No hard feelings"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {checkoutStatus === "success"
                ? "Your plan just leveled up — go ramble accordingly."
                : "Checkout canceled, nothing changed. Your plan's exactly where you left it."}
            </p>
            <button
              onClick={dismissCheckoutStatus}
              className="mt-5 h-10 w-full rounded-xl border-2 border-ink bg-periwinkle font-display text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5"
            >
              {checkoutStatus === "success" ? "Let's go" : "Got it"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Calendar auto-join (Recall Calendar V1) is built server-side
// (recall-calendar-connect-url/recall-calendar-set-preferences,
// CalendarConnection entity) but paused for now — connecting doesn't do
// anything useful yet, so "Connect" just explains that rather than
// starting a real OAuth flow that would look connected but not work.
function CalendarSection() {
  const [showComingSoon, setShowComingSoon] = useState(false);

  return (
    <>
      <section className="mt-6 rounded-2xl border border-line bg-paper-raised p-6 shadow-note">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-periwinkle-tint">
            <Calendar className="h-4 w-4 text-periwinkle-deep" />
          </div>
          <h2 className="font-display text-lg font-bold text-ink">Calendar</h2>
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          Connect your Google Calendar so Tackly can join meetings for you — or keep inviting
          the bot with a link, up to you.
        </p>
        <button
          onClick={() => setShowComingSoon(true)}
          className="mt-4 h-10 rounded-xl bg-periwinkle px-4 text-sm font-semibold text-white transition-colors hover:bg-periwinkle-deep"
        >
          Connect Google Calendar
        </button>
      </section>

      {showComingSoon && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
          onClick={() => setShowComingSoon(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border-2 border-ink bg-paper-raised p-6 text-center shadow-brutal animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-periwinkle-tint">
              <Calendar className="h-6 w-6 text-periwinkle-deep" />
            </div>
            <p className="mt-4 font-display text-lg font-bold text-ink">Coming soon</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              We're still working on this — you can still invite a bot to your meeting instantly
              instead by sharing the link.
            </p>
            <button
              onClick={() => setShowComingSoon(false)}
              className="mt-5 h-10 w-full rounded-xl border-2 border-ink bg-periwinkle font-display text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function SettingsPage() {
  const { user, refresh, logout } = useAuth();
  const [name, setName] = useState(user?.full_name || "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    try {
      await base44.auth.updateMe({ full_name: name });
      await refresh();
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg animate-fade-up">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
        Settings
      </h1>

      <section className="mt-8 rounded-2xl border border-line bg-paper-raised p-6 shadow-note">
        <h2 className="font-display text-lg font-bold text-ink">Profile</h2>
        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="h-11 w-full rounded-xl border border-line bg-paper-raised px-3.5 text-sm placeholder:text-ink-faint focus:border-periwinkle"
            />
          </label>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">Email</span>
            <p className="flex h-11 items-center rounded-xl bg-paper-sunken px-3.5 text-sm text-ink-soft">
              {user?.email}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="h-10 rounded-xl bg-periwinkle px-4 text-sm font-semibold text-white transition-colors hover:bg-periwinkle-deep disabled:opacity-60"
            >
              Save changes
            </button>
            {saved && <span className="text-sm text-ink-soft">Saved.</span>}
          </div>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-paper-raised p-6 shadow-note">
        <h2 className="font-display text-lg font-bold text-ink">Plan &amp; usage</h2>
        <div className="mt-4">
          <UsageBadge variant="detailed" />
        </div>
        <PlansSection />
      </section>

      <CalendarSection />

      <section className="mt-6 rounded-2xl border border-line bg-paper-raised p-6 shadow-note">
        <h2 className="font-display text-lg font-bold text-ink">Account</h2>
        <button
          onClick={logout}
          className="mt-3 h-10 rounded-xl border border-line px-4 text-sm font-medium text-ink transition-colors hover:bg-paper-sunken"
        >
          Log out
        </button>
      </section>
    </div>
  );
}
