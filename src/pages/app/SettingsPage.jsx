import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { UsageBadge } from "@/components/UsageBadge";
import { Calendar, Check } from "lucide-react";

const CalendarConnection = base44.entities.CalendarConnection;

function CalendarSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [togglingAutoJoin, setTogglingAutoJoin] = useState(false);
  const [banner, setBanner] = useState(null); // { kind: "success" | "error", text }
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const calendarParam = searchParams.get("calendar");
      try {
        if (calendarParam === "connected") {
          const existing = await CalendarConnection.filter({}, "-created_date", 1);
          if (existing[0]) {
            await CalendarConnection.update(existing[0].id, {
              connected_at: new Date().toISOString(),
            });
          } else {
            await CalendarConnection.create({
              provider: "google",
              connected_at: new Date().toISOString(),
            });
          }
          if (!cancelled) setBanner({ kind: "success", text: "Google Calendar connected." });
        } else if (calendarParam === "error") {
          if (!cancelled) {
            setBanner({
              kind: "error",
              text: "Couldn't connect Google Calendar — please try again.",
            });
          }
        }
        if (calendarParam) {
          searchParams.delete("calendar");
          setSearchParams(searchParams, { replace: true });
        }
        const rows = await CalendarConnection.filter({}, "-created_date", 1);
        if (!cancelled) setConnection(rows[0] || null);
      } catch {
        // best-effort; the section just shows "not connected"
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setConnecting(true);
    setError("");
    try {
      const res = await base44.functions.invoke("recall-calendar-connect-url", {});
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        setError(res.data?.error || "Couldn't start the connection.");
        setConnecting(false);
      }
    } catch (err) {
      setError(err.message || "Couldn't start the connection.");
      setConnecting(false);
    }
  };

  const toggleAutoJoin = async () => {
    if (!connection) return;
    setTogglingAutoJoin(true);
    setError("");
    const next = !connection.auto_join;
    try {
      await base44.functions.invoke("recall-calendar-set-preferences", { auto_join: next });
      setConnection((prev) => ({ ...prev, auto_join: next }));
    } catch (err) {
      setError(err.message || "Couldn't update that — try again.");
    } finally {
      setTogglingAutoJoin(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-line bg-paper-raised p-6 shadow-note">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-periwinkle-tint">
          <Calendar className="h-4 w-4 text-periwinkle-deep" />
        </div>
        <h2 className="font-display text-lg font-bold text-ink">Calendar</h2>
      </div>

      {banner && (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            banner.kind === "success" ? "bg-note-mint text-ink" : "bg-note-coral text-ink"
          }`}
        >
          {banner.text}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-lg bg-note-coral px-3 py-2 text-sm text-ink" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-4 flex justify-center py-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-periwinkle" />
        </div>
      ) : connection ? (
        <>
          <div className="mt-4 flex items-center gap-2 text-sm text-ink">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-note-mint">
              <Check className="h-3 w-3 text-ink" />
            </span>
            Google Calendar connected
          </div>
          <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-paper-sunken p-3.5">
            <div>
              <p className="text-sm font-bold text-ink">Automatically join meetings</p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {connection.auto_join
                  ? "Tackly's bot joins every meeting on your calendar automatically."
                  : "Off — invite the bot with a meeting link yourself, as usual."}
              </p>
            </div>
            <button
              onClick={toggleAutoJoin}
              disabled={togglingAutoJoin}
              role="switch"
              aria-checked={!!connection.auto_join}
              className={`relative h-7 w-12 shrink-0 rounded-full border-2 border-ink transition-colors disabled:opacity-50 ${
                connection.auto_join ? "bg-periwinkle" : "bg-paper-raised"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4.5 w-4.5 rounded-full border border-ink bg-paper-raised transition-transform ${
                  connection.auto_join ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink-soft">
            Connect your Google Calendar so Tackly can join meetings for you — or keep inviting
            the bot with a link, up to you.
          </p>
          <button
            onClick={connect}
            disabled={connecting}
            className="mt-4 h-10 rounded-xl bg-periwinkle px-4 text-sm font-semibold text-white transition-colors hover:bg-periwinkle-deep disabled:opacity-60"
          >
            {connecting ? "Redirecting…" : "Connect Google Calendar"}
          </button>
        </>
      )}
    </section>
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
