# 0004 — Cross-location rebalancing suggestions (design brief, not yet built)

**Status:** recorded for later, not being built now. This captures the intended design
so it isn't re-derived from scratch when it reaches the build queue (last item in the
V1 near-term order; see ROADMAP.md).

**Idea:** when an item is low at one location but another location holds *excess* of the
same item, suggest **pulling stock from the excess location** (a transfer) instead of
ordering more. Less spend, less waste.

## Data

- **`items.max_level`** — nullable numeric. Only meaningful for **Quantity-tracked**
  items. When set, it's the "full/target" level for a location. **Must exceed
  `threshold`** (the reorder point) — enforce with a `CHECK` (or a trigger, since the
  comparison is against another column) so `max_level > threshold` when both are set.
  A `good_low` item has no numeric levels, so no `max_level`.

## Detection

- A **Postgres view or function** compares each location's **live stock** (the same
  computation the app's `liveStock` does: last count + received-since via shipments +
  transfers) against `threshold` and `max_level`:
  - a location is **short** if live stock ≤ `threshold`;
  - a location has **excess** if live stock is comfortably above `max_level` (exact
    band TBD — e.g. stock − max_level ≥ the shortfall elsewhere).
- Keep this in the database (consistent with the "business logic in Postgres" principle)
  so the API layer and any future client get the same rebalancing signal.

## UX

- A **"rebalancing available"** callout on the relevant queue entry: instead of only
  "order N", surface "N available to pull from <location>".
- A new queue status **`Transferred`** (added to the `queue_entries.status` check
  constraint) that, when chosen, opens an **inline multi-location picker** (which
  excess location(s) to pull from, how much from each) and, on confirm, **atomically
  creates the transfer(s) AND resolves the queue entry** — the same RPC pattern as
  `create_shipment_from_queue` (one security-invoker function, one transaction, so the
  transfers and the queue-entry resolution can never half-complete). Call it e.g.
  `rebalance_from_queue(queue_entry_id, [{from_location_id, qty}], to_location_id)`.

## Notes / open questions for build time

- Migration adds `items.max_level` + the `max_level > threshold` guard, the
  `Transferred` status value, the detection view/function, and the rebalance RPC (revoke
  from public + grant to authenticated, search_path pinned — same posture as 0007).
- The transfers created here are location→location like receive-driven transfers, so
  they flow through the existing Transfers screen / confirm path.
- Exact "excess" band and whether to auto-suggest vs require opt-in are UX decisions to
  settle when this is actually planned.
