import { supabase } from "./supabase";

/**
 * Practice members (profiles) + role management.
 *
 * Reads go through the practice-scoped profiles SELECT policy (any member can see
 * who's in their practice). Role WRITES go ONLY through set_member_role (0020, a
 * SECURITY DEFINER RPC): tenants have no column privilege on profiles.role, so the
 * RPC is the sole path, and it enforces owner/admin-only + same-practice. The
 * "never zero owners" invariant is enforced by a DB trigger regardless of path.
 */

export async function fetchMembers(practiceId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, email, role")
    .eq("practice_id", practiceId)
    .order("role");
  if (error) throw error;
  return data || [];
}

// Change a member's role. Returns nothing on success; throws on failure (e.g. the
// last-owner rule, or a non-owner/admin caller) with the DB's message.
export async function setMemberRole(profileId, role) {
  const { error } = await supabase.rpc("set_member_role", { p_profile_id: profileId, p_role: role });
  if (error) throw error;
}
