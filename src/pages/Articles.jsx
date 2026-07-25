import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, ArrowRight } from "lucide-react";

const Article = base44.entities.Article;

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function Articles() {
  useDocumentMeta({
    title: "Articles — Tackly",
    description:
      "Notes on thinking out loud, running better meetings, and building an AI notetaker that maps what you say instead of just transcribing it.",
  });

  const [articles, setArticles] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Article.filter({ status: "published" }, "-published_at", 100)
      .then((rows) => !cancelled && setArticles(rows))
      .catch(() => !cancelled && setArticles([]));
    return () => {
      cancelled = true;
    };
  }, []);

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

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink">Articles</h1>
        <p className="mt-2 text-ink-soft">
          Notes on thinking out loud, running better meetings, and mapping thought instead of just
          transcribing it.
        </p>

        <div className="mt-10 space-y-4">
          {articles === null ? (
            <p className="text-sm text-ink-soft">Loading…</p>
          ) : articles.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-soft">
              Nothing published yet — check back soon.
            </p>
          ) : (
            articles.map((a) => (
              <Link
                key={a.id}
                to={`/articles/${a.slug}`}
                className="block rounded-2xl border-2 border-ink bg-paper-raised p-6 shadow-brutal-sm transition-transform hover:-translate-y-1"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                  {formatDate(a.published_at)}
                </p>
                <h2 className="mt-1.5 font-display text-xl font-bold text-ink">{a.title}</h2>
                {a.excerpt && <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{a.excerpt}</p>}
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-periwinkle">
                  Read more <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
