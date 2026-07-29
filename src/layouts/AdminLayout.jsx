import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Logo } from "@/components/Logo";
import {
  ArrowLeft,
  Bell,
  CreditCard,
  Gauge,
  LifeBuoy,
  Mail,
  Menu,
  Newspaper,
  Settings,
  Users,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/admin", end: true, icon: Gauge, label: "Overview" },
  { to: "/admin/users", icon: Users, label: "Users" },
  { to: "/admin/plans", icon: CreditCard, label: "Plans" },
  { to: "/admin/emails", icon: Mail, label: "Emails" },
  { to: "/admin/articles", icon: Newspaper, label: "Articles" },
  { to: "/admin/config", icon: Settings, label: "Config" },
  { to: "/admin/tickets", icon: LifeBuoy, label: "Tickets" },
  { to: "/admin/activity", icon: Bell, label: "Activity" },
];

function DesktopNavLink({ to, end, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors xl:px-3 ${
          isActive
            ? "bg-periwinkle-tint text-periwinkle-deep"
            : "text-ink-soft hover:bg-paper-sunken hover:text-ink"
        }`
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </NavLink>
  );
}

function MobileNavLink({ to, end, icon: Icon, label, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-semibold transition-colors ${
          isActive
            ? "bg-periwinkle-tint text-periwinkle-deep"
            : "text-ink-soft hover:bg-paper-sunken hover:text-ink"
        }`
      }
    >
      <Icon className="h-4.5 w-4.5 shrink-0" />
      {label}
    </NavLink>
  );
}

export default function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer automatically whenever the route changes (covers
  // back/forward nav and any programmatic redirect, not just link clicks).
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo to="/admin" />
            <span className="hidden rounded-md bg-ink px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-paper sm:inline-block">
              Admin
            </span>
          </div>

          {/* Desktop nav: all labels visible, wraps to a second row rather
              than hiding items if the window gets narrow. */}
          <nav className="hidden flex-1 flex-wrap items-center justify-center gap-1 md:flex" aria-label="Admin">
            {NAV_ITEMS.map((item) => (
              <DesktopNavLink key={item.to} {...item} />
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1">
            <NavLink
              to="/app"
              className="hidden h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink md:flex"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to app
            </NavLink>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink md:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="border-t border-line bg-paper px-4 py-3 md:hidden">
            <nav className="grid grid-cols-2 gap-1.5" aria-label="Admin mobile">
              {NAV_ITEMS.map((item) => (
                <MobileNavLink key={item.to} {...item} onNavigate={() => setMenuOpen(false)} />
              ))}
            </nav>
            <NavLink
              to="/app"
              onClick={() => setMenuOpen(false)}
              className="mt-1.5 flex h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
            >
              <ArrowLeft className="h-4.5 w-4.5 shrink-0" />
              Back to app
            </NavLink>
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
