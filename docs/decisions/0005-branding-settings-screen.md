# 0005 — Branding settings screen (owner-facing branding editing)

Status: **design brief only — not built.** Queued in V1 behind CSV bulk item import.

## Context

The *read/apply* side of per-practice branding is done: a practice's `logo_url`,
`primary_color`, and `accent_color` (on the `practices` row) drive the in-app logo
and palette at runtime, and an un-customized practice falls back to Baybridge's own
look (navy `#14263D` / teal `#4089A2` + Baybridge icon — see migration `0011` and
`practiceBrandCss` / `DEFAULT_LOGO_SRC` in `src/App.jsx`). What's missing is the
*edit* side: a screen where a practice owner sets those three values themselves.

## Scope

A **Branding settings** screen, reached from the drawer nav, owner-only. Three parts:

### 1. Logo upload (needs Supabase Storage)

- A Storage bucket for practice logos, with **per-practice access policies** scoped by
  `practice_id` — e.g. object path `logos/{practice_id}/...`, and Storage RLS policies
  that only let a member of that practice read/write under their own prefix.
- **Security note — treat this like any tenant-isolation change.** Storage policies can
  leak data across tenants exactly the way a bad table RLS policy can. The bucket +
  policy setup gets the same review as a schema migration (show the SQL, reason through
  the isolation, run the two-practice cross-tenant test against Storage before it goes
  near a paying customer), per the risk note in the README.
- On successful upload, write the object's URL to `practices.logo_url`.

### 2. Color pickers

- Primary + accent color pickers, saving to `practices.primary_color` /
  `practices.accent_color`.
- When a column is null (un-customized), pre-fill the picker with the Baybridge default
  (`#14263D` / `#4089A2`) so the owner sees the current effective color and edits from
  there. Saving writes the chosen hex; the app already validates hex via `safeColor()`
  before injecting it as CSS.

### 3. Auto-suggest colors from the uploaded logo

- After a logo is uploaded, sample its dominant colors **client-side** (canvas pixel
  sampling) and pre-fill the primary/accent pickers as a *suggestion*.
- Always editable / overridable — the suggestion never locks the pickers.
- **Be realistic about quality.** Extraction results vary a lot by logo: a flat
  two-color mark extracts cleanly; a photographic or gradient-heavy logo, a logo on a
  busy background, or one with near-white/near-black dominant pixels will give weak or
  wrong suggestions. Plan for "here's a starting guess, adjust it," not "we picked your
  brand colors for you." Filtering out near-white/near-black and very-low-saturation
  pixels before choosing dominants helps, but doesn't make it reliable.

## Explicitly out of scope for the first cut

- Editing another practice's branding (owner edits only their own).
- Multiple logos / dark-mode logo variants.
- Server-side image processing or color extraction (keep extraction client-side).
