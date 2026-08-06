# UI / UX Guidelines

The design system already implemented in `App.jsx` (the `STYLES` block) and
`AuthScreens.jsx`. New UI should reuse these tokens and patterns rather than
inventing parallel ones.

## Color: semantic status vs. brand

Two independent color systems, deliberately kept separate:

- **Status tokens** communicate state and never change per practice:
  - `--good` / `--good-bg` (green) — OK / Received / in-stock
  - `--low` / `--low-bg` (amber) — Low / partial / warning
  - `--reorder` / `--reorder-bg` (red) — Need to Order / stockout / danger
  - Applied consistently as a **left-accent + tint** on rows/cards (location cards,
    dashboard hitlist rows) and as pill **badges** (`statusColor`/`statusBg`).
- **Brand tokens** are per-practice and injected at runtime:
  - `--ink` (primary) — headings, dark buttons, nav-active. Platform default
    Baybridge navy `#14263D`.
  - `--brand-green` (accent) — primary CTAs, header underline. Platform default
    Baybridge teal `#4089A2`.
  - A practice's `primary_color`/`accent_color` override these via
    `practiceBrandCss()`; `null` = the platform default. **Never hardcode a brand
    color in a component** — use the variable so per-practice theming flows through.

## Icons

A single inline-SVG `Icon` component (no icon-font dependency), stroke-based,
`currentColor` so it inherits severity/brand color. Nav icons (dashboard, check-in,
shipments, queue) and hitlist type glyphs (order/receive/transfer) come from it.
Add new glyphs to that component rather than importing a library.

## Button hierarchy

- **Primary** (`.btn-primary`, `.btn-tiny`, `.btn-accent`) — solid in the
  practice's accent color; the main action on a screen. One per context.
- **Secondary** (`.btn-secondary`) — bordered/neutral; supporting actions.
- **Danger** (`.btn-danger`) — red-bordered; destructive actions, solid-red on
  hover.
- Two-class specificity (`.btn.btn-secondary`) is used so size modifiers
  (`.btn-tiny`) don't override color. All interactive controls have hover/focus
  states; form controls have a themeable focus ring (`color-mix` on `--ink`).

## Filtering lists

Longer record lists (Ordering Queue, Shipments) use a consistent **FilterBar**: a
row of labeled dropdowns that each default to an "All …" option, built from the
`FilterSelect` / `FilterBar` components in `App.jsx`.

- **Dropdowns for open-ended dimensions** (Location, Distributor) — options are
  derived from what's actually present in the data, so a filter never offers a value
  that matches nothing. **Chips** stay reserved for a small fixed set (order
  status: All / Ordered / Received …).
- A **"Clear filters"** button appears only when a filter is active.
- The count pill reflects filtering — e.g. `1 of 4 pending` — and a filtered-empty
  list says "No … match these filters," distinct from the truly-empty state.
- The Queue additionally **groups pending items by distributor** with a per-group
  select-all, so a whole distributor's order can be actioned together (bulk
  "Mark as Ordered").

Reuse `FilterBar`/`FilterSelect` rather than hand-rolling per-screen filters.

## Layout & interaction patterns

- **Dashboard is a hitlist**, not a set of static cards: order / transfer / receive
  candidates interleaved by an internal urgency score (`lib/hitlist.js`) and shown
  by accent color + list position. **The score is never displayed as a number** —
  only as color and ordering.
- **Inline editors expand under a row** for secondary per-entity settings
  (per-location Address editor, per-location Cabinets editor) rather than separate
  pages.
- **Managed-list pickers, not free text**, wherever drift is a risk: category and
  cabinet assignment are dropdowns of the practice's/location's own managed list.
- **Bottom nav** for the four primary flows; a **drawer** ("More") for management
  screens (Locations, Categories, Distributors, Manage items, Settings — the last
  owner/admin-only; holds branding + time zone). A persistent top-right account menu.
- **"Powered by Baybridge"** strip persists inside every practice; auth/onboarding
  screens are Baybridge-branded (the platform), a practice's own screens are its
  branding.

## Copy & tone (UI microcopy)

- Plain, calm, non-jargon. State what happened ("Added 3 to Storage",
  "3 items imported") and what a control does.
- Warnings are specific, not generic: "Cabinet 'X' isn't a defined label at any
  location — left unset," not "invalid row."
- Empty states guide the next action rather than just saying "nothing here."

See also: [`BRAND_GUIDELINES.md`](BRAND_GUIDELINES.md) for voice/mission,
[`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md) for the theming mechanism.
