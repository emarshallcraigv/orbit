import React, { useState } from "react";
import { supabase } from "./lib/supabase";
import { useAuth } from "./lib/auth";

// Signed-out screens are Baybridge-branded (the platform), not any one
// practice's brand — nobody is inside a specific tenant yet at this point.
const BAYBRIDGE_LOGO = "/baybridge-logo-wide.png";

/* ------------------------------------------------------------------ */
/* Shared shell                                                        */
/* ------------------------------------------------------------------ */
function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="auth-root">
      <style>{AUTH_STYLES}</style>
      <div className="auth-card">
        <div className="auth-brand">
          <img src={BAYBRIDGE_LOGO} alt="Baybridge" className="auth-logo" />
        </div>
        <h1 className="auth-title">{title}</h1>
        {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        {children}
      </div>
      {footer && <div className="auth-footer">{footer}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Frozen practice (suspended / offboarded)                            */
/* Shown when the member is attached to a practice whose lifecycle      */
/* status is suspended/offboarded — the practice row itself is frozen   */
/* by RLS, so we only ever have its name + status (my_practice_status). */
/* ------------------------------------------------------------------ */
export function FrozenScreen({ status, name, onSignOut }) {
  const suspended = status === "suspended";
  const who = name || "This practice";
  return (
    <AuthShell
      title={suspended ? "Practice suspended" : "Practice closed"}
      subtitle={
        suspended
          ? `${who} is currently suspended. Please contact Baybridge support to restore access.`
          : `${who} has been closed. If you believe this is a mistake, contact Baybridge support.`
      }
      footer={<button className="auth-link" onClick={onSignOut}>Sign out</button>}
    >
      <p className="auth-hint">Your account itself is fine — this only affects access to {who}.</p>
    </AuthShell>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="auth-field">
      <span className="auth-label">{label}</span>
      <input className="auth-input" {...props} />
    </label>
  );
}

function ErrorNote({ children }) {
  if (!children) return null;
  return <div className="auth-error">{children}</div>;
}

function OkNote({ children }) {
  if (!children) return null;
  return <div className="auth-ok">{children}</div>;
}

// supabase-js surfaces opaque 5xx auth responses with a useless message
// (literally "{}" for a 500), and network failures with a bare fetch error.
// Translate those into something a human can act on.
function friendlyError(error, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  const msg = typeof error.message === "string" ? error.message.trim() : "";
  const opaque = !msg || msg === "{}" || msg === "[object Object]";
  if (error.status >= 500 || opaque) {
    return error.status
      ? `The server returned an error (${error.status}). Please try again in a moment.`
      : "Couldn't reach the server. Check your connection and try again.";
  }
  return msg;
}

/* ------------------------------------------------------------------ */
/* Top-level flow for signed-OUT users                                 */
/* ------------------------------------------------------------------ */
export function AuthFlow() {
  const [mode, setMode] = useState("signin"); // signin | signup | forgot
  if (mode === "signup") return <SignUp onSwitch={setMode} />;
  if (mode === "forgot") return <ForgotPassword onSwitch={setMode} />;
  return <SignIn onSwitch={setMode} />;
}

/* ------------------------------------------------------------------ */
/* Sign in                                                             */
/* ------------------------------------------------------------------ */
function SignIn({ onSwitch }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(friendlyError(error));
    // On success, the auth listener in AuthProvider takes over and re-renders.
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back."
      footer={<>New here? <button className="auth-link" onClick={() => onSwitch("signup")}>Create an account</button></>}
    >
      <form onSubmit={submit} className="auth-form">
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <ErrorNote>{err}</ErrorNote>
        <button className="auth-btn" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <button type="button" className="auth-link auth-link-quiet" onClick={() => onSwitch("forgot")}>Forgot your password?</button>
      </form>
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ */
/* Sign up                                                             */
/* ------------------------------------------------------------------ */
function SignUp({ onSwitch }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (password.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: name.trim() },
        emailRedirectTo: window.location.origin,
      },
    });
    setBusy(false);
    if (error) {
      setErr(friendlyError(error));
      return;
    }
    // If the project requires email confirmation, there's no session yet.
    if (!data.session) {
      setCheckEmail(true);
    }
    // If a session came back, the auth listener advances us to onboarding.
  }

  if (checkEmail) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={`We sent a confirmation link to ${email.trim()}. Click it to activate your account, then sign in.`}
        footer={<button className="auth-link" onClick={() => onSwitch("signin")}>Back to sign in</button>}
      >
        <OkNote>Didn't get it? Check spam, or wait a minute and try signing in.</OkNote>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="One login per staff member — you'll set up or join a practice next."
      footer={<>Already have an account? <button className="auth-link" onClick={() => onSwitch("signin")}>Sign in</button></>}
    >
      <form onSubmit={submit} className="auth-form">
        <Field label="Your name" type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Password" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        <ErrorNote>{err}</ErrorNote>
        <button className="auth-btn" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
      </form>
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ */
/* Forgot password — send the reset email                              */
/* ------------------------------------------------------------------ */
function ForgotPassword({ onSwitch }) {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    if (error) setErr(friendlyError(error));
    else setSent(true);
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={`If an account exists for ${email.trim()}, a password reset link is on its way.`}
        footer={<button className="auth-link" onClick={() => onSwitch("signin")}>Back to sign in</button>}
      />
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
      footer={<button className="auth-link" onClick={() => onSwitch("signin")}>Back to sign in</button>}
    >
      <form onSubmit={submit} className="auth-form">
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <ErrorNote>{err}</ErrorNote>
        <button className="auth-btn" type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
      </form>
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ */
/* Reset password — shown after the user follows the recovery link     */
/* ------------------------------------------------------------------ */
export function ResetPassword() {
  const { clearRecoveryMode, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (password.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords don't match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setErr(friendlyError(error));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <AuthShell
        title="Password updated"
        subtitle="You're all set. You can continue to the app."
      >
        <button className="auth-btn" onClick={clearRecoveryMode}>Continue</button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a new password for your account."
      footer={<button className="auth-link" onClick={() => { clearRecoveryMode(); signOut(); }}>Cancel</button>}
    >
      <form onSubmit={submit} className="auth-form">
        <Field label="New password" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field label="Confirm new password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <ErrorNote>{err}</ErrorNote>
        <button className="auth-btn" type="submit" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
      </form>
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ */
/* Onboarding — signed in, but not attached to a practice yet          */
/* ------------------------------------------------------------------ */
function generateJoinCode() {
  // Unambiguous uppercase alphabet (no 0/O/1/I) so codes read cleanly aloud.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[bytes[i] % alphabet.length];
  return code;
}

export function Onboarding() {
  const { profile, refresh, signOut } = useAuth();
  const [tab, setTab] = useState("create"); // create | join

  return (
    <div className="auth-root">
      <style>{AUTH_STYLES}</style>
      <div className="auth-card auth-card-wide">
        <div className="auth-brand">
          <img src={BAYBRIDGE_LOGO} alt="Baybridge" className="auth-logo" />
        </div>
        <h1 className="auth-title">Get started</h1>
        <p className="auth-subtitle">
          {profile?.display_name ? `Hi ${profile.display_name}. ` : ""}
          Create a new practice, or join one your team already set up.
        </p>

        <div className="auth-tabs">
          <button className={"auth-tab" + (tab === "create" ? " auth-tab-active" : "")} onClick={() => setTab("create")}>Create a practice</button>
          <button className={"auth-tab" + (tab === "join" ? " auth-tab-active" : "")} onClick={() => setTab("join")}>Join with a code</button>
        </div>

        {tab === "create" ? <CreatePractice onDone={refresh} /> : <JoinPractice onDone={refresh} />}
      </div>
      <div className="auth-footer">
        Signed in as {profile?.email}. <button className="auth-link" onClick={signOut}>Sign out</button>
      </div>
    </div>
  );
}

function CreatePractice({ onDone }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);

    // Retry a few times in case a generated join code collides with the
    // unique constraint — vanishingly unlikely, but cheap to guard against.
    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase.rpc("create_practice_for_new_user", {
        practice_name: name.trim(),
        join_code: generateJoinCode(),
      });
      if (!error) {
        await onDone();
        return;
      }
      lastError = error;
      const dup = error.code === "23505" || /duplicate|unique/i.test(error.message || "");
      if (!dup) break;
    }
    setBusy(false);
    setErr(friendlyError(lastError, "Could not create the practice. Please try again."));
  }

  return (
    <form onSubmit={submit} className="auth-form">
      <Field label="Practice name" type="text" required placeholder="e.g. Mann Orthodontics" value={name} onChange={(e) => setName(e.target.value)} />
      <p className="auth-hint">You'll be the owner. A join code is generated automatically — share it with your staff so they can join.</p>
      <ErrorNote>{err}</ErrorNote>
      <button className="auth-btn" type="submit" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create practice"}</button>
    </form>
  );
}

function JoinPractice({ onDone }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await supabase.rpc("join_practice_by_code", { code: code.trim() });
    setBusy(false);
    if (error) {
      setErr(friendlyError(error));
      return;
    }
    await onDone();
  }

  return (
    <form onSubmit={submit} className="auth-form">
      <Field
        label="Join code"
        type="text"
        required
        autoCapitalize="characters"
        placeholder="6-character code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        style={{ textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "ui-monospace, Menlo, monospace" }}
      />
      <p className="auth-hint">Ask the practice owner for the join code. You'll join as staff.</p>
      <ErrorNote>{err}</ErrorNote>
      <button className="auth-btn" type="submit" disabled={busy || !code.trim()}>{busy ? "Joining…" : "Join practice"}</button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Styles — self-contained so these screens render before the app      */
/* ------------------------------------------------------------------ */
const AUTH_STYLES = `
:root {
  /* Baybridge platform palette: navy + teal */
  --ink: #14263D; --ink-2: #4089A2; --ink-soft: #66738F;
  --paper: #F5F7FA; --card: #FFFFFF; --line: #E1E6EE;
  --reorder: #C0392B; --reorder-bg: #FBE6E3;
  --good: #4C8A3F; --good-bg: #E9F2E2;
}
* { box-sizing: border-box; }
.auth-root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  min-height: 100vh; background: var(--paper); color: var(--ink);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 24px 16px; gap: 16px;
}
.auth-card {
  width: 100%; max-width: 380px; background: var(--card);
  border: 1px solid var(--line); border-radius: 16px; padding: 28px 24px;
  box-shadow: 0 8px 30px rgba(20,38,61,0.10);
}
.auth-card-wide { max-width: 440px; }
.auth-brand { display: flex; align-items: center; margin-bottom: 26px; }
.auth-logo { height: 64px; width: auto; max-width: 300px; display: block; }
.auth-title { font-size: 21px; font-weight: 700; margin: 0 0 6px; letter-spacing: -0.01em; }
.auth-subtitle { font-size: 13.5px; color: var(--ink-soft); margin: 0 0 20px; line-height: 1.45; }
.auth-form { display: flex; flex-direction: column; gap: 14px; }
.auth-field { display: flex; flex-direction: column; gap: 5px; }
.auth-label { font-size: 12px; font-weight: 600; color: var(--ink-soft); }
.auth-input {
  border: 1px solid var(--line); border-radius: 9px; padding: 11px 12px; font-size: 15px;
  background: var(--card); color: var(--ink); font-family: inherit; width: 100%;
}
.auth-input:focus { outline: none; border-color: var(--ink-2); box-shadow: 0 0 0 3px rgba(64,137,162,0.18); }
.auth-btn {
  border: none; border-radius: 10px; background: var(--ink); color: #fff;
  font-weight: 600; font-size: 15px; padding: 12px 16px; cursor: pointer;
  font-family: inherit; transition: opacity 0.15s; margin-top: 2px;
}
.auth-btn:hover:not(:disabled) { opacity: 0.9; }
.auth-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.auth-link {
  background: none; border: none; color: var(--ink-2); font-weight: 600;
  cursor: pointer; font-size: inherit; font-family: inherit; padding: 0; text-decoration: none;
}
.auth-link:hover { text-decoration: underline; }
.auth-link-quiet { color: var(--ink-soft); font-weight: 500; font-size: 12.5px; text-align: center; margin-top: 2px; }
.auth-footer { font-size: 13px; color: var(--ink-soft); text-align: center; }
.auth-error { background: var(--reorder-bg); color: var(--reorder); font-size: 12.5px; padding: 9px 11px; border-radius: 8px; line-height: 1.4; }
.auth-ok { background: var(--good-bg); color: var(--good); font-size: 12.5px; padding: 9px 11px; border-radius: 8px; line-height: 1.4; }
.auth-hint { font-size: 12px; color: var(--ink-soft); margin: -4px 0 0; line-height: 1.45; }
.auth-tabs { display: flex; gap: 6px; margin-bottom: 18px; background: var(--paper); padding: 4px; border-radius: 10px; }
.auth-tab {
  flex: 1; border: none; background: transparent; border-radius: 7px; padding: 9px 8px;
  font-size: 13px; font-weight: 600; color: var(--ink-soft); cursor: pointer; font-family: inherit;
}
.auth-tab-active { background: var(--card); color: var(--ink); box-shadow: 0 1px 4px rgba(20,38,61,0.12); }
`;
