import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";

/**
 * Auth + tenancy context for the multi-tenant rebuild.
 *
 * Tracks three things and keeps them in sync with Supabase Auth:
 *   - session  : the raw Supabase session (null when signed out)
 *   - profile  : the caller's row in `profiles` (id, practice_id, role, display_name)
 *   - practice : the caller's row in `practices`, once they belong to one
 *
 * `profile.practice_id` is the pivot the whole app hangs off of. A freshly
 * signed-up user has a profile (auto-created by the on_auth_user_created trigger)
 * but no practice_id yet — that's the "needs onboarding" state.
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [practice, setPractice] = useState(null);
  // Set when the member belongs to a practice whose lifecycle status is
  // suspended/offboarded: the practice row is hidden by RLS, so we hold just its
  // { name, status } (from my_practice_status) to render the frozen screen.
  const [frozen, setFrozen] = useState(null);
  // "initializing" = still resolving the very first getSession() call, so we
  // don't flash the login screen before we know whether a session exists.
  const [initializing, setInitializing] = useState(true);
  // Set when Supabase fires PASSWORD_RECOVERY (user arrived via a reset link):
  // we surface the "set a new password" screen instead of the normal app.
  const [recoveryMode, setRecoveryMode] = useState(false);

  // Load the profile row for the signed-in user, plus its practice if attached.
  const loadProfile = useCallback(async (user) => {
    if (!user) {
      setProfile(null);
      setPractice(null);
      setFrozen(null);
      return;
    }

    const { data: prof, error } = await supabase
      .from("profiles")
      .select("id, practice_id, email, display_name, role")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Failed to load profile:", error.message);
      setProfile(null);
      setPractice(null);
      setFrozen(null);
      return;
    }

    // The trigger creates the profile row asynchronously right after signup.
    // If we raced it and got nothing back, backfill a minimal local profile so
    // onboarding can still proceed (the row will exist by the time we write).
    const resolved = prof || { id: user.id, practice_id: null, email: user.email, display_name: null, role: "staff" };

    // If the profile has no display name yet but signup captured one in the
    // auth metadata, persist it now so "who did this" reads nicely everywhere.
    const metaName = user.user_metadata?.display_name;
    if (!resolved.display_name && metaName) {
      const { data: updated } = await supabase
        .from("profiles")
        .update({ display_name: metaName })
        .eq("id", user.id)
        .select("id, practice_id, email, display_name, role")
        .maybeSingle();
      if (updated) Object.assign(resolved, updated);
    }

    setProfile(resolved);

    if (resolved.practice_id) {
      const { data: prac } = await supabase
        .from("practices")
        .select("id, name, join_code, primary_color, accent_color, logo_url, logo_path, timezone")
        .eq("id", resolved.practice_id)
        .maybeSingle();
      if (prac) {
        setPractice(prac);
        setFrozen(null);
      } else {
        // The practice row is unreadable. The expected cause is the lifecycle
        // freeze (RLS hides a suspended/offboarded practice from current_practice_id).
        // Ask the narrow status helper, which returns only { name, status } for the
        // caller's own practice, and surface the frozen screen only for a real
        // frozen status (not a transient miss).
        const { data: st } = await supabase.rpc("my_practice_status");
        const row = Array.isArray(st) ? st[0] : st;
        setPractice(null);
        setFrozen(row && (row.status === "suspended" || row.status === "offboarded") ? row : null);
      }
    } else {
      setPractice(null);
      setFrozen(null);
    }
  }, []);

  // Re-fetch profile + practice on demand (e.g. right after create/join).
  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadProfile(data.session?.user ?? null);
  }, [loadProfile]);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user ?? null);
      if (active) setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!active) return;
      setSession(newSession);
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      await loadProfile(newSession?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setPractice(null);
    setFrozen(null);
    setRecoveryMode(false);
  }, []);

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    practice,
    frozen,
    initializing,
    recoveryMode,
    clearRecoveryMode: () => setRecoveryMode(false),
    refresh,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
