import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { ArrowLeft } from "lucide-react";

export function LegalPage({ title, updated, description, children }) {
  useDocumentMeta({ title: `${title} — Tackly`, description });

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Logo />
        <Link
          to="/"
          className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-ink-faint">Last updated {updated}</p>
        <div className="legal-copy mt-8 space-y-6 text-[15px] leading-relaxed text-ink-soft">
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
