import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const returnTo = location.state?.returnTo || "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsOtp, setNeedsOtp] = useState(false);

  const finishLogin = async () => {
    await refresh();
    navigate(returnTo, { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      await finishLogin();
    } catch (err) {
      if (err.status === 403) {
        // Registered but never verified — resend the code and switch to OTP entry
        try {
          await base44.auth.resendOtp(email);
        } catch {
          // ignore resend failures; user can retry from the OTP form
        }
        setNeedsOtp(true);
      } else if (err.status === 401) {
        setError("That email and password don't match. Check them and try again.");
      } else {
        setError(err.message || "Login failed. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (needsOtp) {
    return (
      <AuthShell
        title="Verify your email"
        subtitle={`We sent a 6-digit code to ${email}.`}
      >
        <OtpForm
          email={email}
          onVerified={async () => {
            await base44.auth.loginViaEmailPassword(email, password);
            await finishLogin();
          }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Welcome back" subtitle="Pick up where your thinking left off.">
      <GoogleButton
        onClick={() =>
          base44.auth.loginWithProvider("google", window.location.origin + returnTo)
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
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
        <ErrorNote>{error}</ErrorNote>
        <SubmitButton busy={busy}>Log in</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        New to Tackly?{" "}
        <Link to="/signup" className="font-medium text-periwinkle hover:text-periwinkle-deep">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
