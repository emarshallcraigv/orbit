// Unit tests for the dashboard hitlist ranking (src/lib/hitlist.js).
// Pure logic — no DB, no browser. Run with: node --test tests/unit
import test from "node:test";
import assert from "node:assert/strict";
import { daysBetween, scoreEntry, rankHitlist } from "../../src/lib/hitlist.js";

test("daysBetween: whole days between two YYYY-MM-DD strings", () => {
  assert.equal(daysBetween("2026-08-01", "2026-08-04"), 3);
  assert.equal(daysBetween("2026-08-04", "2026-08-04"), 0);
});

test("daysBetween: never negative, and 0 on unparseable input", () => {
  assert.equal(daysBetween("2026-08-10", "2026-08-04"), 0); // reversed -> clamped
  assert.equal(daysBetween("not-a-date", "2026-08-04"), 0);
  assert.equal(daysBetween(null, undefined), 0);
});

test("scoreEntry: order outranks transfer outranks receive at equal age", () => {
  const order = scoreEntry({ type: "order", severity01: 0, ageDays: 0 });
  const transfer = scoreEntry({ type: "transfer", ageDays: 0 });
  const receive = scoreEntry({ type: "receive", ageDays: 0 });
  assert.ok(order > transfer, `order ${order} > transfer ${transfer}`);
  assert.ok(transfer > receive, `transfer ${transfer} > receive ${receive}`);
  assert.equal(scoreEntry({ type: "mystery" }), 0);
});

test("scoreEntry: higher severity and age raise an order's score, but age caps", () => {
  const low = scoreEntry({ type: "order", severity01: 0, ageDays: 0 });
  const high = scoreEntry({ type: "order", severity01: 1, ageDays: 0 });
  assert.ok(high > low, "severity 1 beats severity 0");
  const capped = scoreEntry({ type: "order", severity01: 1, ageDays: 1000 });
  const alsoCapped = scoreEntry({ type: "order", severity01: 1, ageDays: 2000 });
  assert.equal(capped, alsoCapped, "age contribution is capped");
});

test("rankHitlist: attaches score and sorts most-urgent first", () => {
  const ranked = rankHitlist([
    { type: "receive", ageDays: 0, itemName: "Gauze" },
    { type: "order", severity01: 1, ageDays: 3, itemName: "Gloves" },
    { type: "transfer", ageDays: 1, itemName: "Masks" },
  ]);
  assert.deepEqual(ranked.map((r) => r.itemName), ["Gloves", "Masks", "Gauze"]);
  assert.ok(ranked.every((r) => typeof r.score === "number"));
  assert.ok(ranked[0].score >= ranked[1].score && ranked[1].score >= ranked[2].score);
});

test("rankHitlist: deterministic tiebreak by name when scores and age tie", () => {
  const ranked = rankHitlist([
    { type: "receive", ageDays: 0, itemName: "Zinc" },
    { type: "receive", ageDays: 0, itemName: "Alcohol" },
  ]);
  assert.deepEqual(ranked.map((r) => r.itemName), ["Alcohol", "Zinc"]);
});
