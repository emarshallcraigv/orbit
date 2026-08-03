/**
 * Dashboard hitlist ranking (step: dashboard-as-hitlist).
 *
 * A single urgency score per actionable row, so the three record types
 * interleave by urgency rather than being grouped by category:
 *   - order   (a pending queue entry)         needs a decision / order placed
 *   - transfer(a pending transfer)            confirm it arrived
 *   - receive (an Ordered, un-received order) receive it when it lands
 *
 * Score = category base + severity + age. Constants are deliberately isolated
 * here as tunable knobs; the functions are pure so they can be unit-tested and
 * adjusted against real data. IMPORTANT: the score is INTERNAL — it is never
 * shown to a user, only expressed through accent color and list position.
 */

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Whole days between two YYYY-MM-DD strings (parsed as local dates), >= 0.
export function daysBetween(fromDate, toDate) {
  const p = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const a = p(fromDate), b = p(toDate);
  if (!a || !b) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

// entry: { type, severity01?, ageDays } -> numeric urgency (higher = more urgent)
export function scoreEntry(entry) {
  const age = entry.ageDays || 0;
  switch (entry.type) {
    case "order":    return 50 + clamp(entry.severity01 || 0, 0, 1) * 40 + Math.min(age * 2, 20);
    case "transfer": return 40 + Math.min(age * 2.5, 30);
    case "receive":  return 25 + Math.min(age * 1.8, 40);
    default:         return 0;
  }
}

// Attach scores and sort most-urgent-first (stable-ish tiebreak by age then name).
export function rankHitlist(entries) {
  return entries
    .map((e) => ({ ...e, score: scoreEntry(e) }))
    .sort((a, b) => b.score - a.score || (b.ageDays || 0) - (a.ageDays || 0) || String(a.itemName).localeCompare(String(b.itemName)));
}
