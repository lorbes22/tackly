import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { AuthShell, ErrorNote, Field, SubmitButton } from "@/pages/auth/AuthShell";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Base44's reset-password email link carries the token as ?token=... —
  // adjust here if the actual email format turns out to differ.
  const resetToken = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await base44.auth.resetPassword({ resetToken, newPassword: password });
      setDone(true);
    } catch (err) {
      if (err.status === 400) {
        setError("This reset link is invalid or has expired. Request a new one.");
      } else if (err.status === 422) {
        setError("Password doesn't meet the requirements — try a longer one.");
      } else {
        setError(err.message || "Couldn't reset your password. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!resetToken) {
    return (
      <AuthShell title="Invalid link" subtitle="This reset link is missing its token.">
        <Link
          to="/forgot-password"
          className="mx-auto block text-center text-sm font-medium text-periwinkle hover:text-periwinkle-deep"
        >
          Request a new reset link
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="You can log in with your new password now.">
        <button
          onClick={() => navigate("/login")}
          className="flex h-11 w-full items-center justify-center rounded-xl bg-periwinkle text-sm font-semibold text-white transition-colors hover:bg-periwinkle-deep"
        >
          Go to log in
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose something at least 8 characters.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          required
        />
        <Field
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Type it again"
          autoComplete="new-password"
          required
        />
        <ErrorNote>{error}</ErrorNote>
        <SubmitButton busy={busy}>Reset password</SubmitButton>
      </form>
    </AuthShell>
  );
}
