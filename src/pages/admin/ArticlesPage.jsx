import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { renderMarkdown } from "@/lib/markdown";
import { Eye, ExternalLink, Newspaper, Plus, Trash2 } from "lucide-react";

const Article = base44.entities.Article;

function slugify(text) {
  return (text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const BLANK = {
  title: "",
  slug: "",
  excerpt: "",
  content_markdown: "",
  cover_image_url: "",
  meta_title: "",
  meta_description: "",
  status: "draft",
  author_name: "Tackly Team",
};

const MOCK_ARTICLE = {
  title: "Why meeting notes are the wrong shape for how you actually think",
  slug: "why-meeting-notes-are-the-wrong-shape",
  excerpt:
    "Most AI notetakers hand you a wall of transcript with a summary bolted on top. Here's why a structured thought-map gets you back to a decision faster.",
  content_markdown: `Most "AI notetaker" tools do one thing well: they turn speech into text. That's transcription, not understanding.

## The problem with a wall of text

A 45-minute meeting produces thousands of words. Skimming a bullet-point summary after the fact still means you're reconstructing the *structure* of the conversation from memory — which idea led to which decision, which risk got raised and never resolved.

## What a thought-map gives you instead

Tackly classifies each utterance as it happens — an idea, a decision, a risk, an open question — and connects it to whatever it was actually responding to. The result isn't a transcript with a summary on top. It's the shape of the conversation itself, live, as it happens.

## Try it

Hold a key and think out loud, invite the bot to your next call, or paste in a transcript you already have. Same map, either way.`,
  cover_image_url: "",
  meta_title: "",
  meta_description: "",
  status: "draft",
  author_name: "Tackly Team",
};

export default function ArticlesPage() {
  const [articles, setArticles] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(BLANK);
  const [slugTouched, setSlugTouched] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    Article.list("-updated_date", 200)
      .then((rows) => setArticles(rows))
      .catch((err) => setError(err.message));
  };
  useEffect(load, []);

  const selectArticle = (a) => {
    setSelectedId(a.id);
    setDraft({ ...BLANK, ...a });
    setSlugTouched(true);
    setPreview(false);
    setError("");
  };

  const startNew = (seed = BLANK) => {
    setSelectedId(null);
    setDraft(seed);
    setSlugTouched(!!seed.slug);
    setPreview(false);
    setError("");
  };

  const setField = (key) => (e) => {
    const value = e.target.value;
    setDraft((d) => {
      const next = { ...d, [key]: value };
      if (key === "title" && !slugTouched) next.slug = slugify(value);
      return next;
    });
  };

  const save = async () => {
    if (!draft.title.trim() || !draft.slug.trim() || !draft.content_markdown.trim()) {
      setError("Title, slug, and content are all required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const wasPublished = selectedId ? articles.find((a) => a.id === selectedId)?.status === "published" : false;
      const fields = {
        ...draft,
        slug: slugify(draft.slug),
        published_at:
          draft.status === "published" && !wasPublished && !draft.published_at
            ? new Date().toISOString()
            : draft.published_at || undefined,
      };
      if (selectedId) {
        await Article.update(selectedId, fields);
      } else {
        const created = await Article.create(fields);
        setSelectedId(created.id);
      }
      load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setBusy(true);
    try {
      await Article.delete(id);
      if (selectedId === id) startNew();
      load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-periwinkle-tint">
            <Newspaper className="h-5 w-5 text-periwinkle-deep" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Articles</h1>
            <p className="text-ink-soft">Write and publish to /articles — changes go live instantly, no deploy.</p>
          </div>
        </div>
        <button
          onClick={() => startNew()}
          className="flex h-9 items-center gap-1.5 rounded-lg border-2 border-ink bg-periwinkle px-3 text-sm font-semibold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5"
        >
          <Plus className="h-4 w-4" />
          New article
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-note-coral px-3 py-2 text-sm text-ink" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[260px_1fr]">
        <div className="space-y-1">
          {articles === null ? (
            <p className="text-sm text-ink-soft">Loading…</p>
          ) : articles.length === 0 ? (
            <button
              onClick={() => startNew(MOCK_ARTICLE)}
              className="w-full rounded-lg border border-dashed border-line px-3 py-3 text-left text-xs text-ink-soft hover:border-periwinkle hover:text-ink"
            >
              No articles yet — start from a mock draft to see the shape of one.
            </button>
          ) : (
            articles.map((a) => (
              <button
                key={a.id}
                onClick={() => selectArticle(a)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selectedId === a.id
                    ? "bg-periwinkle-tint font-semibold text-periwinkle-deep"
                    : "text-ink-soft hover:bg-paper-sunken hover:text-ink"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      a.status === "published" ? "bg-emerald-500" : "bg-ink-faint"
                    }`}
                  />
                  {a.title || "Untitled"}
                </span>
                <span className="block text-xs font-normal text-ink-faint">/{a.slug}</span>
              </button>
            ))
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-paper-raised shadow-note">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold text-ink">
              {selectedId ? "Edit article" : "New article"}
            </span>
            <div className="flex items-center gap-2">
              {selectedId && draft.status === "published" && (
                <Link
                  to={`/articles/${draft.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-soft hover:bg-paper-sunken hover:text-ink"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View live
                </Link>
              )}
              <button
                onClick={() => setPreview((v) => !v)}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-soft hover:bg-paper-sunken hover:text-ink"
              >
                <Eye className="h-3.5 w-3.5" />
                {preview ? "Edit" : "Preview"}
              </button>
              {selectedId && (
                <button
                  onClick={() => remove(selectedId)}
                  disabled={busy}
                  title="Delete article"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint hover:bg-note-coral hover:text-ink disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4 p-4">
            {preview ? (
              <div className="rounded-xl border border-line bg-paper p-5">
                <p className="font-display text-2xl font-bold text-ink">{draft.title || "Untitled"}</p>
                <div
                  className="mt-4 text-sm text-ink-soft [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_h3]:mt-4 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-ink [&_p]:mt-3 [&_p]:leading-relaxed [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.content_markdown) }}
                />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-ink-soft">Title</span>
                    <input
                      type="text"
                      value={draft.title}
                      onChange={setField("title")}
                      placeholder="Article title"
                      className="h-9 w-full rounded-lg border border-line bg-paper px-3 text-sm focus:border-periwinkle"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-ink-soft">
                      Slug — /articles/…
                    </span>
                    <input
                      type="text"
                      value={draft.slug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setDraft((d) => ({ ...d, slug: e.target.value }));
                      }}
                      placeholder="article-slug"
                      className="h-9 w-full rounded-lg border border-line bg-paper px-3 font-mono text-sm focus:border-periwinkle"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink-soft">
                    Excerpt (also the default meta description)
                  </span>
                  <textarea
                    rows={2}
                    value={draft.excerpt}
                    onChange={setField("excerpt")}
                    placeholder="One or two sentences shown on the articles list page"
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm focus:border-periwinkle"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink-soft">Content (Markdown)</span>
                  <textarea
                    rows={16}
                    value={draft.content_markdown}
                    onChange={setField("content_markdown")}
                    placeholder="## Write in Markdown&#10;&#10;Headings, **bold**, lists, links — it all renders on the live page."
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm focus:border-periwinkle"
                  />
                </label>

                <details className="rounded-lg border border-line px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-ink-soft">
                    Advanced SEO (optional overrides)
                  </summary>
                  <div className="mt-3 space-y-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-ink-soft">
                        Meta title override
                      </span>
                      <input
                        type="text"
                        value={draft.meta_title}
                        onChange={setField("meta_title")}
                        placeholder={draft.title || "Falls back to title"}
                        className="h-9 w-full rounded-lg border border-line bg-paper px-3 text-sm focus:border-periwinkle"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-ink-soft">
                        Meta description override
                      </span>
                      <textarea
                        rows={2}
                        value={draft.meta_description}
                        onChange={setField("meta_description")}
                        placeholder={draft.excerpt || "Falls back to excerpt"}
                        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm focus:border-periwinkle"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-ink-soft">
                        Cover image URL (also og:image)
                      </span>
                      <input
                        type="text"
                        value={draft.cover_image_url}
                        onChange={setField("cover_image_url")}
                        placeholder="https://…"
                        className="h-9 w-full rounded-lg border border-line bg-paper px-3 text-sm focus:border-periwinkle"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-ink-soft">Author name</span>
                      <input
                        type="text"
                        value={draft.author_name}
                        onChange={setField("author_name")}
                        className="h-9 w-full rounded-lg border border-line bg-paper px-3 text-sm focus:border-periwinkle"
                      />
                    </label>
                  </div>
                </details>

                <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-ink">
                    <select
                      value={draft.status}
                      onChange={setField("status")}
                      className="h-9 rounded-lg border border-line bg-paper px-2.5 text-sm text-ink"
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                  </label>
                  <button
                    onClick={save}
                    disabled={busy}
                    className="h-10 rounded-xl border-2 border-ink bg-periwinkle px-5 text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {busy ? "Saving…" : selectedId ? "Save changes" : "Create article"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
