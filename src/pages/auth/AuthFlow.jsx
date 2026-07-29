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

// Single dynamic entry point for both /login and /signup (both routes render
// this same component — see Login.jsx/Signup.jsx). Email comes first, with
// no password field in sight; submitting it checks (check-email-exists
// function) whether the address already has an account, then reveals a
// password field with copy/action tailored to that answer — "enter your
// password" for an existing user, "create a password" for a new one. This
// replaces having two separate, static login/signup forms.
export default function AuthFlow() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const returnTo = location.state?.returnTo || "/app";

  // If this login/signup was reached via a board-invite link (RequireAuth
  // preserves the original path + query in returnTo), pull the inviter's
  // board title back out to personalize the copy below.
  const invite = (() => {
    const qIndex = returnTo.indexOf("?");
    if (qIndex === -1) return null;
    const params = new URLSearchParams(returnTo.slice(qIndex));
    if (params.get("invited") !== "1") return null;
    return { title: params.get("title") || "" };
  })();

  // email -> login | signup -> otp
  const [stage, setStage] = useState("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    await refresh();
    navigate(returnTo, { replace: true });
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await base44.functions.invoke("check-email-exists", { email });
      setStage(res.data?.exists ? "login" : "signup");
    } catch {
      setError("Couldn't check that email right now. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      await finish();
    } catch (err) {
      if (err.status === 403) {
        // Registered but never verified — resend the code and switch to OTP entry
        try {
          await base44.auth.resendOtp(email);
        } catch {
          // ignore resend failures; user can retry from the OTP form
        }
        setStage("otp");
      } else if (err.status === 401) {
        setError("That password doesn't match. Try again.");
      } else {
        setError(err.message || "Login failed. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await base44.auth.register({ email, password });
      setStage("otp");
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

  const changeEmail = () => {
    setStage("email");
    setPassword("");
    setError("");
  };

  if (stage === "otp") {
    return (
      <AuthShell title="Verify your email" subtitle={`We sent a 6-digit code to ${email}.`}>
        <OtpForm
          email={email}
          onVerified={async () => {
            await base44.auth.loginViaEmailPassword(email, password);
            base44.functions.invoke("send-templated-email", {}).catch(() => {});
            await finish();
          }}
        />
      </AuthShell>
    );
  }

  const title = invite
    ? stage === "email"
      ? "You've been invited 👀"
      : stage === "login"
        ? "Welcome back"
        : "Create your account"
    : stage === "login"
      ? "Welcome back"
      : stage === "signup"
        ? "Create your account"
        : "Welcome to Tackly";
  const subtitle = invite
    ? stage === "email"
      ? `You've been invited to collaborate on "${invite.title || "a Tackly board"}". Enter your email to log in or create an account.`
      : stage === "login"
        ? `Log in to join "${invite.title || "the board"}".`
        : stage === "signup"
          ? `Create your account to join "${invite.title || "the board"}" — free to start.`
          : ""
    : stage === "login"
      ? "Pick up where your thinking left off."
      : stage === "signup"
        ? "Free to start. Your first map is minutes away."
        : "Enter your email to log in or create an account.";

  return (
    <AuthShell title={title} subtitle={subtitle}>
      {stage === "email" && (
        <>
          <GoogleButton
            onClick={() =>
              base44.auth.loginWithProvider("google", window.location.origin + returnTo)
            }
          />
          <Divider />
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              autoFocus
            />
            <ErrorNote>{error}</ErrorNote>
            <SubmitButton busy={busy}>Continue with email</SubmitButton>
          </form>
        </>
      )}

      {(stage === "login" || stage === "signup") && (
        <form
          onSubmit={stage === "login" ? handleLoginSubmit : handleSignupSubmit}
          className="space-y-4"
        >
          <div className="flex items-center justify-between rounded-xl border border-line bg-paper-sunken px-3.5 py-2.5 text-sm text-ink">
            <span className="truncate">{email}</span>
            <button
              type="button"
              onClick={changeEmail}
              className="ml-2 shrink-0 font-medium text-periwinkle hover:text-periwinkle-deep"
            >
              Change
            </button>
          </div>
          <div>
            <Field
              label={stage === "login" ? "Password" : "Create a password"}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={stage === "login" ? "••••••••" : "At least 8 characters"}
              autoComplete={stage === "login" ? "current-password" : "new-password"}
              required
              autoFocus
            />
            {stage === "login" && (
              <Link
                to="/forgot-password"
                className="mt-1.5 block text-right text-xs font-medium text-periwinkle hover:text-periwinkle-deep"
              >
                Forgot password?
              </Link>
            )}
          </div>
          <ErrorNote>{error}</ErrorNote>
          <SubmitButton busy={busy}>{stage === "login" ? "Log in" : "Create account"}</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
