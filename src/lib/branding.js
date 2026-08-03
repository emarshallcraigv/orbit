import { supabase } from "./supabase";

/**
 * Practice logo storage (Branding, slice 1). Backed by the private
 * `practice-logos` bucket + per-practice policies from migration 0013.
 *
 * Objects live at `{practice_id}/logo-<ts>.<ext>` — the practice_id is the first
 * path segment every storage policy scopes on. The bucket is private, so a logo
 * is rendered via a short-lived SIGNED url (createSignedUrl), which itself goes
 * through the read policy. practices.logo_path holds the object path; the header
 * resolves signed(logo_path) -> logo_url -> Baybridge default.
 *
 * Writes here (upload/remove) also update practices.logo_path, which the
 * practices UPDATE policy already gates to owner/admin — so a non-owner is
 * blocked by RLS on both the object and the pointer, independent of the UI.
 */

const BUCKET = "practice-logos";
export const LOGO_MAX_BYTES = 2 * 1024 * 1024; // matches the bucket's 2 MB cap
export const LOGO_MIME = ["image/png", "image/jpeg", "image/webp"];
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

// Upload a new logo, point practices.logo_path at it, and delete the previous
// object. Timestamped filename (not a fixed path) so a replacement can't be
// served stale from the CDN. Returns the new object path.
export async function uploadLogo(practiceId, file, oldPath) {
  if (!LOGO_MIME.includes(file.type)) throw new Error("Logo must be a PNG, JPG, or WebP image.");
  if (file.size > LOGO_MAX_BYTES) throw new Error("Logo must be under 2 MB.");

  const path = `${practiceId}/logo-${Date.now()}.${EXT[file.type] || "png"}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;

  const { error: dbErr } = await supabase.from("practices").update({ logo_path: path }).eq("id", practiceId);
  if (dbErr) {
    // Don't leave an orphaned object if the pointer update was rejected (e.g. RLS).
    await supabase.storage.from(BUCKET).remove([path]);
    throw dbErr;
  }

  if (oldPath && oldPath !== path) {
    await supabase.storage.from(BUCKET).remove([oldPath]); // best-effort cleanup of the previous logo
  }
  return path;
}

// A short-lived signed url for rendering the logo, or null if there's no path
// or signing is refused (RLS / missing object).
export async function signedLogoUrl(path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl || null;
}

// Save the practice's brand colors. Pass hex strings to customize, or null to
// clear a column back to the Baybridge platform default. The practices UPDATE
// policy gates this to owner/admin (same as the logo pointer).
export async function saveColors(practiceId, primaryColor, accentColor) {
  const { error } = await supabase
    .from("practices")
    .update({ primary_color: primaryColor, accent_color: accentColor })
    .eq("id", practiceId);
  if (error) throw error;
}

// Clear the practice's logo: null the pointer, then delete the object.
export async function removeLogo(practiceId, path) {
  const { error: dbErr } = await supabase.from("practices").update({ logo_path: null }).eq("id", practiceId);
  if (dbErr) throw dbErr;
  if (path) await supabase.storage.from(BUCKET).remove([path]); // best-effort
}
