import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { UsageBadge } from "@/components/UsageBadge";

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
      </section>

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
