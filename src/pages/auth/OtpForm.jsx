import { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { ErrorNote, SubmitButton } from "@/pages/auth/AuthShell";

const CODE_LENGTH = 6;

// Six individual digit boxes instead of one plain text field — auto-advances
// focus as each digit is typed, supports backspace-to-previous, and pasting
// a full code fills every box at once. Styled to match the rest of the
// platform's inputs (rounded-xl, border-line, periwinkle focus ring,
// font-display for the digits themselves).
function OtpBoxes({ value, onChange }) {
  const inputRefs = useRef([]);
  const digits = value.split("").concat(Array(CODE_LENGTH).fill("")).slice(0, CODE_LENGTH);

  const setDigit = (i, digit) => {
    const next = digits.slice();
    next[i] = digit;
    onChange(next.join(""));
  };

  const handleChange = (i, raw) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    setDigit(i, digit);
    if (digit && i < CODE_LENGTH - 1) inputRefs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
      setDigit(i - 1, "");
    } else if (e.key === "ArrowLeft" && i > 0) {
      inputRefs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < CODE_LENGTH - 1) {
      inputRefs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted.padEnd(CODE_LENGTH, "").slice(0, CODE_LENGTH));
    inputRefs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  };

  return (
    <div className="flex justify-center gap-2" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (inputRefs.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="h-12 w-11 rounded-xl border border-line bg-paper-raised text-center font-display text-xl font-bold text-ink transition-colors focus:border-periwinkle focus:outline-none focus:ring-2 focus:ring-periwinkle-tint"
        />
      ))}
    </div>
  );
}

export function OtpForm({ email, onVerified }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
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
      <OtpBoxes value={code} onChange={setCode} />
      <ErrorNote>{error}</ErrorNote>
      {resent && (
        <p className="rounded-lg bg-note-mint px-3 py-2 text-center text-sm text-ink">
          New code sent. Check your inbox.
        </p>
      )}
      <SubmitButton busy={busy} disabled={busy || code.length < CODE_LENGTH}>
        Verify email
      </SubmitButton>
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
