# 0003 — Location identity boundary: DB canonical by id, UI keyed by name

**Context:** Step 3 of the frontend rebuild moves the data layer off the
localStorage blob and onto the normalized Supabase tables. Those tables are
**id-keyed**: `checks`, `item_cabinets`, `shipment_locations`, `queue_locations`
etc. all reference `location_id` (a uuid). The app, after step 2, is
**name-keyed**: it addresses per-location data by the location's display name
(e.g. `cabinets["Main Office"]`, `keyFor("Main Office", itemId)`), which was the
deliberate scoping decision in step 2 (see the step-2 work / README) to avoid
dragging id-normalization forward before the data layer moved.

This record fixes how the two representations meet, because it shapes every
remaining slice of step 3 and would otherwise become undocumented folklore.

## Decision

**The database is the canonical, id-keyed source of truth. The in-memory / UI
layer keeps using location _names_ as stable handles. Translation between name
and `location_id` happens only in the per-entity data-access layer
(`src/lib/items.js`, and later `checks.js` / `shipments.js` / `queue.js`).**

Concretely: on load, a row's `location_id` is translated to its location name
(via the practice's `locations`) before it enters component state; on write, the
name is translated back to `location_id` before hitting Supabase. Components are
**not** re-keyed to ids.

## Why this, not fully id-keyed in memory

1. **Avoids touching every location-consuming component twice.** Going
   id-keyed in memory would mean re-threading location ids through the dashboard,
   check-in tabs, shipment split, inventory columns, cabinets, and queue toggle
   now — then editing those same components again when their data slice lands.
   Keeping names as the UI handle lets each component change exactly once, in its
   own slice.
2. **Rename-safe at the database.** Because the DB stores `location_id`, renaming
   a location never orphans its persisted data. This removes the step-2 rename
   caveat (where name-keyed _storage_ meant a rename orphaned that location's
   data) — for every entity once it has moved to Supabase.
3. **Name ↔ id is a clean bijection.** Migration 0005 enforces case-insensitive
   uniqueness of location names within a practice, so a name maps to exactly one
   `location_id` and vice versa. Without that guarantee this design would be
   unsafe; with it, it is sound.

## The live-rename edge case, and how it is handled

The narrow risk this design must answer: in-memory data is keyed by name, so what
happens in a live session (no page reload) the moment someone renames a location?
Could data sitting in memory under the old name be silently orphaned until reload?

**Answer: no — provided the reactive invariant below holds.** Each converted
entity's reload function takes `locations` and lists it as a dependency, and an
effect re-runs that reload whenever `locations` changes. A rename updates
`locations`, which reactively re-fetches the entity and re-translates its
`location_id`s to the new name. The DB never lost anything; the in-memory view
refreshes automatically.

This was verified concretely, not assumed. With an item's cabinet keyed to
"Main Office" in memory, renaming "Main Office" → "HQ" **without a page reload**:

| | Cabinet meta shown for the item |
|---|---|
| before | `Downtown Cab 7 · Main Office Cab 7` |
| after (no reload) | `Downtown Cab 7 · HQ Cab 7` |

The data followed the rename (`HQ Cab 7`, not `HQ Cab —`).

### Invariant (must hold for every entity converted in 3b–3e)

> Any data-access reload that translates `location_id` ↔ name **must** depend on
> `locations`, so a location rename re-triggers it. If a future entity is loaded
> in a way that is *not* reactively coupled to `locations`, this edge case
> reopens for that entity.

A brief refetch (sub-second) happens on rename; for an action as rare as renaming
a location this is acceptable. A side effect of the coupling: adding/reordering a
location also refetches dependent entities — a harmless, infrequent over-fetch.

## Scope / status (stated plainly)

- **Rename-safety applies only to entities already moved to Supabase.** As of
  slice 3a that is **items + item_cabinets** only.
- **Checks, shipments, and queue are still on the localStorage blob**, keyed by
  location _name_ in storage. Until their slices (3b–3e) move them to id-keyed
  Supabase storage, **they remain exposed to the step-2 rename orphaning** (a
  rename would strand their name-keyed blob entries, and there is no
  `location_id` in the blob to re-translate from). For the current test practice
  this is moot (no blob check/shipment data exists), but the exposure is real in
  principle until each slice lands.
- Once all entities are migrated, the blob and its rename-exposure are gone
  entirely.

## Alternatives considered

- **Fully id-keyed in memory.** The "canonical ids everywhere" ideal. Rejected
  for step 3 because it front-loads and duplicates UI churn (see reason 1) for no
  data-integrity benefit over this design — the DB is id-canonical either way.
- **Keep storage name-keyed.** Rejected: not normalized, doesn't match the
  schema, and is rename-unsafe at rest — the exact problem step 3 exists to fix.
