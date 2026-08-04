// Unit tests for logo color extraction (src/lib/logoColors.js -> suggestColorsFromPixels).
// Pure logic over an RGBA byte array; the browser canvas wrapper is not exercised here.
// Run: node --test tests/unit
import test from "node:test";
import assert from "node:assert/strict";
import { suggestColorsFromPixels } from "../../src/lib/logoColors.js";

// Build an RGBA Uint8ClampedArray of `n` pixels all set to (r,g,b,a).
const field = (n, r, g, b, a = 255) => {
  const d = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = a; }
  return d;
};
const isHex = (s) => /^#[0-9a-f]{6}$/.test(s);

test("fully transparent input yields null (nothing usable)", () => {
  assert.equal(suggestColorsFromPixels(field(64, 20, 80, 200, 0)), null);
});

test("near-white / near-black / gray are dropped -> null", () => {
  assert.equal(suggestColorsFromPixels(field(64, 250, 250, 250)), null); // near-white
  assert.equal(suggestColorsFromPixels(field(64, 3, 3, 3)), null);       // near-black
  assert.equal(suggestColorsFromPixels(field(64, 128, 128, 128)), null); // gray (low saturation)
});

test("a vivid color field returns hex primary+accent, accent carries the hue", () => {
  const res = suggestColorsFromPixels(field(256, 20, 60, 200)); // saturated blue
  assert.ok(res && isHex(res.primary) && isHex(res.accent), `got ${JSON.stringify(res)}`);
  // accent should be the blue we fed in: blue channel dominant.
  const b = parseInt(res.accent.slice(5, 7), 16);
  const r = parseInt(res.accent.slice(1, 3), 16);
  assert.ok(b > r, `accent ${res.accent} should be blue-dominant`);
});

test("primary reads darker than (or equal to) accent for a single-hue logo", () => {
  const res = suggestColorsFromPixels(field(256, 30, 90, 210));
  const lum = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), bl = parseInt(hex.slice(5, 7), 16);
    return 0.299 * r + 0.587 * g + 0.114 * bl;
  };
  assert.ok(lum(res.primary) <= lum(res.accent) + 1e-6, "primary is the ink/dark role");
});
