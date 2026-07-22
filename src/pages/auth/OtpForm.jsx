import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { ErrorNote, Field, SubmitButton } from "@/pages/auth/AuthShell";

export function OtpForm({ email, onVerified }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await base44.auth.verifyOtp({ email, otpCode: code.trim() });
      await onVerified();
    } catch (err) {
      if (err.status === 400) {
        setError("That code is invalid or expired. Check it or resend a new one.");
      } else if (err.status === 429) {
        setError("Too many attempts. Wait a minute, then try again.");
      } else {
        setError(err.message || "Verification failed. Try again.");
      }
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setResent(false);
    try {
      await base44.auth.resendOtp(email);
      setResent(true);
    } catch (err) {
      setError(
        err.status === 429
          ? "Too many requests. Wait a minute before resending."
          : "Couldn't resend the code. Try again."
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field
        label="Verification code"
        type="text"
        inputMode="numeric"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="123456"
        autoComplete="one-time-code"
        required
      />
      <ErrorNote>{error}</ErrorNote>
      {resent && (
        <p className="rounded-lg bg-note-mint px-3 py-2 text-sm text-ink">
          New code sent. Check your inbox.
        </p>
      )}
      <SubmitButton busy={busy}>Verify email</SubmitButton>
      <button
        type="button"
        onClick={handleResend}
        className="mx-auto block text-sm font-medium text-periwinkle hover:text-periwinkle-deep"
      >
        Resend code
      </button>
    </form>
  );
}
