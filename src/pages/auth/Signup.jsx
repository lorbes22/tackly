import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  AuthShell,
  Divider,
  ErrorNote,
  Field,
  GoogleButton,
  SubmitButton,
} from "@/pages/auth/AuthShell";
import { OtpForm } from "@/pages/auth/OtpForm";

export default function Signup() {
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("form"); // form | otp

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await base44.auth.register({ email, password });
      setStep("otp");
    } catch (err) {
      if (err.status === 400 || err.status === 422) {
        setError(
          err.message ||
            "Check your email and make sure the password is at least 8 characters."
        );
      } else {
        setError(err.message || "Sign up failed. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (step === "otp") {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle={`We sent a 6-digit code to ${email}.`}
      >
        <OtpForm
          email={email}
          onVerified={async () => {
            await base44.auth.loginViaEmailPassword(email, password);
            base44.functions.invoke("send-templated-email", {}).catch(() => {});
            await refresh();
            navigate("/app", { replace: true });
          }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free to start. Your first map is minutes away."
    >
      <GoogleButton
        label="Sign up with Google"
        onClick={() =>
          base44.auth.loginWithProvider("google", window.location.origin + "/app")
        }
      />
      <Divider />
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
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          required
        />
        <ErrorNote>{error}</ErrorNote>
        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        Already mapping?{" "}
        <Link to="/login" className="font-medium text-periwinkle hover:text-periwinkle-deep">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
