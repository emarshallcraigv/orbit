// Unit tests for CSV import validation (src/lib/importItems.js -> validateRows).
// Pure logic — encodes the approved rules: no implicit category/cabinet creation,
// duplicates skipped, errors excluded but don't block the rest. Run: node --test tests/unit
import test from "node:test";
import assert from "node:assert/strict";
import { validateRows } from "../../src/lib/importItems.js";

const ctx = {
  categories: [{ id: "cat-tools", name: "Tools" }],
  existingItems: [{ name: "Existing Widget", desc: "" }],
  locationNames: ["Main", "Storage"],
  cabinetsByLoc: { Main: [{ id: "cab1", label: "A1" }], Storage: [{ id: "cab2", label: "A1" }] },
};
const only = (rows, line) => rows.find((r) => r.line === line);

test("missing name is an error, excluded from import, no resolved payload", () => {
  const { rows, summary } = validateRows([{ name: "", description: "x" }], ctx);
  assert.equal(rows[0].status, "error");
  assert.equal(rows[0].resolved, null);
  assert.equal(summary.errors, 1);
  assert.equal(summary.toImport, 0);
});

test("unknown category -> warning + imported uncategorized (never auto-created)", () => {
  const { rows } = validateRows([{ name: "Thing", category: "Nonexistent" }], ctx);
  assert.equal(rows[0].status, "warning");
  assert.equal(rows[0].resolved.category_id, null);
  assert.match(rows[0].messages.join(" "), /not found/i);
});

test("known category (case-insensitive) resolves to its id", () => {
  const { rows } = validateRows([{ name: "Thing", category: "tools" }], ctx);
  assert.equal(rows[0].resolved.category_id, "cat-tools");
  assert.equal(rows[0].status, "ok");
});

test("unrecognized tracking type is an error", () => {
  const { rows } = validateRows([{ name: "Thing", tracking_type: "banana" }], ctx);
  assert.equal(rows[0].status, "error");
});

test("numeric parsing tolerates $ and thousands commas; junk is an error", () => {
  const good = validateRows([{ name: "A", unit_cost: "$1,234.50" }], ctx).rows[0];
  assert.equal(good.resolved.estimated_unit_cost, 1234.5);
  const bad = validateRows([{ name: "B", unit_cost: "abc" }], ctx).rows[0];
  assert.equal(bad.status, "error");
});

test("duplicate against the catalog is skipped", () => {
  const { rows, summary } = validateRows([{ name: "Existing Widget" }], ctx);
  assert.equal(rows[0].skip, true);
  assert.equal(summary.skipped, 1);
});

test("duplicate within the same file: first imports, second is skipped", () => {
  const { rows } = validateRows([{ name: "Dupe" }, { name: "Dupe" }], ctx);
  assert.equal(only(rows, 2).skip, false);
  assert.equal(only(rows, 3).skip, true);
});

test("cabinet unmatched at ALL locations -> warning, left unset everywhere", () => {
  const { rows } = validateRows([{ name: "Thing", cabinet: "ZZ9" }], ctx);
  assert.equal(rows[0].status, "warning");
  assert.match(rows[0].messages.join(" "), /isn't a defined label at any location/i);
});

test("cabinet matched at some locations -> warning names only the missing ones", () => {
  const partialCtx = { ...ctx, cabinetsByLoc: { Main: [{ id: "cab1", label: "A1" }], Storage: [] } };
  const { rows } = validateRows([{ name: "Thing", cabinet: "A1" }], partialCtx);
  assert.equal(rows[0].status, "warning");
  assert.match(rows[0].messages.join(" "), /Storage/);
});

test("threshold on a non-quantity item is ignored with a warning", () => {
  const { rows } = validateRows([{ name: "Thing", tracking_type: "Good/Low", threshold: "5" }], ctx);
  assert.equal(rows[0].status, "warning");
  assert.match(rows[0].messages.join(" "), /only Quantity items/i);
});

test("summary tallies total/toImport/skipped/warnings/errors", () => {
  const { summary } = validateRows([
    { name: "Ready" },                       // ok
    { name: "" },                            // error
    { name: "Existing Widget" },             // skip
    { name: "Warned", category: "Nope" },    // warning
  ], ctx);
  assert.equal(summary.total, 4);
  assert.equal(summary.errors, 1);
  assert.equal(summary.skipped, 1);
  // Both the skipped duplicate and the uncategorized row are status "warning"
  // (a skipped dup is bumped to warning too), so warnings counts 2.
  assert.equal(summary.warnings, 2);
  assert.equal(summary.toImport, 2); // Ready + Warned (skip and error excluded)
});
