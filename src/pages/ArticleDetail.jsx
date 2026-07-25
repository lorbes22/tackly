import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { renderMarkdown } from "@/lib/markdown";
import { base44 } from "@/api/base44Client";
import { ArrowLeft } from "lucide-react";

const Article = base44.entities.Article;

const ARTICLE_BODY_CLASS =
  "mt-8 text-ink-soft [&_a]:text-periwinkle [&_a]:underline [&_blockquote]:mt-4 [&_blockquote]:border-l-4 [&_blockquote]:border-periwinkle-tint [&_blockquote]:pl-4 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-paper-sunken [&_code]:px-1.5 [&_code]:py-0.5 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-ink [&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-ink [&_li]:mt-1 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-4 [&_p]:leading-relaxed [&_strong]:text-ink [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function ArticleDetail() {
  const { slug } = useParams();
  const [article, setArticle] = useState(undefined); // undefined = loading, null = not found

  useEffect(() => {
    let cancelled = false;
    setArticle(undefined);
    Article.filter({ slug }, "-created_date", 1)
      .then((rows) => {
        if (cancelled) return;
        setArticle(rows.find((a) => a.status === "published") || null);
      })
      .catch(() => !cancelled && setArticle(null));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useDocumentMeta({
    title: article ? `${article.meta_title || article.title} — Tackly` : "Tackly",
    description: article ? article.meta_description || article.excerpt : undefined,
  });

  // Canonical link, og:image, and Article JSON-LD structured data — beyond
  // what the shared useDocumentMeta hook covers, so handled directly here.
  useEffect(() => {
    if (!article) return;
    const canonical = document.head.querySelector('link[rel="canonical"]');
    const prevHref = canonical?.getAttribute("href");
    canonical?.setAttribute("href", `https://tackly.co/articles/${article.slug}`);

    let ogImage = document.head.querySelector('meta[property="og:image"]');
    if (article.cover_image_url) {
      if (!ogImage) {
        ogImage = document.createElement("meta");
        ogImage.setAttribute("property", "og:image");
        document.head.appendChild(ogImage);
      }
      ogImage.setAttribute("content", article.cover_image_url);
    }

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title,
      description: article.meta_description || article.excerpt || undefined,
      image: article.cover_image_url || undefined,
      author: { "@type": "Organization", name: article.author_name || "Tackly Team" },
      datePublished: article.published_at || undefined,
      publisher: { "@type": "Organization", name: "Tackly" },
      mainEntityOfPage: `https://tackly.co/articles/${article.slug}`,
    });
    document.head.appendChild(script);

    return () => {
      if (canonical && prevHref) canonical.setAttribute("href", prevHref);
      document.head.removeChild(script);
    };
  }, [article]);

  if (article === null) {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <Logo />
          <Link
            to="/articles"
            className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            All articles
          </Link>
        </header>
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-12 text-center">
          <h1 className="font-display text-2xl font-bold text-ink">Article not found</h1>
          <p className="mt-2 text-sm text-ink-soft">It may have been unpublished or moved.</p>
          <Link
            to="/articles"
            className="mt-6 flex h-11 items-center gap-2 rounded-xl bg-periwinkle px-6 text-sm font-semibold text-white shadow-note transition-all hover:-translate-y-0.5 hover:bg-periwinkle-deep"
          >
            Browse articles
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Logo />
        <Link
          to="/articles"
          className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          All articles
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
        {article === undefined ? (
          <p className="text-sm text-ink-soft">Loading…</p>
        ) : (
          <article className="animate-fade-up">
            {article.cover_image_url && (
              <img
                src={article.cover_image_url}
                alt=""
                className="mb-8 aspect-video w-full rounded-2xl border-2 border-ink object-cover shadow-brutal-sm"
              />
            )}
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              {formatDate(article.published_at)}
              {article.author_name ? ` · ${article.author_name}` : ""}
            </p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink">{article.title}</h1>
            <div
              className={ARTICLE_BODY_CLASS}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(article.content_markdown) }}
            />
          </article>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
