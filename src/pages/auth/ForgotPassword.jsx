import { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { AuthShell, ErrorNote, Field, SubmitButton } from "@/pages/auth/AuthShell";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await base44.auth.resetPasswordRequest(email);
      setSent(true);
    } catch (err) {
      // Don't reveal whether the email exists — same message either way.
      if (err.status === 429) {
        setError("Too many requests. Wait a minute, then try again.");
      } else {
        setSent(true);
      }
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle={`If an account exists for ${email}, a reset link is on its way.`}
      >
        <Link
          to="/login"
          className="mx-auto block text-center text-sm font-medium text-periwinkle hover:text-periwinkle-deep"
        >
          Back to log in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <ErrorNote>{error}</ErrorNote>
        <SubmitButton busy={busy}>Send reset link</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        <Link to="/login" className="font-medium text-periwinkle hover:text-periwinkle-deep">
          Back to log in
        </Link>
      </p>
    </AuthShell>
  );
}
