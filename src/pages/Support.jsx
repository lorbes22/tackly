import { useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { useAuth } from "@/lib/AuthContext";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

const SupportTicket = base44.entities.SupportTicket;

export default function Support() {
  const { user } = useAuth();
  useDocumentMeta({
    title: "Support — Tackly",
    description: "Get in touch with the Tackly team.",
  });

  const [form, setForm] = useState({
    name: user?.full_name || "",
    email: user?.email || "",
    subject: "",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await SupportTicket.create({
        name: form.name.trim(),
        email: form.email.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
        owner_email: user?.email,
      });
      setSent(true);
    } catch (err) {
      setError(err.message || "Couldn't send that — try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

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

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-4 py-12">
        {sent ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center animate-fade-up">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-note-mint">
              <CheckCircle2 className="h-8 w-8 text-ink" />
            </div>
            <p className="mt-5 font-display text-2xl font-bold text-ink">Got it — message sent.</p>
            <p className="mt-2 max-w-sm text-sm text-ink-soft">
              We read every message ourselves. We'll get back to you at {form.email || "your email"}{" "}
              as soon as we can.
            </p>
            <Link
              to="/"
              className="mt-7 flex h-11 items-center gap-2 rounded-xl bg-periwinkle px-6 text-sm font-semibold text-white shadow-note transition-all hover:-translate-y-0.5 hover:bg-periwinkle-deep"
            >
              Back to home
            </Link>
          </div>
        ) : (
          <div className="w-full animate-fade-up">
            <h1 className="text-center font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Get in touch
            </h1>
            <p className="mt-2 text-center text-ink-soft">
              Bug, question, feature idea — whatever it is, we'll read it.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Name</span>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={set("name")}
                    placeholder="Your name"
                    className="h-11 w-full rounded-xl border-2 border-ink bg-paper-raised px-3.5 font-display text-sm text-ink placeholder:text-ink-faint focus:border-periwinkle"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Email</span>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={set("email")}
                    placeholder="you@example.com"
                    className="h-11 w-full rounded-xl border-2 border-ink bg-paper-raised px-3.5 font-display text-sm text-ink placeholder:text-ink-faint focus:border-periwinkle"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Subject</span>
                <input
                  type="text"
                  required
                  value={form.subject}
                  onChange={set("subject")}
                  placeholder="What's this about?"
                  className="h-11 w-full rounded-xl border-2 border-ink bg-paper-raised px-3.5 font-display text-sm text-ink placeholder:text-ink-faint focus:border-periwinkle"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Message</span>
                <textarea
                  required
                  rows={5}
                  value={form.message}
                  onChange={set("message")}
                  placeholder="Tell us what's going on…"
                  className="w-full rounded-xl border-2 border-ink bg-paper-raised px-3.5 py-3 font-display text-sm text-ink placeholder:text-ink-faint focus:border-periwinkle"
                />
              </label>

              {error && (
                <p className="rounded-lg bg-note-coral px-3 py-2 text-sm text-ink" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="h-12 w-full rounded-xl border-2 border-ink bg-periwinkle font-display text-sm font-bold text-white shadow-brutal-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              >
                {busy ? "Sending…" : "Send message"}
              </button>
            </form>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
