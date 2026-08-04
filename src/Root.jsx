import React from "react";
import { AuthProvider, useAuth } from "./lib/auth";
import { AuthFlow, ResetPassword, Onboarding, FrozenScreen } from "./AuthScreens";
import { MainApp } from "./App.jsx";

/**
 * Top-level gate. Decides, based on auth + tenancy state, which of four things
 * to render:
 *   1. a brief loading state while the first session lookup resolves
 *   2. the "set a new password" screen (arrived via a recovery link)
 *   3. the signed-out auth flow (sign in / sign up / forgot password)
 *   4. onboarding (signed in, but not attached to a practice yet)
 *   5. the app itself (signed in AND belongs to a practice)
 */
function Gate() {
  const { initializing, recoveryMode, session, profile, practice, frozen, signOut, refresh } = useAuth();

  if (initializing) {
    return (
      <div style={loadingStyle}>
        <div className="root-spinner" />
        <style>{SPINNER_CSS}</style>
      </div>
    );
  }

  // A password-recovery link takes priority over everything else.
  if (recoveryMode) return <ResetPassword />;

  // Not signed in → sign in / sign up / forgot password.
  if (!session) return <AuthFlow />;

  // Signed in but the profile row hasn't loaded yet.
  if (!profile) {
    return (
      <div style={loadingStyle}>
        <div className="root-spinner" />
        <style>{SPINNER_CSS}</style>
      </div>
    );
  }

  // Signed in but not attached to a practice → create or join one.
  if (!profile.practice_id) return <Onboarding />;

  // Attached to a practice whose lifecycle status is suspended/offboarded → the
  // practice row is frozen by RLS; show the frozen screen instead of the app.
  if (frozen) return <FrozenScreen status={frozen.status} name={frozen.name} onSignOut={signOut} />;

  // Attached to a practice but its row hasn't resolved yet (transient) — hold on
  // a spinner rather than rendering the app with a null practice.
  if (!practice) {
    return (
      <div style={loadingStyle}>
        <div className="root-spinner" />
        <style>{SPINNER_CSS}</style>
      </div>
    );
  }

  // Fully onboarded → the actual app.
  return <MainApp profile={profile} practice={practice} onSignOut={signOut} onPracticeRefresh={refresh} />;
}

const loadingStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#F5F7FA",
};

const SPINNER_CSS = `
.root-spinner { width: 30px; height: 30px; border: 3px solid #E1E6EE; border-top-color: #14263D; border-radius: 50%; animation: root-spin 0.8s linear infinite; }
@keyframes root-spin { to { transform: rotate(360deg); } }
`;

export default function Root() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
