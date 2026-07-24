import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { PlanCards } from "@/components/PlanCards";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { useAuth } from "@/lib/AuthContext";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { ArrowLeft } from "lucide-react";

export default function Plans() {
  const { user } = useAuth();
  useDocumentMeta({
    title: "Plans & pricing — Tackly",
    description: "Free to start — 30 minutes a month, meetings included. Upgrade for more.",
  });

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Logo />
        <Link
          to={user ? "/app" : "/"}
          className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          {user ? "Back to your threads" : "Back to home"}
        </Link>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink">
            Plans &amp; pricing
          </h1>
          <p className="mt-3 text-ink-soft">
            Free to start — 30 minutes of rambling a month, meetings included. Upgrade whenever
            you talk more than that.
          </p>
        </div>

        <PlanCards className="mx-auto mt-10 max-w-4xl" />
      </main>

      <SiteFooter />
    </div>
  );
}
