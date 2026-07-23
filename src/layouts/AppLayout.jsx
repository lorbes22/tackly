import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { OnboardingModal } from "@/components/OnboardingModal";
import { LayoutGrid, LogOut, Plus, Search, Settings, Shield } from "lucide-react";

function TopNavLink({ to, end, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={({ isActive }) =>
        `flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
          isActive
            ? "bg-periwinkle-tint text-periwinkle-deep"
            : "text-ink-soft hover:bg-paper-sunken hover:text-ink"
        }`
      }
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </NavLink>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [waitlistMode, setWaitlistMode] = useState(false);

  useEffect(() => {
    if (!user) return;
    const seenKey = `tackly:onboarding-seen:${user.id}`;
    if (localStorage.getItem(seenKey)) return;
    base44.entities.AppConfig.list()
      .then((rows) => setWaitlistMode(rows[0]?.waitlist_mode ?? false))
      .catch(() => {})
      .finally(() => setShowOnboarding(true));
  }, [user]);

  const dismissOnboarding = () => {
    if (user) localStorage.setItem(`tackly:onboarding-seen:${user.id}`, "1");
    setShowOnboarding(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Logo to="/app" />
            <nav className="flex items-center gap-1" aria-label="Main">
              <TopNavLink to="/app" end icon={LayoutGrid} label="Threads" />
              <TopNavLink to="/app/new" icon={Plus} label="New session" />
              <TopNavLink to="/app/search" icon={Search} label="Search" />
            </nav>
          </div>
          <div className="flex items-center gap-1">
            {user?.role === "admin" && (
              <TopNavLink to="/admin" icon={Shield} label="Admin" />
            )}
            <TopNavLink to="/app/settings" icon={Settings} label="Settings" />
            <button
              onClick={logout}
              title="Log out"
              className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      {showOnboarding && (
        <OnboardingModal waitlistMode={waitlistMode} onDone={dismissOnboarding} />
      )}
    </div>
  );
}
