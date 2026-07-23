import { NavLink, Outlet } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { ArrowLeft, CreditCard, Gauge, Mail, Users } from "lucide-react";

function AdminNavLink({ to, end, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      end={end}
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

export default function AdminLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <Logo to="/admin" />
              <span className="rounded-md bg-ink px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-paper">
                Admin
              </span>
            </div>
            <nav className="flex items-center gap-1" aria-label="Admin">
              <AdminNavLink to="/admin" end icon={Gauge} label="Overview" />
              <AdminNavLink to="/admin/users" icon={Users} label="Users" />
              <AdminNavLink to="/admin/plans" icon={CreditCard} label="Plans" />
              <AdminNavLink to="/admin/emails" icon={Mail} label="Emails" />
            </nav>
          </div>
          <NavLink
            to="/app"
            className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to app
          </NavLink>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
