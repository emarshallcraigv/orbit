import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { fetchLocations, createLocation, renameLocation, deleteLocation, saveLocationOrder, saveLocationAddresses, nameTaken } from "./lib/locations";
import { fetchItems, createItem, updateItem, deleteItem, bulkImportItems } from "./lib/items";
import { parseCsv, buildPayload, templateCsv } from "./lib/importItems";
import { uploadLogo, signedLogoUrl, removeLogo, saveColors, savePracticeTimezone, downloadLogoBlobUrl } from "./lib/branding";
import { suggestColorsFromImageUrl } from "./lib/logoColors";
import { fetchDistributors, createDistributor, updateDistributor, deleteDistributor } from "./lib/distributors";
import { fetchMembers, setMemberRole } from "./lib/members";
import { fetchShipments, createShipment, updateShipmentSplit, receiveShipment } from "./lib/shipments";
import { fetchTransfers, confirmTransfer } from "./lib/transfers";
import { fetchCategories, createCategory, renameCategory, deleteCategory, saveCategoryOrder, nameTaken as categoryNameTaken } from "./lib/categories";
import { fetchLocationCabinets, addCabinet, renameCabinet, deleteCabinet, copyCabinets, cabinetLabelTaken } from "./lib/locationCabinets";
import { fetchQueue, flagQueueLocation, updateQueueFields, setQueueLocations, orderQueueEntry, practiceToday } from "./lib/queue";
import { fetchChecks, saveCheck } from "./lib/checks";
import { rankHitlist, daysBetween } from "./lib/hitlist";

/* ============================== BRAND ============================== */
// Baybridge's own icon is the platform default logo: shown on the loading screen
// and as the header fallback for any practice that hasn't set its own logo_url.
// A real tenant's logo comes from practices.logo_url — including Mann's, whose
// row now stores /logo.jpg, so no practice depends on this fallback for identity.
const DEFAULT_LOGO_SRC = "/baybridge-icon-512.png";

// Baybridge platform default colors (must match the stylesheet :root). Used to
// pre-fill the branding pickers when a practice hasn't set its own — so the
// owner edits from the current effective color, per docs/decisions/0005.
const BAYBRIDGE_PRIMARY = "#14263D";
const BAYBRIDGE_ACCENT = "#4089A2";

// Practice timezone options (IANA names). Drives practice_today() + every date.
// US-first for the initial market; extend as other regions onboard.
const TIMEZONES = [
  ["America/New_York", "Eastern — New York"],
  ["America/Chicago", "Central — Chicago"],
  ["America/Denver", "Mountain — Denver"],
  ["America/Phoenix", "Mountain (no DST) — Phoenix"],
  ["America/Los_Angeles", "Pacific — Los Angeles"],
  ["America/Anchorage", "Alaska — Anchorage"],
  ["Pacific/Honolulu", "Hawaii — Honolulu"],
];

/* ============================== SEED DATA ============================== */
// Locations are no longer a hardcoded constant — they come from the practice's
// own `locations` table (loaded in MainApp) and are threaded down as a `locations`
// prop (an array of names). See docs step 2. Anything that used to iterate the old
// LOCATIONS array now iterates that prop, so a practice works with 1 or 20 offices.

// A shipment's per-location quantity, from its `split` map (keyed by location
// name). Every shipment now comes from Supabase with a split (shipment_locations),
// so this is the only shape — the old blob-era fixed-column fallback is gone.
function shipQty(shipment, location) {
  return Number(shipment.split ? shipment.split[location] : 0) || 0;
}

// Splits a total quantity as evenly as possible across the given locations, keeping
// the parts summing exactly to the total. The leftover from integer division is
// handed out one-per-location by original order (largest-remainder), so e.g. 10
// across 3 locations -> [4, 3, 3]. Replaces the old Mann-specific weighting.
function evenSplit(total, locations) {
  const splitByLoc = {};
  const n = locations.length;
  if (n === 0) return splitByLoc;
  const base = Math.floor(total / n);
  let remainder = total - base * n;
  locations.forEach((loc) => {
    splitByLoc[loc] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  });
  return splitByLoc;
}

/* ============================== HELPERS ============================== */
function keyFor(location, itemId) { return location + "::" + itemId; }

function todayISO() { return new Date().toISOString().slice(0, 10); }

function fmtDate(d) {
  if (!d) return "—";
  // A date-only string (YYYY-MM-DD) is already the intended calendar date (dates
  // are stored in the practice's timezone). Parse it as LOCAL, not UTC, so the
  // browser's timezone can't shift it back a day on display.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d));
  const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Compact date (M/D/YY) for dense cells like the inventory freshness stamp.
function fmtDateShort(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ""));
  if (!m) return "";
  return Number(m[2]) + "/" + Number(m[3]) + "/" + m[1].slice(2);
}

function suggestedStatus(item, count) {
  if (item.type !== "Quantity") return null;
  if (count === "" || count === null || count === undefined || isNaN(count)) return null;
  const c = Number(count);
  const t = item.threshold || 0;
  if (c <= t) return "Need to Order";
  if (c <= t * 1.5) return "Low";
  return "Good";
}

function effectiveStatus(item, check) {
  if (!check) return null;
  if (item.type === "Quantity") return suggestedStatus(item, check.count);
  return check.status || null;
}

function receivedSince(shipments, transfers, itemId, location, sinceDate) {
  // Direct credit: shipments that landed at this location - either because this
  // location IS the ship-to address, or (for older records with no ship-to set)
  // because we fall back to the old "goes straight to each location" behavior.
  const direct = shipments
    .filter((s) => s.itemId === itemId && s.status === "Received" && s.dateReceived &&
      (!sinceDate || s.dateReceived > sinceDate) &&
      (!s.shipTo || s.shipTo === location))
    .reduce((sum, s) => sum + shipQty(s, location), 0);
  // Transferred credit: portions that arrived somewhere else first and have since
  // been confirmed as physically moved to this location.
  const transferred = (transfers || [])
    .filter((t) => t.itemId === itemId && t.toLocation === location && t.status === "Received" && t.dateReceived &&
      (!sinceDate || t.dateReceived > sinceDate))
    .reduce((sum, t) => sum + (Number(t.qty) || 0), 0);
  return direct + transferred;
}

function liveStock(item, location, checks, shipments, transfers) {
  const check = checks[keyFor(location, item.id)];
  const lastCount = check && check.count !== "" && check.count !== undefined ? Number(check.count) : 0;
  const lastDate = check ? check.date : null;
  const rec = receivedSince(shipments, transfers, item.id, location, lastDate);
  return lastCount + rec;
}

// When did THIS location's live count last change? The most recent of: its last
// check, or a shipment/transfer that credited this location AFTER that check
// (i.e. the same events that make up liveStock). Per-location on purpose — a
// per-row "most recent across locations" would mask a stale location behind a
// fresh one. Returns a YYYY-MM-DD string, or null if nothing has ever set it.
function liveStockUpdatedAt(item, location, checks, shipments, transfers) {
  const check = checks[keyFor(location, item.id)];
  const checkDate = check ? check.date : null;
  const shipDates = shipments
    .filter((s) => s.itemId === item.id && s.status === "Received" && s.dateReceived &&
      (!s.shipTo || s.shipTo === location) && (!checkDate || s.dateReceived > checkDate) &&
      shipQty(s, location) > 0)
    .map((s) => s.dateReceived);
  const transferDates = (transfers || [])
    .filter((t) => t.itemId === item.id && t.toLocation === location && t.status === "Received" &&
      t.dateReceived && (!checkDate || t.dateReceived > checkDate) && (Number(t.qty) || 0) > 0)
    .map((t) => t.dateReceived);
  const all = [checkDate, ...shipDates, ...transferDates].filter(Boolean);
  return all.length ? all.sort().at(-1) : null; // YYYY-MM-DD sorts chronologically
}

function invStatus(item, stock) {
  const t = item.threshold || 0;
  if (stock <= t) return "REORDER NOW";
  if (stock <= t * 1.5) return "Low";
  return "OK";
}

function statusColor(status) {
  if (status === "Need to Order" || status === "REORDER NOW") return "var(--reorder)";
  if (status === "Low") return "var(--low)";
  if (status === "Good" || status === "OK") return "var(--good)";
  return "var(--ink-soft)";
}

function statusBg(status) {
  if (status === "Need to Order" || status === "REORDER NOW") return "var(--reorder-bg)";
  if (status === "Low") return "var(--low-bg)";
  if (status === "Good" || status === "OK") return "var(--good-bg)";
  return "var(--line)";
}

function uid(prefix) {
  return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Only let a practice's stored color through if it's a plain hex value, so a
// tenant-controlled DB field can never inject arbitrary CSS into the page.
function safeColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value.trim()) ? value.trim() : null;
}

// Runtime brand override, scoped to .app-root, from the practice's own colors.
// The stylesheet defaults are Baybridge's own navy/teal, so a practice with no
// stored colors shows the platform look; a practice with primary_color/
// accent_color set (Mann included) overrides them with its own palette.
function practiceBrandCss(practice) {
  if (!practice) return "";
  const primary = safeColor(practice.primary_color);
  const accent = safeColor(practice.accent_color);
  if (!primary && !accent) return "";
  return ".app-root{" +
    (primary ? "--ink:" + primary + ";" : "") +
    (accent ? "--brand-green:" + accent + ";" : "") +
    "}";
}

/* ============================== SMALL UI PIECES ============================== */
function Badge({ status, small }) {
  if (!status) return <span className="badge badge-empty">Not checked</span>;
  return (
    <span
      className={"badge" + (small ? " badge-sm" : "")}
      style={{ color: statusColor(status), background: statusBg(status) }}
    >
      {status}
    </span>
  );
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <select className="select" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder || "—"}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function LocationTabs({ active, onChange, counts, locations }) {
  return (
    <div className="drawer-tabs">
      {locations.map((loc) => {
        const c = counts ? counts[loc] || 0 : 0;
        return (
          <button
            key={loc}
            className={"drawer-tab" + (active === loc ? " drawer-tab-active" : "")}
            onClick={() => onChange(loc)}
          >
            <span className="drawer-tab-label">{loc}</span>
            {c > 0 && <span className="drawer-tab-badge">{c}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Inline stroke icons (currentColor, so they theme + follow active/severity color).
function Icon({ name, size = 20 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "dashboard": return <svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h5v-6h4v6h5V9.5" /></svg>;
    case "checkin":   return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="m8.5 12.5 2.4 2.4 4.6-5" /></svg>;
    case "shipments": return <svg {...p}><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></svg>;
    case "queue":     return <svg {...p}><path d="M5 21V4" /><path d="M5 4h11l-2.2 3L16 10H5" /></svg>;
    case "order":     return <svg {...p}><circle cx="9.5" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /><path d="M3 4h2l2.1 10.4a1 1 0 0 0 1 .8h8.5a1 1 0 0 0 1-.8L20 8H6" /></svg>;
    case "receive":   return <svg {...p}><path d="M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" /><path d="M12 3v10m0 0 3.5-3.5M12 13l-3.5-3.5" /></svg>;
    case "transfer":  return <svg {...p}><path d="M7 8h13m0 0-3-3m3 3-3 3" /><path d="M17 16H4m0 0 3-3m-3 3 3 3" /></svg>;
    default: return null;
  }
}

function NavItem({ icon, label, active, onClick, count }) {
  return (
    <button className={"nav-item" + (active ? " nav-item-active" : "")} onClick={onClick}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {count > 0 && <span className="nav-count">{count}</span>}
    </button>
  );
}

/* ============================== DASHBOARD (hitlist) ============================== */
// Per-location "needs ordering" counts, for the summary cards.
function locNeedCounts(items, checks, shipments, transfers, locations) {
  const c = Object.fromEntries(locations.map((l) => [l, 0]));
  items.forEach((item) => {
    locations.forEach((loc) => {
      if (item.type === "Quantity") {
        if (invStatus(item, liveStock(item, loc, checks, shipments, transfers)) === "REORDER NOW") c[loc]++;
      } else if (effectiveStatus(item, checks[keyFor(loc, item.id)]) === "Need to Order") {
        c[loc]++;
      }
    });
  });
  return c;
}

function Dashboard({ items, checks, shipments, transfers, queue, setView, setActiveLocation, locations, practiceName, today, onConfirmTransfer, onReceiveShipment }) {
  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const locCounts = useMemo(() => locNeedCounts(items, checks, shipments, transfers, locations), [items, checks, shipments, transfers, locations]);

  // The three actionable record types, scored + interleaved by urgency.
  const hitlist = useMemo(() => {
    const nameOf = (id) => (itemById[id] ? itemById[id].name : id);
    const entries = [];

    // 1) Needs ordering — pending queue entries.
    queue.filter((q) => q.status === "Pending").forEach((q) => {
      const item = itemById[q.itemId];
      const locs = q.locations || [];
      let severity01 = 0.75;            // Good/Low "Need to Order" default
      let worstDanger = true;
      if (item && item.type === "Quantity") {
        let worstRatio = 1;
        locs.forEach((loc) => {
          const stock = liveStock(item, loc, checks, shipments, transfers);
          const ratio = item.threshold > 0 ? stock / item.threshold : (stock <= 0 ? 0 : 1);
          worstRatio = Math.min(worstRatio, ratio);
        });
        severity01 = Math.max(0, Math.min(1, 1 - worstRatio));
        worstDanger = worstRatio <= 1;   // at/under threshold
      }
      entries.push({
        id: "order-" + q.id, type: "order", itemName: nameOf(q.itemId),
        severity: worstDanger ? "danger" : "warning",
        ageDays: daysBetween(q.dateFlagged, today), severity01,
        locationLabel: locs.join(", ") || "—",
        action: "Order", onAction: () => setView("queue"),
        sub: "Flagged " + fmtDate(q.dateFlagged),
      });
    });

    // 2) Awaiting transfer confirmation — pending transfers.
    transfers.filter((t) => t.status === "Pending").forEach((t) => {
      const ageDays = daysBetween(t.dateCreated, today);
      entries.push({
        id: "transfer-" + t.id, type: "transfer", itemName: nameOf(t.itemId),
        severity: ageDays > 7 ? "danger" : "warning", ageDays,
        locationLabel: t.fromLocation + " → " + t.toLocation,
        action: "Confirm arrival", onAction: () => onConfirmTransfer(t.id),
        sub: "qty " + t.qty + " · logged " + fmtDate(t.dateCreated),
      });
    });

    // 3) Awaiting receipt — Ordered, not yet Received.
    shipments.filter((s) => s.status === "Ordered").forEach((s) => {
      const ageDays = daysBetween(s.dateOrdered, today);
      entries.push({
        id: "receive-" + s.id, type: "receive", itemName: nameOf(s.itemId),
        severity: ageDays > 14 ? "warning" : "info", ageDays,
        locationLabel: (s.distributor || "No distributor") + (s.shipTo ? " → " + s.shipTo : ""),
        action: "Mark received", onAction: () => onReceiveShipment(s.id),
        sub: "ordered " + fmtDate(s.dateOrdered) + (ageDays > 14 ? " · overdue" : ""),
      });
    });

    return rankHitlist(entries);
  }, [queue, transfers, shipments, itemById, checks, today, setView, onConfirmTransfer, onReceiveShipment]);

  return (
    <div className="view">
      <div className="view-header">
        <h1>{practiceName || "Supply System"}</h1>
        <p className="view-sub">{fmtDate(today)} · {locations.length} location{locations.length === 1 ? "" : "s"} · {items.length} items tracked</p>
      </div>

      <div className="card-grid">
        {locations.map((loc) => {
          const need = locCounts[loc] || 0;
          return (
            <button key={loc} className={"loc-card" + (need > 0 ? " loc-card-alert" : " loc-card-ok")}
              onClick={() => { setActiveLocation(loc); setView("checkin"); }}>
              <div className="loc-card-name">{loc}</div>
              <div className="loc-card-count">{need}</div>
              <div className="loc-card-label">need ordering</div>
            </button>
          );
        })}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Needs attention</h2>
          <span className="pill">{hitlist.length}</span>
        </div>
        {hitlist.length === 0 ? (
          <div className="empty-state">All clear — nothing needs action right now.</div>
        ) : (
          <div className="hit-list">
            {hitlist.map((h) => (
              <div key={h.id} className={"hit-row hit-" + h.severity}>
                <span className="hit-icon"><Icon name={h.type} size={18} /></span>
                <div className="hit-main">
                  <div className="hit-name">{h.itemName}</div>
                  <div className="hit-meta">{h.locationLabel} · {h.sub}</div>
                </div>
                <button className={"btn btn-tiny " + (h.type === "order" ? "btn-secondary" : "btn-primary")} onClick={h.onAction}>
                  {h.action}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== CHECK-IN ============================== */
function ItemRow({ item, check, location, onSave }) {
  const [count, setCount] = useState(check && check.count !== undefined ? check.count : "");
  const [notes, setNotes] = useState(check ? check.notes || "" : "");

  useEffect(() => {
    setCount(check && check.count !== undefined ? check.count : "");
    setNotes(check ? check.notes || "" : "");
  }, [check]);

  if (item.type === "Quantity") {
    const sugg = suggestedStatus(item, count);
    const dirty = String(count) !== String(check && check.count !== undefined ? check.count : "");
    return (
      <div className="item-row">
        <div className="item-main">
          <div className="item-name">{item.name}</div>
          <div className="item-meta">{item.cabinets[location] || "No cabinet"} · threshold {item.threshold}{item.unit ? " · " + item.unit : ""}</div>
        </div>
        <input
          className="qty-input"
          type="number"
          inputMode="decimal"
          placeholder="count"
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
        <Badge status={sugg} small />
        <button
          className="btn btn-tiny"
          disabled={!dirty || count === ""}
          onClick={() => onSave(item, { count: Number(count), notes })}
        >
          Save
        </button>
      </div>
    );
  }

  const status = check ? check.status : null;
  return (
    <div className="item-row">
      <div className="item-main">
        <div className="item-name">{item.name}</div>
        <div className="item-meta">{item.cabinets[location] || "No cabinet"}{check && check.date ? " · last checked " + fmtDate(check.date) : ""}</div>
      </div>
      <div className="status-toggle">
        {["Good", "Low", "Need to Order"].map((s) => (
          <button
            key={s}
            className={"toggle-btn" + (status === s ? " toggle-btn-active" : "")}
            style={status === s ? { background: statusBg(s), color: statusColor(s), borderColor: statusColor(s) } : {}}
            onClick={() => onSave(item, { status: s, notes })}
          >
            {s === "Need to Order" ? "Order" : s}
          </button>
        ))}
      </div>
    </div>
  );
}

function CheckIn({ items, checks, activeLocation, setActiveLocation, onSaveCheck, locCounts, locations }) {
  const [search, setSearch] = useState("");
  const [cabinet, setCabinet] = useState("");

  const cabinets = useMemo(() => {
    const s = new Set(items.map((i) => i.cabinets[activeLocation]).filter(Boolean));
    return Array.from(s).sort((a, b) => (isNaN(a) || isNaN(b) ? String(a).localeCompare(String(b)) : Number(a) - Number(b)));
  }, [items, activeLocation]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (cabinet && i.cabinets[activeLocation] !== cabinet) return false;
      if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, cabinet, search]);

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach((i) => { const cab = i.cabinets[activeLocation]; (g[cab] = g[cab] || []).push(i); });
    return g;
  }, [filtered, activeLocation]);

  return (
    <div className="view">
      <div className="view-header">
        <h1>Location check-in</h1>
        <p className="view-sub">Mark stock at each location — flags route to the ordering queue automatically.</p>
      </div>

      <LocationTabs active={activeLocation} onChange={setActiveLocation} counts={locCounts} locations={locations} />

      <div className="panel drawer-panel">
        <div className="checkin-controls">
          <input className="text-input" placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="select" value={cabinet} onChange={(e) => setCabinet(e.target.value)}>
            <option value="">All cabinets</option>
            {cabinets.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {Object.keys(grouped).length === 0 ? (
          <div className="empty-state">No items match that search.</div>
        ) : (
          Object.keys(grouped).sort((a,b)=> (isNaN(a)||isNaN(b)? String(a).localeCompare(String(b)) : Number(a)-Number(b))).map((cab) => (
            <div key={cab} className="cabinet-group">
              <div className="cabinet-label">{cab || "No cabinet"}</div>
              {grouped[cab].map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  check={checks[keyFor(activeLocation, item.id)]}
                  location={activeLocation}
                  onSave={(it, patch) => onSaveCheck(it, activeLocation, patch)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ============================== SHIPMENTS ============================== */
function ShipmentForm({ items, distributors, onAdd, locations }) {
  const emptySplit = () => Object.fromEntries(locations.map((l) => [l, ""]));
  const [itemId, setItemId] = useState("");
  const [distributor, setDistributor] = useState("");
  const [po, setPo] = useState("");
  const [shipTo, setShipTo] = useState("");
  const [dateOrdered, setDateOrdered] = useState(todayISO());
  const [total, setTotal] = useState("");
  const [split, setSplit] = useState(emptySplit);
  const [splitTouched, setSplitTouched] = useState(false);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)).slice(0, 8);
  }, [query, items]);

  const selectedItem = items.find((i) => i.id === itemId);
  const splitSum = locations.reduce((s, loc) => s + (Number(split[loc]) || 0), 0);
  const mismatch = total !== "" && splitSum !== Number(total);

  const applyAutoSplit = (t) => {
    if (t === "" || isNaN(Number(t))) { setSplit(emptySplit()); return; }
    setSplit(evenSplit(Number(t), locations));
  };

  const reset = () => {
    setItemId(""); setQuery(""); setDistributor(""); setPo(""); setShipTo(""); setTotal("");
    setSplit(emptySplit()); setSplitTouched(false); setDateOrdered(todayISO());
  };

  return (
    <div className="ship-form">
      <div className="form-row">
        <div className="form-field form-field-wide">
          <label>Item</label>
          <input className="text-input" placeholder="Search item name or ID…" value={selectedItem ? selectedItem.name : query}
            onChange={(e) => { setQuery(e.target.value); setItemId(""); }} />
          {matches.length > 0 && !itemId && (
            <div className="autocomplete">
              {matches.map((m) => (
                <div key={m.id} className="autocomplete-item" onClick={() => { setItemId(m.id); setQuery(""); }}>
                  {m.name} <span className="muted">{m.id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="form-field">
          <label>Distributor</label>
          <Select value={distributor} onChange={setDistributor} options={distributors} placeholder="Select…" />
        </div>
        <div className="form-field">
          <label>PO / Order ref</label>
          <input className="text-input" value={po} onChange={(e) => setPo(e.target.value)} />
        </div>
        <div className="form-field">
          <label>Date ordered</label>
          <input className="text-input" type="date" value={dateOrdered} onChange={(e) => setDateOrdered(e.target.value)} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Ships to</label>
          <select className="select" value={shipTo} onChange={(e) => setShipTo(e.target.value)}>
            <option value="">Select…</option>
            {locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="form-field-note" style={{ flex: "1 1 100%" }}>
          If this ships somewhere other than its final destination(s), the amounts for other locations
          will show up under Transfers once marked Received, instead of counting as on-hand right away.
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Total quantity ordered</label>
          <input className="text-input" type="number" value={total}
            onChange={(e) => { setTotal(e.target.value); if (!splitTouched) applyAutoSplit(e.target.value); }} />
        </div>
        {locations.map((loc) => (
          <div className="form-field" key={loc}>
            <label>{loc}</label>
            <input className="text-input" type="number" value={split[loc] ?? ""}
              onChange={(e) => { setSplitTouched(true); setSplit({ ...split, [loc]: e.target.value }); }} />
          </div>
        ))}
      </div>
      <div className="form-row">
        <button type="button" className="btn btn-secondary btn-tiny" onClick={() => { setSplitTouched(false); applyAutoSplit(total); }}>
          Reset to suggested split
        </button>
      </div>

      {mismatch && <div className="warn-line">Split ({splitSum}) doesn't match total ordered ({total}) — you can still save this.</div>}

      <button
        className="btn btn-primary"
        disabled={!itemId || !total}
        onClick={() => {
          onAdd({
            id: uid("SHP"), itemId, distributor, po, shipTo, dateOrdered, status: "Ordered",
            total: Number(total),
            split: Object.fromEntries(locations.map((loc) => [loc, Number(split[loc]) || 0])),
            dateReceived: "", receivedBy: "", notes: "", transfersCreated: false,
          });
          reset();
        }}
      >
        Log order
      </button>
    </div>
  );
}

function ShipmentRow({ s, item, onUpdate, locations }) {
  const draftFrom = () => Object.fromEntries(locations.map((loc) => [loc, shipQty(s, loc)]));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(draftFrom);

  const startEdit = () => { setDraft(draftFrom()); setEditing(true); };
  const save = () => {
    onUpdate(s.id, {
      split: Object.fromEntries(locations.map((loc) => [loc, Number(draft[loc]) || 0])),
    });
    setEditing(false);
  };

  return (
    <div className="ship-row">
      <div className="ship-main">
        <div className="flag-name">{item ? item.name : s.itemId}</div>
        <div className="flag-meta">
          {s.distributor || "No distributor"} · ordered {fmtDate(s.dateOrdered)} · total {s.total}{s.shipTo ? " · ships to " + s.shipTo : ""}
        </div>
        {!editing ? (
          <div className="flag-meta muted">
            {locations.map((loc) => loc + " " + shipQty(s, loc)).join(" · ")}
          </div>
        ) : (
          <div className="form-row" style={{ marginTop: 6 }}>
            {locations.map((loc) => (
              <div className="form-field" key={loc}>
                <label>{loc}</label>
                <input className="text-input" type="number" value={draft[loc] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [loc]: e.target.value })} />
              </div>
            ))}
          </div>
        )}
        {s.transfersCreated && <div className="flag-meta" style={{ color: "var(--good)" }}>Transfers created for other locations — see Transfers</div>}
        {editing && s.transfersCreated && (
          <div className="warn-line">Transfers were already created from this shipment — editing quantities now won't update them.</div>
        )}
      </div>
      <div className="ship-actions">
        {editing ? (
          <>
            <button className="btn btn-primary btn-tiny" onClick={save}>Save</button>
            <button className="btn btn-secondary btn-tiny" onClick={() => setEditing(false)}>Cancel</button>
          </>
        ) : (
          <>
            <span className="badge" style={{
              color: s.status === "Received" ? "var(--good)" : s.status === "Partially Received" ? "var(--low)" : "var(--ink-soft)",
              background: s.status === "Received" ? "var(--good-bg)" : s.status === "Partially Received" ? "var(--low-bg)" : "var(--line)",
            }}>{s.status}</span>
            <button className="btn btn-secondary btn-tiny" onClick={startEdit}>Edit quantities</button>
            {s.status !== "Received" && (
              <button className="btn btn-tiny" onClick={() => onUpdate(s.id, { status: "Received", dateReceived: todayISO() })}>
                Mark received
              </button>
            )}
            {s.status === "Received" && <span className="muted">Received {fmtDate(s.dateReceived)}</span>}
          </>
        )}
      </div>
    </div>
  );
}

/* Reusable filter control: a labeled dropdown that defaults to "All …". Used by
   the Shipments and Queue lists so filtering looks and behaves the same
   everywhere (see UI_UX_GUIDELINES.md → "Filtering lists"). */
function FilterSelect({ label, allLabel, value, onChange, options }) {
  return (
    <label className="filter-select">
      <span className="filter-label">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function FilterBar({ children }) {
  return <div className="filter-bar">{children}</div>;
}

function ShipmentsView({ items, shipments, distributors, onAdd, onUpdate, locations }) {
  const [filter, setFilter] = useState("All");
  const [distFilter, setDistFilter] = useState("");
  const [locFilter, setLocFilter] = useState("");
  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  // Distributor options come from what's actually on the shipments (plus the
  // directory), so the filter never offers a value that can't match anything.
  const distOptions = useMemo(
    () => Array.from(new Set(shipments.map((s) => s.distributor).filter(Boolean))).sort(),
    [shipments]
  );
  const filtered = shipments
    .filter((s) => filter === "All" || s.status === filter)
    .filter((s) => !distFilter || s.distributor === distFilter)
    .filter((s) => !locFilter || (s.split && Number(s.split[locFilter]) > 0))
    .sort((a, b) => (b.dateOrdered || "").localeCompare(a.dateOrdered || ""));

  return (
    <div className="view">
      <div className="view-header">
        <h1>Shipments</h1>
        <p className="view-sub">Log what you ordered — mark it Received when it arrives to update inventory automatically.</p>
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Log a new order</h2></div>
        <ShipmentForm items={items} distributors={distributors} onAdd={onAdd} locations={locations} />
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Order history</h2>
          <div className="filter-chips">
            {["All", "Ordered", "Partially Received", "Received"].map((f) => (
              <button key={f} className={"chip" + (filter === f ? " chip-active" : "")} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
        </div>
        <FilterBar>
          <FilterSelect label="Location" allLabel="All locations" value={locFilter} onChange={setLocFilter} options={locations} />
          <FilterSelect label="Distributor" allLabel="All distributors" value={distFilter} onChange={setDistFilter} options={distOptions} />
          {(locFilter || distFilter || filter !== "All") && (
            <button className="btn btn-secondary btn-tiny filter-clear" onClick={() => { setFilter("All"); setDistFilter(""); setLocFilter(""); }}>Clear filters</button>
          )}
        </FilterBar>
        {filtered.length === 0 ? (
          <div className="empty-state">{shipments.length === 0 ? "No shipments logged yet." : "No shipments match these filters."}</div>
        ) : (
          <div className="ship-list">
            {filtered.map((s) => (
              <ShipmentRow key={s.id} s={s} item={itemById[s.itemId]} onUpdate={onUpdate} locations={locations} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== ORDERING QUEUE ============================== */
function LocationToggle({ locations, onChange, allLocations }) {
  const allSelected = allLocations.length > 0 && allLocations.every((l) => locations.includes(l));
  return (
    <div className="loc-toggle">
      {allLocations.map((loc) => (
        <button key={loc} type="button"
          className={"loc-chip" + (locations.includes(loc) ? " loc-chip-active" : "")}
          onClick={() => {
            const next = locations.includes(loc) ? locations.filter((l) => l !== loc) : [...locations, loc];
            if (next.length > 0) onChange(next);
          }}>
          {loc}
        </button>
      ))}
      <button type="button" className={"loc-chip loc-chip-all" + (allSelected ? " loc-chip-active" : "")}
        onClick={() => onChange(allSelected ? [locations[0] || allLocations[0]] : [...allLocations])}>
        All
      </button>
    </div>
  );
}

function QueueRow({ q, item, distributors, onUpdate, locations, selectable, selected, onToggleSelect }) {
  const [notes, setNotes] = useState(q.notes || "");
  const ready = q.distributor && Number(q.qtyToOrder) > 0;

  useEffect(() => { setNotes(q.notes || ""); }, [q.notes]);

  const handleLocationChange = (next) => {
    const nextDetails = { ...q.details };
    next.forEach((loc) => { if (!nextDetails[loc]) nextDetails[loc] = { qty: null, reason: "Added manually" }; });
    onUpdate(q.id, { locations: next, details: nextDetails });
  };

  return (
    <div className={"queue-row" + (selected ? " queue-row-selected" : "")}>
      <div className="queue-main">
        <div className="flag-name">
          {selectable && (
            <input type="checkbox" className="queue-check" checked={!!selected}
              onChange={() => onToggleSelect(q.id)} aria-label={`Select ${item ? item.name : q.itemId}`} />
          )}
          {item ? item.name : q.itemId}
        </div>
        <div className="flag-meta">flagged {fmtDate(q.dateFlagged)}{q.dateOrdered ? " · ordered " + fmtDate(q.dateOrdered) : ""}</div>
        <div className="flag-meta muted">
          {q.locations.map((loc) => {
            const d = q.details[loc];
            const suffix = d && d.qty !== null && d.qty !== undefined ? ": " + d.qty : "";
            return loc + suffix;
          }).join("  ·  ")}
        </div>
        <div style={{ marginTop: 6 }}>
          <LocationToggle locations={q.locations} onChange={handleLocationChange} allLocations={locations} />
        </div>
        {q.shipmentCreated && <div className="flag-meta" style={{ color: "var(--good)" }}>Shipment logged automatically · split across {q.locations.length} location{q.locations.length > 1 ? "s" : ""}</div>}
      </div>
      <div className="queue-fields">
        <input className="text-input qty-order-input" type="number" placeholder="Qty to order"
          value={q.qtyToOrder ?? ""} onChange={(e) => onUpdate(q.id, { qtyToOrder: e.target.value })} />
        <Select value={q.distributor} onChange={(v) => onUpdate(q.id, { distributor: v })} options={distributors} placeholder="Distributor" />
        <select className="select" value={q.status} onChange={(e) => onUpdate(q.id, { status: e.target.value })}>
          {["Pending", "Ordered", "Received", "Not Needed"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <textarea className="text-input queue-notes" rows={2} placeholder="Notes or special instructions…"
        value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => onUpdate(q.id, { notes })} />
      {q.status === "Ordered" && !ready && (
        <div className="warn-line">Add a distributor and a quantity to auto-log this as a shipment.</div>
      )}
    </div>
  );
}

function AddToQueueForm({ items, onAdd, locations: allLocations }) {
  const [query, setQuery] = useState("");
  const [itemId, setItemId] = useState("");
  const [locations, setLocations] = useState([]);
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)).slice(0, 8);
  }, [query, items]);

  const selectedItem = items.find((i) => i.id === itemId);
  const reset = () => { setQuery(""); setItemId(""); setLocations([]); };

  if (!open) {
    return <button className="btn btn-accent" onClick={() => setOpen(true)}>+ Add item manually</button>;
  }

  return (
    <div className="add-item-form">
      <div className="form-row">
        <div className="form-field form-field-wide">
          <label>Item</label>
          <input className="text-input" placeholder="Search item name or ID…" value={selectedItem ? selectedItem.name : query}
            onChange={(e) => { setQuery(e.target.value); setItemId(""); }} />
          {matches.length > 0 && !itemId && (
            <div className="autocomplete">
              {matches.map((m) => (
                <div key={m.id} className="autocomplete-item" onClick={() => { setItemId(m.id); setQuery(""); }}>
                  {m.name} <span className="muted">{m.id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="form-row">
        <div className="form-field form-field-wide">
          <label>Locations</label>
          <LocationToggle locations={locations} onChange={setLocations} allLocations={allLocations} />
        </div>
      </div>
      <div className="form-row">
        <button className="btn btn-primary" disabled={!itemId || locations.length === 0}
          onClick={() => { onAdd(itemId, locations); reset(); setOpen(false); }}>
          Add to queue
        </button>
        <button className="btn btn-secondary" onClick={() => { reset(); setOpen(false); }}>Cancel</button>
      </div>
    </div>
  );
}

function QueueView({ items, queue, distributors, onUpdate, onManualAdd, onBulkOrder, locations }) {
  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("All");
  const [locFilter, setLocFilter] = useState("");
  const [distFilter, setDistFilter] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  const pendingAll = useMemo(
    () => queue.filter((q) => q.status === "Pending").sort((a, b) => (b.dateFlagged || "").localeCompare(a.dateFlagged || "")),
    [queue]
  );
  const distOptions = useMemo(
    () => Array.from(new Set(pendingAll.map((q) => q.distributor).filter(Boolean))).sort(),
    [pendingAll]
  );
  const pending = pendingAll
    .filter((q) => !locFilter || q.locations.includes(locFilter))
    .filter((q) => !distFilter || q.distributor === distFilter);

  // Group the filtered pending list by distributor so a whole distributor's order
  // can be selected and marked at once; unassigned items sort last.
  const groups = useMemo(() => {
    const m = new Map();
    pending.forEach((q) => { const k = q.distributor || ""; if (!m.has(k)) m.set(k, []); m.get(k).push(q); });
    return [...m.entries()].sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : a[0].localeCompare(b[0])));
  }, [pending]);

  const toggleOne = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = (entries) => setSelected((prev) => {
    const n = new Set(prev);
    const allSel = entries.every((q) => n.has(q.id));
    entries.forEach((q) => (allSel ? n.delete(q.id) : n.add(q.id)));
    return n;
  });
  const clearSel = () => setSelected(new Set());

  const history = queue.filter((q) => q.status !== "Pending")
    .filter((q) => historyFilter === "All" || q.status === historyFilter)
    .sort((a, b) => (b.dateFlagged || "").localeCompare(a.dateFlagged || ""));

  return (
    <div className="view">
      <div className="view-header">
        <h1>Ordering queue</h1>
        <p className="view-sub">Items land here automatically when marked Need to Order on a check-in.</p>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h2>Needs action</h2>
          <span className="pill">{pending.length !== pendingAll.length ? `${pending.length} of ${pendingAll.length}` : pending.length} pending</span>
        </div>
        <div style={{ marginBottom: 14 }}>
          <AddToQueueForm items={items} onAdd={onManualAdd} locations={locations} />
        </div>
        {pendingAll.length > 0 && (
          <FilterBar>
            <FilterSelect label="Location" allLabel="All locations" value={locFilter} onChange={setLocFilter} options={locations} />
            <FilterSelect label="Distributor" allLabel="All distributors" value={distFilter} onChange={setDistFilter} options={distOptions} />
            {(locFilter || distFilter) && (
              <button className="btn btn-secondary btn-tiny filter-clear" onClick={() => { setLocFilter(""); setDistFilter(""); }}>Clear filters</button>
            )}
          </FilterBar>
        )}
        {pendingAll.length === 0 ? (
          <div className="empty-state">Nothing pending right now.</div>
        ) : pending.length === 0 ? (
          <div className="empty-state">No pending items match these filters.</div>
        ) : (
          <div className="queue-groups">
            {groups.map(([dist, entries]) => {
              const allSel = entries.every((q) => selected.has(q.id));
              return (
                <div key={dist || "__none"} className="queue-group">
                  <div className="queue-group-head">
                    <label className="group-select">
                      <input type="checkbox" className="queue-check" checked={allSel} onChange={() => toggleGroup(entries)}
                        aria-label={`Select all from ${dist || "No distributor"}`} />
                      <span className="group-name">{dist || "No distributor yet"}</span>
                    </label>
                    <span className="pill pill-quiet">{entries.length}</span>
                  </div>
                  <div className="queue-list">
                    {entries.map((q) => (
                      <QueueRow key={q.id} q={q} item={itemById[q.itemId]} distributors={distributors}
                        onUpdate={onUpdate} locations={locations}
                        selectable selected={selected.has(q.id)} onToggleSelect={toggleOne} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {selected.size > 0 && (
          <div className="bulk-bar">
            <span className="bulk-count">{selected.size} selected</span>
            <span className="bulk-hint muted">Items with a distributor + quantity auto-log a shipment.</span>
            <div className="bulk-actions">
              <button className="btn btn-secondary btn-tiny" onClick={clearSel}>Clear</button>
              <button className="btn btn-accent btn-tiny" onClick={() => { onBulkOrder(Array.from(selected)); clearSel(); }}>
                Mark {selected.size} as Ordered
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <button className="btn btn-secondary" onClick={() => setShowHistory(!showHistory)}>
          {showHistory ? "Hide" : "Show"} order history ({history.length})
        </button>
        {showHistory && (
          <div style={{ marginTop: 12 }}>
            <div className="filter-chips" style={{ marginBottom: 10 }}>
              {["All", "Ordered", "Received", "Not Needed"].map((f) => (
                <button key={f} className={"chip" + (historyFilter === f ? " chip-active" : "")} onClick={() => setHistoryFilter(f)}>{f}</button>
              ))}
            </div>
            {history.length === 0 ? (
              <div className="empty-state">Nothing here yet.</div>
            ) : (
              <div className="queue-list">
                {history.map((q) => (
                  <QueueRow key={q.id} q={q} item={itemById[q.itemId]} distributors={distributors} onUpdate={onUpdate} locations={locations} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== HELP ============================== */
// Support address is a single constant so it's trivial to point at the real
// inbox once it exists (placeholder until then).
const SUPPORT_EMAIL = "support@baybridge.com";

function HelpFaq({ q, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={"faq-item" + (open ? " faq-open" : "")}>
      <button className="faq-q" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>{q}</span>
        <span className="faq-caret">{open ? "–" : "+"}</span>
      </button>
      {open && <div className="faq-a">{children}</div>}
    </div>
  );
}

function HelpScreen() {
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Baybridge support request")}`;
  return (
    <div className="view">
      <div className="view-header">
        <h1>Help &amp; support</h1>
        <p className="view-sub">How the daily loop works, answers to common questions, and how to reach us.</p>
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Quick start</h2></div>
        <ol className="help-steps">
          <li><strong>Check-in</strong> — walk a location and mark each item OK, Low, or Need to Order. Anything you flag to order lands in the queue automatically.</li>
          <li><strong>Ordering queue</strong> — set a distributor and quantity, then mark items Ordered. You can select several at once and mark a whole distributor's order in one go.</li>
          <li><strong>Shipments</strong> — ordered items show here. Mark a shipment Received when it arrives and inventory updates itself.</li>
          <li><strong>Transfers</strong> — move stock between locations; confirm a transfer when it lands.</li>
          <li><strong>Dashboard</strong> — the top of the list is whatever needs attention first, ranked by urgency.</li>
        </ol>
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Common questions</h2></div>
        <div className="faq-list">
          <HelpFaq q="Why did an item show up in my ordering queue?">
            It was marked “Need to Order” on a check-in (or added manually). Items stay in <em>Needs action</em> until you mark them Ordered or Not Needed.
          </HelpFaq>
          <HelpFaq q="How do I order the same item for several locations at once?">
            On a queue item, use the location chips to pick which locations it's for. When you mark it Ordered with a distributor and quantity set, a shipment is logged and split across those locations.
          </HelpFaq>
          <HelpFaq q="What does marking a shipment “Received” do?">
            It updates inventory for each location on the shipment automatically — no separate stock entry needed. Partially received? Adjust the per-location amounts first.
          </HelpFaq>
          <HelpFaq q="Can I filter the queue and shipments?">
            Yes — use the Location and Distributor filters at the top of each list. The queue also groups pending items by distributor so you can act on a whole order together.
          </HelpFaq>
          <HelpFaq q="Who can change settings, delete items, or manage the catalog?">
            Owners and admins manage locations, categories, distributors, branding, and deletions. Everyone can run check-ins, order, receive, and transfer.
          </HelpFaq>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Contact support</h2></div>
        <p className="help-contact">
          Stuck or found a problem? Email <a href={mailto} className="help-link">{SUPPORT_EMAIL}</a> and we'll help.
        </p>
      </div>
    </div>
  );
}

/* ============================== INVENTORY ============================== */
function InventoryView({ items, checks, shipments, transfers, locations }) {
  const qtyItems = items.filter((i) => i.type === "Quantity");
  const [search, setSearch] = useState("");
  const filtered = qtyItems.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  // Grid columns scale with however many locations the practice has:
  // Item, Threshold, one per location, Total, Status.
  const gridCols = { gridTemplateColumns: `2fr 0.8fr ${locations.map(() => "0.8fr").join(" ")} 0.7fr 1fr` };

  return (
    <div className="view">
      <div className="view-header">
        <h1>Inventory snapshot</h1>
        <p className="view-sub">Live stock for your {qtyItems.length} quantity-tracked items — last count plus anything received since. The small date under each number is when that location's count last changed (a check, receipt, or confirmed transfer).</p>
      </div>
      <div className="panel">
        <input className="text-input" placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12 }} />
        <div className="inv-table" style={{ overflowX: "auto" }}>
          <div className="inv-head" style={gridCols}>
            <span>Item</span><span>Threshold</span>
            {locations.map((l) => <span key={l}>{l}</span>)}
            <span>Total</span><span>Status</span>
          </div>
          {filtered.map((item) => {
            const cells = locations.map((loc) => ({
              qty: liveStock(item, loc, checks, shipments, transfers),
              updated: liveStockUpdatedAt(item, loc, checks, shipments, transfers),
            }));
            const total = cells.reduce((a, c) => a + c.qty, 0);
            const status = invStatus(item, total);
            return (
              <div className="inv-row" key={item.id} style={gridCols}>
                <span className="inv-name">{item.name}</span>
                <span className="muted">{item.threshold}</span>
                {cells.map((c, i) => (
                  <span key={i} className="inv-cell">
                    {c.qty}
                    <span className="inv-updated">{c.updated ? fmtDateShort(c.updated) : "—"}</span>
                  </span>
                ))}
                <span><strong>{total}</strong></span>
                <span><Badge status={status} small /></span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================== TRANSFERS ============================== */
function TransfersView({ items, transfers, onUpdate }) {
  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const [filter, setFilter] = useState("Pending");

  const filtered = transfers
    .filter((t) => filter === "All" || t.status === filter)
    .sort((a, b) => (b.dateCreated || "").localeCompare(a.dateCreated || ""));

  return (
    <div className="view">
      <div className="view-header">
        <h1>Transfers between locations</h1>
        <p className="view-sub">
          When a shipment lands at one location but part of it belongs elsewhere, it shows up here until
          someone confirms it actually made the move — that location's inventory only counts it once you do.
        </p>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h2>{filter === "Pending" ? "Awaiting transfer" : filter}</h2>
          <div className="filter-chips">
            {["Pending", "Received", "All"].map((f) => (
              <button key={f} className={"chip" + (filter === f ? " chip-active" : "")} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">Nothing here right now.</div>
        ) : (
          <div className="queue-list">
            {filtered.map((t) => {
              const item = itemById[t.itemId];
              return (
                <div className="queue-row" key={t.id}>
                  <div className="queue-main">
                    <div className="flag-name">{item ? item.name : t.itemId}</div>
                    <div className="flag-meta">{t.fromLocation} → {t.toLocation} · qty {t.qty} · logged {fmtDate(t.dateCreated)}</div>
                    {t.status === "Received" && <div className="flag-meta" style={{ color: "var(--good)" }}>Received at {t.toLocation} {fmtDate(t.dateReceived)}</div>}
                  </div>
                  {t.status === "Pending" ? (
                    <div className="queue-fields">
                      <button className="btn btn-primary btn-tiny" onClick={() => onUpdate(t.id)}>
                        Confirm arrived at {t.toLocation}
                      </button>
                    </div>
                  ) : (
                    <Badge status="OK" small />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== HEADER & DRAWER ============================== */
function initialsOf(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function HeaderAccount({ profile, practice, onSignOut }) {
  const [open, setOpen] = useState(false);
  const who = profile?.display_name || profile?.email || "Account";
  const role = profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : "Staff";
  return (
    <div className="header-account">
      <button className="account-btn" onClick={() => setOpen((o) => !o)} aria-label="Account menu">
        <span className="account-avatar">{initialsOf(who)}</span>
      </button>
      {open && (
        <>
          <div className="account-backdrop" onClick={() => setOpen(false)} />
          <div className="account-menu">
            <div className="account-menu-name">{who}</div>
            <div className="account-menu-meta">{role}{practice?.name ? " · " + practice.name : ""}</div>
            {practice?.join_code && <div className="account-menu-code">Join code: <span>{practice.join_code}</span></div>}
            <button className="account-menu-signout" onClick={onSignOut}>Sign out</button>
          </div>
        </>
      )}
    </div>
  );
}

function Header({ onMenuClick, practiceName, practiceLogo, profile, practice, onSignOut }) {
  return (
    <div className="brand-header">
      <button className="hamburger-btn" onClick={onMenuClick} aria-label="Open menu">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 5h16M2 10h16M2 15h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
      </button>
      {/* The practice's own logo (practices.logo_url). Any practice without one
          falls back to Baybridge's platform icon — never another tenant's logo. */}
      <img src={practiceLogo || DEFAULT_LOGO_SRC} alt="" className="brand-logo" />
      <div className="brand-text">
        <div className="brand-name">{practiceName || "Supply System"}</div>
      </div>
      <HeaderAccount profile={profile} practice={practice} onSignOut={onSignOut} />
    </div>
  );
}

function SideDrawer({ open, view, setView, onClose, pendingTransfers, role }) {
  const items = [
    { key: "inventory", label: "Inventory", icon: "≡" },
    { key: "transfers", label: "Transfers between locations", icon: "⇄", count: pendingTransfers },
    { key: "items", label: "Manage items", icon: "▦" },
    { key: "locations", label: "Locations", icon: "⌘" },
    { key: "categories", label: "Categories", icon: "▤" },
    { key: "distributors", label: "Distributors", icon: "☎" },
  ];
  // Members + Branding are owner/admin-only (RLS also enforces this on every write).
  if (role === "owner" || role === "admin") {
    items.push({ key: "members", label: "Members", icon: "⚇" });
    items.push({ key: "settings", label: "Settings", icon: "✎" });
  }
  items.push({ key: "help", label: "Help & support", icon: "?" });
  return (
    <>
      {open && <div className="drawer-backdrop" onClick={onClose} />}
      <div className={"side-drawer" + (open ? " open" : "")}>
        <div className="drawer-section-label">More</div>
        {items.map((it) => (
          <button
            key={it.key}
            className={"drawer-link" + (view === it.key ? " drawer-link-active" : "")}
            onClick={() => { setView(it.key); onClose(); }}
          >
            <span className="drawer-icon">{it.icon}</span>
            {it.label}
            {!!it.count && <span className="drawer-badge">{it.count}</span>}
          </button>
        ))}
      </div>
    </>
  );
}

/* ============================== DISTRIBUTORS ============================== */
// A full add/edit form for one distributor's directory entry. onSubmit returns
// a promise resolving to {error?} so validation/DB errors surface inline.
function DistributorForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [f, setF] = useState(() => ({
    name: initial?.name || "", account_number: initial?.account_number || "", phone: initial?.phone || "",
    order_email: initial?.order_email || "", website_url: initial?.website_url || "",
    rep_name: initial?.rep_name || "", rep_phone: initial?.rep_phone || "", rep_email: initial?.rep_email || "",
    notes: initial?.notes || "",
  }));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!f.name.trim()) { setErr("Enter a distributor name."); return; }
    setBusy(true);
    const res = await onSubmit(f);
    setBusy(false);
    if (res && res.error) setErr(res.error);
  }

  return (
    <form className="add-item-form" onSubmit={submit}>
      <div className="form-row">
        <div className="form-field form-field-wide">
          <label>Name</label>
          <input className="text-input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Henry Schein" autoFocus />
        </div>
        <div className="form-field">
          <label>Account #</label>
          <input className="text-input" value={f.account_number} onChange={(e) => set("account_number", e.target.value)} placeholder="Your customer code" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Phone</label>
          <input className="text-input" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="form-field">
          <label>Order email</label>
          <input className="text-input" type="email" value={f.order_email} onChange={(e) => set("order_email", e.target.value)} />
        </div>
        <div className="form-field">
          <label>Website</label>
          <input className="text-input" value={f.website_url} onChange={(e) => set("website_url", e.target.value)} placeholder="https://" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Rep name</label>
          <input className="text-input" value={f.rep_name} onChange={(e) => set("rep_name", e.target.value)} />
        </div>
        <div className="form-field">
          <label>Rep phone</label>
          <input className="text-input" value={f.rep_phone} onChange={(e) => set("rep_phone", e.target.value)} />
        </div>
        <div className="form-field">
          <label>Rep email</label>
          <input className="text-input" type="email" value={f.rep_email} onChange={(e) => set("rep_email", e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-field form-field-wide">
          <label>Notes</label>
          <textarea className="text-input" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>
      {err && <div className="warn-line">{err}</div>}
      <div className="form-row">
        <button className="btn btn-primary" type="submit" disabled={busy || !f.name.trim()}>{busy ? "Saving…" : submitLabel}</button>
        <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function DistributorDetail({ d }) {
  const lines = [];
  if (d.account_number) lines.push(["Account #", d.account_number]);
  if (d.phone) lines.push(["Phone", d.phone]);
  if (d.order_email) lines.push(["Order email", d.order_email]);
  if (d.website_url) lines.push(["Website", d.website_url]);
  const rep = [d.rep_name, d.rep_phone, d.rep_email].filter(Boolean).join(" · ");
  if (rep) lines.push(["Rep", rep]);
  if (d.notes) lines.push(["Notes", d.notes]);
  if (lines.length === 0) return <div className="flag-meta muted">No contact details yet.</div>;
  return (
    <div className="flag-meta" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {lines.map(([k, v]) => <div key={k}><span className="muted">{k}:</span> {v}</div>)}
    </div>
  );
}

function DistributorDirectory({ distributors, onAdd, onUpdate, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>All distributors</h2>
        <span className="pill">{distributors.length}</span>
      </div>

      {adding ? (
        <DistributorForm submitLabel="Add distributor"
          onSubmit={async (fields) => { const r = await onAdd(fields); if (!r?.error) setAdding(false); return r; }}
          onCancel={() => setAdding(false)} />
      ) : (
        <button className="btn btn-accent" onClick={() => setAdding(true)}>+ Add distributor</button>
      )}

      <div className="manage-list" style={{ marginTop: 12 }}>
        {distributors.map((d) => (
          <div className="manage-row" key={d.id}>
            {editingId === d.id ? (
              <DistributorForm initial={d} submitLabel="Save"
                onSubmit={async (fields) => { const r = await onUpdate(d.id, fields); if (!r?.error) setEditingId(null); return r; }}
                onCancel={() => setEditingId(null)} />
            ) : (
              <>
                <div className="manage-main">
                  <div className="flag-name">{d.name}</div>
                  <DistributorDetail d={d} />
                </div>
                <div className="manage-actions">
                  {confirmId === d.id ? (
                    <>
                      <button className="btn btn-danger btn-tiny" onClick={() => { onRemove(d.id); setConfirmId(null); }}>Confirm delete</button>
                      <button className="btn btn-secondary btn-tiny" onClick={() => setConfirmId(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-secondary btn-tiny" onClick={() => setEditingId(d.id)}>Edit</button>
                      {canDelete && <button className="btn btn-danger btn-tiny" onClick={() => setConfirmId(d.id)}>Delete</button>}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
        {distributors.length === 0 && <div className="empty-state">No distributors yet.</div>}
      </div>
    </div>
  );
}

function DistributorsScreen({ distributorRows, onAdd, onUpdate, onRemove, canDelete }) {
  return (
    <div className="view">
      <div className="view-header">
        <h1>Distributors</h1>
        <p className="view-sub">Your vendor directory — contact info, account numbers, reps, and where to send orders. Removing one only affects future dropdowns; past shipments keep their name.</p>
      </div>
      <DistributorDirectory distributors={distributorRows} onAdd={onAdd} onUpdate={onUpdate} onRemove={onRemove} />
    </div>
  );
}

/* ============================== LOCATIONS ============================== */
// Shown only when a practice somehow has zero locations (safety net). Adding the
// first one flips MainApp out of this guard and into the normal app.
function LocationSetup({ practiceName, onAdd, onSignOut, error }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const res = await onAdd(name);
    setBusy(false);
    if (res && res.error) setErr(res.error);
    else setName("");
  }

  return (
    <div className="app-loading" style={{ justifyContent: "flex-start", paddingTop: 80 }}>
      <style>{STYLES}</style>
      <div className="panel" style={{ maxWidth: 420, width: "100%" }}>
        <div className="panel-header"><h2>Add your first location</h2></div>
        <p className="view-sub" style={{ marginBottom: 14 }}>
          {practiceName || "Your practice"} needs at least one location before you can track supplies.
          You can rename it or add more later under Locations.
        </p>
        <form onSubmit={submit} className="form-row" style={{ alignItems: "flex-end" }}>
          <div className="form-field form-field-wide">
            <label>Location name</label>
            <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Office" autoFocus />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy || !name.trim()}>{busy ? "Adding…" : "Add location"}</button>
        </form>
        {(err || error) && <div className="warn-line" style={{ marginTop: 10 }}>{err || error}</div>}
      </div>
      <button className="btn btn-secondary btn-tiny" style={{ marginTop: 16 }} onClick={onSignOut}>Sign out</button>
    </div>
  );
}

// Per-location managed cabinet/storage labels (0015). Add/rename/delete this
// location's own labels + copy the list to another location. Item assignment
// (in the item form) picks strictly from these — nothing is created implicitly.
function CabinetsEditor({ location, cabinets, otherLocations, onAdd, onRename, onDelete, onCopy, canDelete }) {
  const [newLabel, setNewLabel] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [copyTo, setCopyTo] = useState("");
  const [copyMsg, setCopyMsg] = useState("");

  async function add(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const res = await onAdd(location.id, newLabel);
    setBusy(false);
    if (res && res.error) setErr(res.error);
    else setNewLabel("");
  }
  async function saveRename(id) {
    const res = await onRename(id, location.id, editValue);
    if (res && res.error) { setErr(res.error); return; }
    setErr(""); setEditingId(null);
  }
  async function remove(id) {
    setErr("");
    const res = await onDelete(id);
    if (res && res.error) setErr(res.error);
  }
  async function copy() {
    if (!copyTo) return;
    setCopyMsg(""); setErr(""); setBusy(true);
    const res = await onCopy(location.id, copyTo);
    setBusy(false);
    if (res && res.error) { setErr(res.error); return; }
    const name = (otherLocations.find((l) => l.id === copyTo) || {}).name || "that location";
    setCopyMsg(res.count === 0 ? `${name} already had all of these.` : `Added ${res.count} to ${name}.`);
    setCopyTo("");
  }

  return (
    <div className="addr-editor">
      <div className="addr-section-label">Cabinets at {location.name}</div>
      <form onSubmit={add} className="cab-add">
        <input className="text-input" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Cabinet 3, Top shelf, Fridge" />
        <button className="btn btn-primary btn-tiny" type="submit" disabled={busy || !newLabel.trim()}>Add</button>
      </form>

      {cabinets.length === 0 ? (
        <div className="empty-state" style={{ padding: "10px 4px", textAlign: "left" }}>No cabinets defined for this location yet.</div>
      ) : (
        <div className="cab-list">
          {cabinets.map((c) => (
            <div className="cab-row" key={c.id}>
              {editingId === c.id ? (
                <>
                  <input className="text-input" value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus />
                  <button className="btn btn-primary btn-tiny" onClick={() => saveRename(c.id)}>Save</button>
                  <button className="btn btn-secondary btn-tiny" onClick={() => { setEditingId(null); setErr(""); }}>Cancel</button>
                </>
              ) : (
                <>
                  <span className="cab-label">{c.label}</span>
                  <button className="btn btn-secondary btn-tiny" onClick={() => { setEditingId(c.id); setEditValue(c.label); setErr(""); }}>Rename</button>
                  {canDelete && <button className="btn btn-danger btn-tiny" onClick={() => remove(c.id)}>Delete</button>}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {otherLocations.length > 0 && cabinets.length > 0 && (
        <div className="cab-copy">
          <span>Copy this list to</span>
          <select className="select" value={copyTo} onChange={(e) => { setCopyTo(e.target.value); setCopyMsg(""); }}>
            <option value="">Select a location…</option>
            {otherLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button className="btn btn-secondary btn-tiny" disabled={busy || !copyTo} onClick={copy}>Copy</button>
          {copyMsg && <span className="brand-saved">{copyMsg}</span>}
        </div>
      )}

      {err && <div className="warn-line" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  );
}

const ADDRESS_FIELDS = [
  { key: "line1", label: "Street line 1", wide: true },
  { key: "line2", label: "Street line 2 (suite, optional)", wide: true },
  { key: "city", label: "City" },
  { key: "state", label: "State / province" },
  { key: "postal_code", label: "Postal code" },
  { key: "country", label: "Country" },
];
// Trim fields; return the object, or null if every field is empty (so an empty
// form stores null, not an empty object — matches the 0014 null semantics).
function cleanAddress(a) {
  const out = {};
  let any = false;
  for (const f of ADDRESS_FIELDS) {
    const v = (a[f.key] || "").trim();
    if (v) { out[f.key] = v; any = true; }
  }
  return any ? out : null;
}
function emptyAddress() {
  return { line1: "", line2: "", city: "", state: "", postal_code: "", country: "" };
}

function AddressFields({ values, onChange }) {
  return (
    <div className="addr-grid">
      {ADDRESS_FIELDS.map((f) => (
        <div key={f.key} className={"form-field" + (f.wide ? " addr-wide" : "")}>
          <label>{f.label}</label>
          <input className="text-input" value={values[f.key] || ""} onChange={(e) => onChange(f.key, e.target.value)} />
        </div>
      ))}
    </div>
  );
}

// Per-location address editor. Physical/mailing + billing, billing defaulting to
// "same as physical" (stored as null). Location settings only — never shown on
// the inventory/ordering side.
function AddressEditor({ location, onSave, onCancel }) {
  const [physical, setPhysical] = useState(() => ({ ...emptyAddress(), ...(location.physical_address || {}) }));
  const [billingSame, setBillingSame] = useState(location.billing_address == null);
  const [billing, setBilling] = useState(() => ({ ...emptyAddress(), ...(location.billing_address || {}) }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setErr("");
    setBusy(true);
    try {
      await onSave(cleanAddress(physical), billingSame ? null : cleanAddress(billing));
    } catch (e) {
      setErr(e.message || "Could not save the address.");
      setBusy(false);
    }
  }

  return (
    <div className="addr-editor">
      <div className="addr-section-label">Physical / mailing address</div>
      <AddressFields values={physical} onChange={(k, v) => setPhysical((p) => ({ ...p, [k]: v }))} />
      <label className="addr-same">
        <input type="checkbox" checked={billingSame} onChange={(e) => setBillingSame(e.target.checked)} />
        Billing address same as physical
      </label>
      {!billingSame && (
        <>
          <div className="addr-section-label">Billing address</div>
          <AddressFields values={billing} onChange={(k, v) => setBilling((p) => ({ ...p, [k]: v }))} />
        </>
      )}
      {err && <div className="warn-line" style={{ marginTop: 8 }}>{err}</div>}
      <div className="addr-actions">
        <button className="btn btn-primary btn-tiny" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save address"}</button>
        <button className="btn btn-secondary btn-tiny" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function LocationsManager({ locations, onAdd, onRename, onDelete, onReorder, onSaveAddresses,
  cabinetsByLoc, onAddCabinet, onRenameCabinet, onDeleteCabinet, onCopyCabinets, canManage }) {
  const [newName, setNewName] = useState("");
  const [addErr, setAddErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [confirmId, setConfirmId] = useState(null); // id pending delete confirmation
  const [addressId, setAddressId] = useState(null); // id whose address editor is open
  const [cabinetsId, setCabinetsId] = useState(null); // id whose cabinets editor is open
  const [rowErr, setRowErr] = useState({}); // id -> message

  const addrSummary = (a) => (a ? [a.line1, a.city, a.state].filter(Boolean).join(", ") : "");

  const setError = (id, msg) => setRowErr((p) => ({ ...p, [id]: msg }));

  async function add(e) {
    e.preventDefault();
    setAddErr("");
    setBusy(true);
    const res = await onAdd(newName);
    setBusy(false);
    if (res && res.error) setAddErr(res.error);
    else setNewName("");
  }

  async function saveRename(id) {
    const res = await onRename(id, editValue);
    if (res && res.error) { setError(id, res.error); return; }
    setError(id, ""); setEditingId(null);
  }

  async function confirmRemove(loc) {
    const res = await onDelete(loc.id);
    setConfirmId(null);
    if (res && res.error) setError(loc.id, res.error);
  }

  function move(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= locations.length) return;
    const ids = locations.map((l) => l.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    onReorder(ids);
  }

  return (
    <div className="view">
      <div className="view-header">
        <h1>Locations</h1>
        <p className="view-sub">{canManage ? "Add, rename, reorder, or remove the offices this practice tracks supplies for. Names must be unique." : "The offices this practice tracks supplies for. Only an owner or admin can change these."}</p>
      </div>

      {canManage && (
        <div className="panel">
          <div className="panel-header"><h2>Add a location</h2></div>
          <form onSubmit={add} className="form-row" style={{ alignItems: "flex-end" }}>
            <div className="form-field form-field-wide">
              <label>Location name</label>
              <input className="text-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Downtown" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy || !newName.trim()}>{busy ? "Adding…" : "Add location"}</button>
          </form>
          {addErr && <div className="warn-line" style={{ marginTop: 10 }}>{addErr}</div>}
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <h2>Current locations</h2>
          <span className="pill">{locations.length}</span>
        </div>
        <div className="manage-list">
          {locations.map((loc, i) => (
            <div key={loc.id}>
            <div className="manage-row">
              {editingId === loc.id ? (
                <div className="form-row form-field-wide" style={{ flex: 1, alignItems: "flex-end" }}>
                  <div className="form-field form-field-wide">
                    <input className="text-input" value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus />
                  </div>
                  <button className="btn btn-primary btn-tiny" onClick={() => saveRename(loc.id)}>Save</button>
                  <button className="btn btn-secondary btn-tiny" onClick={() => { setEditingId(null); setError(loc.id, ""); }}>Cancel</button>
                </div>
              ) : confirmId === loc.id ? (
                <>
                  <div className="manage-main">
                    <div className="flag-name">{loc.name}</div>
                    <div className="warn-line" style={{ marginTop: 6 }}>
                      Any check-in or shipment data recorded under "{loc.name}" will be orphaned until the
                      data-layer migration (step 3). This can't be undone.
                    </div>
                  </div>
                  <div className="manage-actions">
                    <button className="btn btn-danger btn-tiny" onClick={() => confirmRemove(loc)}>Confirm delete</button>
                    <button className="btn btn-secondary btn-tiny" onClick={() => setConfirmId(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="manage-main">
                    <div className="flag-name">{loc.name}</div>
                    {loc.physical_address && addrSummary(loc.physical_address) && (
                      <div className="flag-meta">{addrSummary(loc.physical_address)}</div>
                    )}
                    {rowErr[loc.id] && <div className="warn-line" style={{ marginTop: 6 }}>{rowErr[loc.id]}</div>}
                  </div>
                  {canManage && (
                    <div className="manage-actions">
                      <button className="btn btn-secondary btn-tiny" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                      <button className="btn btn-secondary btn-tiny" onClick={() => move(i, 1)} disabled={i === locations.length - 1} aria-label="Move down">↓</button>
                      <button className={"btn btn-tiny " + (addressId === loc.id ? "btn-primary" : "btn-secondary")} onClick={() => { setAddressId(addressId === loc.id ? null : loc.id); setCabinetsId(null); }}>Address</button>
                      <button className={"btn btn-tiny " + (cabinetsId === loc.id ? "btn-primary" : "btn-secondary")} onClick={() => { setCabinetsId(cabinetsId === loc.id ? null : loc.id); setAddressId(null); }}>Cabinets</button>
                      <button className="btn btn-secondary btn-tiny" onClick={() => { setEditingId(loc.id); setEditValue(loc.name); setError(loc.id, ""); }}>Rename</button>
                      <button className="btn btn-danger btn-tiny" onClick={() => { setConfirmId(loc.id); setError(loc.id, ""); }} disabled={locations.length <= 1}>Delete</button>
                    </div>
                  )}
                </>
              )}
            </div>
            {addressId === loc.id && (
              <AddressEditor
                location={loc}
                onCancel={() => setAddressId(null)}
                onSave={async (physical, billing) => { await onSaveAddresses(loc.id, physical, billing); setAddressId(null); }}
              />
            )}
            {cabinetsId === loc.id && (
              <CabinetsEditor
                location={loc}
                cabinets={cabinetsByLoc[loc.name] || []}
                otherLocations={locations.filter((l) => l.id !== loc.id)}
                onAdd={onAddCabinet}
                onRename={onRenameCabinet}
                onDelete={onDeleteCabinet}
                onCopy={onCopyCabinets}
                canDelete={canManage}
              />
            )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================== CATEGORIES ============================== */
function CategoriesManager({ categories, onAdd, onRename, onDelete, onReorder, canManage }) {
  const [newName, setNewName] = useState("");
  const [addErr, setAddErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const [rowErr, setRowErr] = useState({});

  const setError = (id, msg) => setRowErr((p) => ({ ...p, [id]: msg }));

  async function add(e) {
    e.preventDefault();
    setAddErr("");
    setBusy(true);
    const res = await onAdd(newName);
    setBusy(false);
    if (res && res.error) setAddErr(res.error);
    else setNewName("");
  }
  async function saveRename(id) {
    const res = await onRename(id, editValue);
    if (res && res.error) { setError(id, res.error); return; }
    setError(id, ""); setEditingId(null);
  }
  async function confirmRemove(cat) {
    const res = await onDelete(cat.id);
    setConfirmId(null);
    if (res && res.error) setError(cat.id, res.error);
  }
  function move(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= categories.length) return;
    const ids = categories.map((c) => c.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    onReorder(ids);
  }

  return (
    <div className="view">
      <div className="view-header">
        <h1>Categories</h1>
        <p className="view-sub">{canManage ? "A fixed list to categorize items — so the same category can't drift into several spellings. Names must be unique." : "The categories used to organize items. Only an owner or admin can change these."}</p>
      </div>

      {canManage && (
        <div className="panel">
          <div className="panel-header"><h2>Add a category</h2></div>
          <form onSubmit={add} className="form-row" style={{ alignItems: "flex-end" }}>
            <div className="form-field form-field-wide">
              <label>Category name</label>
              <input className="text-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. PPE" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy || !newName.trim()}>{busy ? "Adding…" : "Add category"}</button>
          </form>
          {addErr && <div className="warn-line" style={{ marginTop: 10 }}>{addErr}</div>}
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <h2>All categories</h2>
          <span className="pill">{categories.length}</span>
        </div>
        <div className="manage-list">
          {categories.map((cat, i) => (
            <div className="manage-row" key={cat.id}>
              {editingId === cat.id ? (
                <div className="form-row form-field-wide" style={{ flex: 1, alignItems: "flex-end" }}>
                  <div className="form-field form-field-wide">
                    <input className="text-input" value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus />
                  </div>
                  <button className="btn btn-primary btn-tiny" onClick={() => saveRename(cat.id)}>Save</button>
                  <button className="btn btn-secondary btn-tiny" onClick={() => { setEditingId(null); setError(cat.id, ""); }}>Cancel</button>
                </div>
              ) : confirmId === cat.id ? (
                <>
                  <div className="manage-main">
                    <div className="flag-name">{cat.name}</div>
                    <div className="warn-line" style={{ marginTop: 6 }}>
                      Items in "{cat.name}" will become uncategorized (they aren't deleted). This can't be undone.
                    </div>
                  </div>
                  <div className="manage-actions">
                    <button className="btn btn-danger btn-tiny" onClick={() => confirmRemove(cat)}>Confirm delete</button>
                    <button className="btn btn-secondary btn-tiny" onClick={() => setConfirmId(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="manage-main">
                    <div className="flag-name">{cat.name}</div>
                    {rowErr[cat.id] && <div className="warn-line" style={{ marginTop: 6 }}>{rowErr[cat.id]}</div>}
                  </div>
                  {canManage && (
                    <div className="manage-actions">
                      <button className="btn btn-secondary btn-tiny" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                      <button className="btn btn-secondary btn-tiny" onClick={() => move(i, 1)} disabled={i === categories.length - 1} aria-label="Move down">↓</button>
                      <button className="btn btn-secondary btn-tiny" onClick={() => { setEditingId(cat.id); setEditValue(cat.name); setError(cat.id, ""); }}>Rename</button>
                      <button className="btn btn-danger btn-tiny" onClick={() => { setConfirmId(cat.id); setError(cat.id, ""); }}>Delete</button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          {categories.length === 0 && <div className="empty-state">No categories yet.</div>}
        </div>
      </div>
    </div>
  );
}

/* ============================== MEMBERS ============================== */
function MembersScreen({ members, currentUserId, onChangeRole }) {
  const [busyId, setBusyId] = useState(null);
  const [rowErr, setRowErr] = useState({});
  const ownerCount = members.filter((m) => m.role === "owner").length;

  async function change(m, role) {
    if (role === m.role) return;
    setBusyId(m.id);
    setRowErr((p) => ({ ...p, [m.id]: "" }));
    const res = await onChangeRole(m.id, role);
    setBusyId(null);
    if (res && res.error) setRowErr((p) => ({ ...p, [m.id]: res.error }));
  }

  return (
    <div className="view">
      <div className="view-header">
        <h1>Members</h1>
        <p className="view-sub">Owners and admins can change a member's role. A practice must always keep at least one owner.</p>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h2>Team</h2>
          <span className="pill">{members.length}</span>
        </div>
        <div className="manage-list">
          {members.map((m) => {
            const isSoleOwner = m.role === "owner" && ownerCount <= 1;
            return (
              <div className="manage-row" key={m.id}>
                <div className="manage-main">
                  <div className="flag-name">
                    {m.display_name || m.email || "Member"}
                    {m.id === currentUserId && <span className="muted"> · you</span>}
                  </div>
                  {m.display_name && m.email && <div className="flag-meta">{m.email}</div>}
                  {rowErr[m.id] && <div className="warn-line" style={{ marginTop: 6 }}>{rowErr[m.id]}</div>}
                </div>
                <div className="manage-actions">
                  <select className="select" value={m.role} disabled={busyId === m.id || isSoleOwner}
                    onChange={(e) => change(m, e.target.value)} aria-label={`Role for ${m.display_name || m.email || "member"}`}>
                    {["owner", "admin", "staff"].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
            );
          })}
          {members.length === 0 && <div className="empty-state">No members yet.</div>}
        </div>
        {members.some((m) => m.role === "owner" && ownerCount <= 1) && (
          <div className="flag-meta muted" style={{ marginTop: 10 }}>
            The last owner's role is locked — promote another member to owner first.
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== MANAGE ITEMS ============================== */
// Per-location cabinet assignment: a strict dropdown of that location's own
// defined labels (from the managed list). No free text, no implicit creation —
// if a location has no labels, it points to the Locations screen.
function CabinetInputs({ cabinetIds, onChange, locations, cabinetsByLoc }) {
  return (
    <div className="form-row">
      {locations.map((loc) => {
        const opts = cabinetsByLoc[loc] || [];
        return (
          <div className="form-field" key={loc}>
            <label>{loc} cabinet</label>
            {opts.length ? (
              <select className="select" value={cabinetIds[loc] || ""} onChange={(e) => onChange({ ...cabinetIds, [loc]: e.target.value })}>
                <option value="">— None —</option>
                {opts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            ) : (
              <div className="form-field-note">No cabinets for {loc} yet — add them under Locations.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AddItemForm({ onAdd, locations, categories, cabinetsByLoc }) {
  const blankMap = () => Object.fromEntries(locations.map((l) => [l, ""]));
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [cabinetIds, setCabinetIds] = useState(blankMap);
  const [type, setType] = useState("Good/Low");
  const [unit, setUnit] = useState("");
  const [threshold, setThreshold] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [cost, setCost] = useState("");
  const [qty, setQty] = useState(blankMap);
  const [open, setOpen] = useState(false);

  const reset = () => {
    setName(""); setDesc(""); setCabinetIds(blankMap());
    setType("Good/Low"); setUnit(""); setThreshold("");
    setCategoryId(""); setCost(""); setQty(blankMap());
  };

  if (!open) {
    return <button className="btn btn-accent" onClick={() => setOpen(true)}>+ Add new item</button>;
  }

  return (
    <div className="add-item-form">
      <div className="form-row">
        <div className="form-field form-field-wide">
          <label>Item name</label>
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Color Ties" />
        </div>
        <div className="form-field form-field-wide">
          <label>Description / variant</label>
          <input className="text-input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Clear" />
        </div>
      </div>

      <CabinetInputs cabinetIds={cabinetIds} onChange={setCabinetIds} locations={locations} cabinetsByLoc={cabinetsByLoc} />

      <div className="form-row">
        <div className="form-field">
          <label>Category (optional)</label>
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— None —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Est. unit cost (optional)</label>
          <input className="text-input" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 12.50" />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Tracking type</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="Good/Low">Good / Low / Need to Order</option>
            <option value="Quantity">Exact quantity count</option>
          </select>
        </div>
        {type === "Quantity" && (
          <>
            <div className="form-field">
              <label>Reorder threshold</label>
              <input className="text-input" type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="e.g. 10" />
            </div>
            <div className="form-field">
              <label>Unit (optional)</label>
              <input className="text-input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. per pack" />
            </div>
          </>
        )}
      </div>

      {type === "Quantity" && (
        <div className="form-row">
          <div className="form-field-note">Starting count on hand right now (optional — leave blank to check in later)</div>
        </div>
      )}
      {type === "Quantity" && (
        <div className="form-row">
          {locations.map((loc) => (
            <div className="form-field" key={loc}>
              <label>{loc} qty</label>
              <input className="text-input" type="number" value={qty[loc] ?? ""} onChange={(e) => setQty({ ...qty, [loc]: e.target.value })} />
            </div>
          ))}
        </div>
      )}

      <div className="form-row">
        <button className="btn btn-primary" disabled={!name}
          onClick={() => {
            onAdd(
              { name: desc ? name + " - " + desc : name, item: name, desc, cabinetIds, type,
                unit, threshold: type === "Quantity" ? Number(threshold) || 0 : null, thresholdDesc: "",
                categoryId, estimatedUnitCost: cost },
              type === "Quantity" ? qty : null
            );
            reset(); setOpen(false);
          }}>
          Add item
        </button>
        <button className="btn btn-secondary" onClick={() => { reset(); setOpen(false); }}>Cancel</button>
      </div>
    </div>
  );
}

/* ============================== BRANDING ============================== */
// Owner/admin screen for the practice's own branding. Slice 1 = logo upload +
// signed-URL preview (private practice-logos bucket, migration 0013). Color
// pickers + logo-based color auto-suggest arrive in the next slices.
function SettingsScreen({ practice, logoUrl, onUpload, onRemove, onSaveColors, onSaveTimezone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const hasCustom = !!practice?.logo_path;

  // Time zone: drives practice_today() + every displayed date. Save on change.
  const currentTz = practice?.timezone || "America/New_York";
  const [tzBusy, setTzBusy] = useState(false);
  const [tzErr, setTzErr] = useState("");
  const [tzSaved, setTzSaved] = useState(false);
  async function changeTimezone(tz) {
    setTzErr(""); setTzSaved(false); setTzBusy(true);
    try { await onSaveTimezone(tz); setTzSaved(true); }
    catch (ex) { setTzErr(ex.message || "Could not save time zone."); }
    finally { setTzBusy(false); }
  }

  // Colors: pre-fill from the practice's own values, else the Baybridge default
  // (so the owner edits from the current effective color). Re-sync when the
  // practice refreshes after a save/reset.
  const savedPrimary = practice?.primary_color || BAYBRIDGE_PRIMARY;
  const savedAccent = practice?.accent_color || BAYBRIDGE_ACCENT;
  const [primary, setPrimary] = useState(savedPrimary);
  const [accent, setAccent] = useState(savedAccent);
  const [colorBusy, setColorBusy] = useState(false);
  const [colorErr, setColorErr] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  useEffect(() => {
    setPrimary(practice?.primary_color || BAYBRIDGE_PRIMARY);
    setAccent(practice?.accent_color || BAYBRIDGE_ACCENT);
  }, [practice?.primary_color, practice?.accent_color]);

  const dirty = primary.toLowerCase() !== savedPrimary.toLowerCase() || accent.toLowerCase() !== savedAccent.toLowerCase();
  const hasCustomColors = !!(practice?.primary_color || practice?.accent_color);

  async function saveColorsClick() {
    setColorErr("");
    setColorBusy(true);
    try {
      await onSaveColors(primary, accent);
      setJustSaved(true);
    } catch (ex) {
      setColorErr(ex.message || "Could not save colors.");
    } finally {
      setColorBusy(false);
    }
  }
  async function resetColorsClick() {
    setColorErr("");
    setColorBusy(true);
    try {
      await onSaveColors(null, null); // null -> back to the Baybridge default
      setJustSaved(false);
    } catch (ex) {
      setColorErr(ex.message || "Could not reset colors.");
    } finally {
      setColorBusy(false);
    }
  }
  async function suggestFromLogoClick() {
    setColorErr("");
    setSuggesting(true);
    let url;
    try {
      url = await downloadLogoBlobUrl(practice.logo_path);
      const s = await suggestColorsFromImageUrl(url);
      if (s) { setPrimary(s.primary); setAccent(s.accent); setJustSaved(false); }
      else setColorErr("Couldn't pull usable colors from this logo — set them by hand.");
    } catch {
      setColorErr("Couldn't read colors from the logo — set them by hand.");
    } finally {
      if (url) URL.revokeObjectURL(url);
      setSuggesting(false);
    }
  }

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-selected after an error
    if (!file) return;
    setErr("");
    setBusy(true);
    try {
      await onUpload(file);
    } catch (ex) {
      setErr(ex.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setErr("");
    setBusy(true);
    try {
      await onRemove();
    } catch (ex) {
      setErr(ex.message || "Could not remove the logo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="view">
      <div className="view-header">
        <h1>Settings</h1>
        <p className="view-sub">Practice-wide settings — branding and time zone. Everyone on your team sees the branding; a practice with no logo shows the Baybridge default.</p>
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Time zone</h2></div>
        <p className="brand-logo-hint" style={{ margin: "0 0 10px" }}>
          Sets the practice's own "today" — check dates, order/receipt dates, and overdue flags all use this. Get it right before your team starts checking stock in.
        </p>
        <div className="brand-color-actions">
          <select className="select" value={currentTz} disabled={tzBusy}
            onChange={(e) => changeTimezone(e.target.value)} style={{ minWidth: 240 }}>
            {TIMEZONES.map(([tz, label]) => <option key={tz} value={tz}>{label}</option>)}
          </select>
          {tzBusy && <span className="brand-logo-hint" style={{ margin: 0 }}>Saving…</span>}
          {tzSaved && !tzBusy && <span className="brand-saved">Saved</span>}
        </div>
        {tzErr && <div className="warn-line" style={{ marginTop: 10 }}>{tzErr}</div>}
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Logo</h2></div>
        <div className="brand-logo-editor">
          <div className="brand-logo-preview">
            <img src={logoUrl || DEFAULT_LOGO_SRC} alt="Current logo" />
          </div>
          <div className="brand-logo-controls">
            <div className="brand-logo-btns">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} hidden />
              <button className="btn btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? "Working…" : hasCustom ? "Replace logo" : "Upload logo"}
              </button>
              {hasCustom && <button className="btn btn-secondary" disabled={busy} onClick={remove}>Remove</button>}
            </div>
            <p className="brand-logo-hint">
              PNG, JPG, or WebP · up to 2&nbsp;MB.{hasCustom ? "" : " No custom logo yet — showing the Baybridge default."}
            </p>
          </div>
        </div>
        {err && <div className="warn-line" style={{ marginTop: 12 }}>{err}</div>}
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Colors</h2></div>
        <div className="brand-colors">
          <label className="brand-color-field">
            <span>Primary</span>
            <span className="brand-color-input">
              <input type="color" value={primary} onChange={(e) => { setPrimary(e.target.value); setJustSaved(false); }} />
              <code>{primary}</code>
            </span>
          </label>
          <label className="brand-color-field">
            <span>Accent</span>
            <span className="brand-color-input">
              <input type="color" value={accent} onChange={(e) => { setAccent(e.target.value); setJustSaved(false); }} />
              <code>{accent}</code>
            </span>
          </label>
        </div>

        <div className="brand-color-preview">
          <div className="bcp-header" style={{ borderBottomColor: accent }}>
            <span style={{ color: primary, fontWeight: 800 }}>{practice?.name || "Your practice"}</span>
            <span className="bcp-tag" style={{ color: accent }}>Supply System</span>
          </div>
          <span className="bcp-btn" style={{ background: accent }}>Primary action</span>
          <span style={{ color: primary, fontWeight: 700, fontSize: "13px" }}>Headings &amp; key text</span>
        </div>

        <div className="brand-color-actions">
          <button className="btn btn-primary" disabled={colorBusy || !dirty} onClick={saveColorsClick}>{colorBusy ? "Saving…" : "Save colors"}</button>
          {practice?.logo_path && (
            <button className="btn btn-secondary" disabled={suggesting || colorBusy} onClick={suggestFromLogoClick}>
              {suggesting ? "Reading logo…" : "Suggest from logo"}
            </button>
          )}
          {hasCustomColors && <button className="btn btn-secondary" disabled={colorBusy} onClick={resetColorsClick}>Reset to Baybridge default</button>}
          {justSaved && !dirty && <span className="brand-saved">Saved</span>}
        </div>
        {practice?.logo_path && (
          <p className="brand-logo-hint" style={{ marginTop: 10 }}>
            “Suggest from logo” samples your logo's main colors as a starting point — results vary by logo, so review and adjust before saving.
          </p>
        )}
        {colorErr && <div className="warn-line" style={{ marginTop: 12 }}>{colorErr}</div>}
      </div>
    </div>
  );
}

// CSV bulk import (slice 3). File upload primary, paste-as-text fallback, a
// downloadable template, and a full validate-before-commit preview. The parse/
// validate logic and the atomic RPC do the real work (importItems + items.js);
// this is the flow around them.
function ImportItemsModal({ onClose, onImport, existingItems, categories, cabinetsByLoc, locationNames }) {
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { count } on success, { error } on failure

  const ctx = useMemo(() => ({ existingItems, categories, cabinetsByLoc, locationNames }), [existingItems, categories, cabinetsByLoc, locationNames]);

  function runParse(text, name) {
    setCsvText(text);
    setFileName(name || "");
    setResult(null);
    if (!String(text).trim()) { setPreview(null); return; }
    try {
      setPreview(parseCsv(text, ctx));
    } catch (e) {
      setPreview(null);
      setResult({ error: "Could not read that CSV: " + (e.message || e) });
    }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      runParse(await file.text(), file.name);
    } catch {
      setResult({ error: "Could not read that file." });
    }
  }

  function downloadTemplate() {
    const blob = new Blob([templateCsv()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "baybridge-items-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function doImport() {
    const payload = preview ? buildPayload(preview.rows) : [];
    if (!payload.length) return;
    setBusy(true);
    try {
      const count = await onImport(payload);
      setResult({ count });
    } catch (e) {
      setResult({ error: e.message || "Import failed." });
    } finally {
      setBusy(false);
    }
  }

  const done = result && result.count != null;
  const canImport = preview && !preview.missingNameColumn && preview.summary.toImport > 0 && !busy && !done;

  return (
    <>
      <div className="modal-backdrop" onClick={busy ? undefined : onClose} />
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Import items from CSV">
        <div className="modal-head">
          <h2>Import items from CSV</h2>
          <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        {done ? (
          <div className="import-done">
            <div className="import-done-count">{result.count}</div>
            <div>item{result.count === 1 ? "" : "s"} imported.</div>
            <button className="btn btn-primary" onClick={onClose} style={{ marginTop: 18 }}>Done</button>
          </div>
        ) : (
          <>
            <p className="import-intro">
              Columns: <code>name</code> (required), description, tracking_type (Good/Low or Quantity),
              cabinet, category, unit_cost, threshold, unit. Unknown categories import uncategorized;
              items already in your catalog are skipped.
              <button className="linklike" onClick={downloadTemplate}>Download template</button>
            </p>

            <div className="import-inputs">
              <label className="btn btn-secondary import-file-btn">
                Choose CSV file
                <input type="file" accept=".csv,text/csv" onChange={handleFile} hidden />
              </label>
              {fileName && <span className="import-filename">{fileName}</span>}
            </div>

            <details className="import-paste">
              <summary>…or paste CSV text</summary>
              <textarea
                className="text-input"
                rows={4}
                value={csvText}
                onChange={(e) => runParse(e.target.value, "")}
                placeholder="name,description,tracking_type,cabinet,category,unit_cost,threshold,unit"
              />
            </details>

            {result && result.error && <div className="warn-line" style={{ marginTop: 12 }}>{result.error}</div>}

            {preview && (
              <div className="import-preview">
                {preview.missingNameColumn && <div className="warn-line">No <code>name</code> column found — check the header row.</div>}
                {preview.unknownHeaders.length > 0 && (
                  <div className="import-note">Ignored unknown column{preview.unknownHeaders.length > 1 ? "s" : ""}: {preview.unknownHeaders.join(", ")}</div>
                )}
                <div className="import-summary">
                  <span className="import-chip ok">{preview.summary.toImport} to import</span>
                  {preview.summary.skipped > 0 && <span className="import-chip warn">{preview.summary.skipped} skipped</span>}
                  {preview.summary.errors > 0 && <span className="import-chip err">{preview.summary.errors} error{preview.summary.errors > 1 ? "s" : ""}</span>}
                </div>
                <div className="import-rows">
                  {preview.rows.map((r) => (
                    <div className={"import-row import-" + (r.skip ? "skip" : r.status)} key={r.line}>
                      <div className="import-row-main">
                        <span className="import-row-name">{(r.resolved?.name) || String(r.raw.name || "").trim() || "(no name)"}</span>
                        <span className="import-row-msg">{r.messages.join(" ")}</span>
                      </div>
                      <span className="import-row-tag">{r.skip ? "skip" : r.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={doImport} disabled={!canImport}>
                {busy ? "Importing…" : preview ? `Import ${preview.summary.toImport} item${preview.summary.toImport === 1 ? "" : "s"}` : "Import"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function ManageItems({ items, onAdd, onUpdate, onDelete, onBulkImport, locations, categories, cabinetsByLoc, canDelete }) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const catById = useMemo(() => Object.fromEntries((categories || []).map((c) => [c.id, c.name])), [categories]);
  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="view">
      <div className="view-header">
        <h1>Manage items</h1>
        <p className="view-sub">Add new supplies, set a different cabinet per location, switch tracking type, or remove items you no longer stock.</p>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Add items</h2>
          <button className="btn btn-secondary btn-tiny" onClick={() => setImportOpen(true)}>Import CSV</button>
        </div>
        <AddItemForm onAdd={onAdd} locations={locations} categories={categories} cabinetsByLoc={cabinetsByLoc} />
      </div>

      {importOpen && (
        <ImportItemsModal
          onClose={() => setImportOpen(false)}
          onImport={onBulkImport}
          existingItems={items}
          categories={categories}
          cabinetsByLoc={cabinetsByLoc}
          locationNames={locations}
        />
      )}

      <div className="panel">
        <div className="panel-header">
          <h2>All items</h2>
          <span className="pill">{items.length} total</span>
        </div>
        <input className="text-input" placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12 }} />
        <div className="manage-list">
          {filtered.map((item) => (
            <div className="manage-row" key={item.id}>
              {editingId === item.id ? (
                <EditItemInline item={item} onSave={(patch) => { onUpdate(item.id, patch); setEditingId(null); }} onCancel={() => setEditingId(null)} locations={locations} categories={categories} cabinetsByLoc={cabinetsByLoc} />
              ) : (
                <>
                  <div className="manage-main">
                    <div className="flag-name">{item.name}</div>
                    <div className="flag-meta">
                      {locations.map((loc) => loc + ": " + (item.cabinets[loc] || "—")).join("  ·  ")}
                    </div>
                    <div className="flag-meta muted">
                      {item.categoryId && catById[item.categoryId] ? catById[item.categoryId] + " · " : ""}
                      {item.type === "Quantity" ? "Exact qty · threshold " + item.threshold : "Good / Low"}
                      {item.estimatedUnitCost !== "" && item.estimatedUnitCost != null ? " · ~$" + item.estimatedUnitCost + "/unit" : ""}
                    </div>
                  </div>
                  <div className="manage-actions">
                    <button className="btn btn-secondary btn-tiny" onClick={() => setEditingId(item.id)}>Edit</button>
                    {confirmDeleteId === item.id ? (
                      <>
                        <button className="btn btn-danger btn-tiny" onClick={() => { onDelete(item.id); setConfirmDeleteId(null); }}>Confirm delete</button>
                        <button className="btn btn-secondary btn-tiny" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                      </>
                    ) : canDelete ? (
                      <button className="btn btn-secondary btn-tiny" onClick={() => setConfirmDeleteId(item.id)}>Delete</button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          ))}
          {filtered.length === 0 && <div className="empty-state">No items match that search.</div>}
        </div>
      </div>
    </div>
  );
}

function EditItemInline({ item, onSave, onCancel, locations, categories, cabinetsByLoc }) {
  const [type, setType] = useState(item.type);
  const [threshold, setThreshold] = useState(item.threshold ?? "");
  const [unit, setUnit] = useState(item.unit || "");
  const [categoryId, setCategoryId] = useState(item.categoryId || "");
  const [cost, setCost] = useState(item.estimatedUnitCost ?? "");
  // The item stores cabinet LABELS per location; resolve each to that location's
  // label id for the dropdowns (labels are unique per location).
  const [cabinetIds, setCabinetIds] = useState(() => {
    const m = {};
    for (const loc of locations) {
      const label = item.cabinets[loc];
      const opt = (cabinetsByLoc[loc] || []).find((c) => c.label === label);
      m[loc] = opt ? opt.id : "";
    }
    return m;
  });

  return (
    <div className="edit-inline">
      <CabinetInputs cabinetIds={cabinetIds} onChange={setCabinetIds} locations={locations} cabinetsByLoc={cabinetsByLoc} />
      <div className="form-row">
        <div className="form-field">
          <label>Category</label>
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— None —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Est. unit cost</label>
          <input className="text-input" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 12.50" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Tracking type</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="Good/Low">Good / Low / Need to Order</option>
            <option value="Quantity">Exact quantity count</option>
          </select>
        </div>
        {type === "Quantity" && (
          <>
            <div className="form-field">
              <label>Reorder threshold</label>
              <input className="text-input" type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Unit</label>
              <input className="text-input" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </>
        )}
      </div>
      <div className="form-row">
        <button className="btn btn-primary btn-tiny" onClick={() => onSave({ type, cabinetIds, threshold: type === "Quantity" ? Number(threshold) || 0 : null, unit, categoryId, estimatedUnitCost: cost })}>Save</button>
        <button className="btn btn-secondary btn-tiny" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ============================== APP SHELL ============================== */
export function MainApp({ profile, practice, onSignOut, onPracticeRefresh }) {
  // Items + distributors are real Supabase tables (step 3a). The remaining
  // entities (checks/shipments/transfers/queue, plus the staff pick-list) are
  // still on the localStorage blob and get migrated in later slices (3b–3e).

  const [view, setView] = useState("dashboard");
  const [activeLocation, setActiveLocation] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The header logo is a private storage object, so resolve a signed URL from
  // practices.logo_path whenever it changes. Falls back (in the header) to
  // logo_url, then the Baybridge default. Re-signs on refresh after upload.
  const [resolvedLogo, setResolvedLogo] = useState(null);
  useEffect(() => {
    let active = true;
    if (practice?.logo_path) {
      signedLogoUrl(practice.logo_path).then((url) => { if (active) setResolvedLogo(url); });
    } else {
      setResolvedLogo(null);
    }
    return () => { active = false; };
  }, [practice?.logo_path]);
  const headerLogo = resolvedLogo || practice?.logo_url || null;

  // Locations come from the practice's own Supabase table (step 2) — the first
  // real table wiring. `locations` holds the full rows; `locationNames` is the
  // array of names the rest of the (still blob-based) app iterates over.
  const [locations, setLocations] = useState(null);
  const [locationsError, setLocationsError] = useState("");
  const reloadLocations = useCallback(async () => {
    if (!practice?.id) return;
    try {
      const rows = await fetchLocations(practice.id);
      setLocations(rows);
    } catch (e) {
      setLocationsError(e.message || "Could not load locations.");
      setLocations([]);
    }
  }, [practice?.id]);

  useEffect(() => { reloadLocations(); }, [reloadLocations]);

  const locationNames = useMemo(() => (locations || []).map((l) => l.name), [locations]);

  // Keep activeLocation valid as locations load/change.
  useEffect(() => {
    if (!locationNames.length) return;
    if (!activeLocation || !locationNames.includes(activeLocation)) {
      setActiveLocation(locationNames[0]);
    }
  }, [locationNames, activeLocation]);

  // Items load from Supabase (with per-location cabinets). Needs `locations`
  // first, to translate item_cabinets' location_id back to a location name.
  const [items, setItems] = useState(null);
  const reloadItems = useCallback(async () => {
    if (!practice?.id || locations === null) return;
    try {
      setItems(await fetchItems(practice.id, locations));
    } catch (e) {
      console.error("Failed to load items:", e.message);
      setItems([]);
    }
  }, [practice?.id, locations]);
  useEffect(() => { reloadItems(); }, [reloadItems]);
  const itemList = items || [];

  // Distributors pick-list from Supabase. Components still consume plain names.
  const [distributorRows, setDistributorRows] = useState(null);
  const reloadDistributors = useCallback(async () => {
    if (!practice?.id) return;
    try {
      setDistributorRows(await fetchDistributors(practice.id));
    } catch (e) {
      console.error("Failed to load distributors:", e.message);
      setDistributorRows([]);
    }
  }, [practice?.id]);
  useEffect(() => { reloadDistributors(); }, [reloadDistributors]);
  const distributors = useMemo(() => (distributorRows || []).map((d) => d.name), [distributorRows]);

  // Practice members (0020) — role management is owner/admin-only.
  const [members, setMembers] = useState([]);
  const reloadMembers = useCallback(async () => {
    if (!practice?.id) return;
    try {
      setMembers(await fetchMembers(practice.id));
    } catch (e) {
      console.error("Failed to load members:", e.message);
      setMembers([]);
    }
  }, [practice?.id]);
  useEffect(() => { reloadMembers(); }, [reloadMembers]);

  const handleChangeMemberRole = useCallback(async (profileId, role) => {
    try {
      await setMemberRole(profileId, role);
      await reloadMembers();
      return true;
    } catch (e) {
      return { error: e.message || "Couldn't change that member's role." };
    }
  }, [reloadMembers]);

  // Item categories (0008) — practice-scoped, flat list.
  const [categoryRows, setCategoryRows] = useState(null);
  const reloadCategories = useCallback(async () => {
    if (!practice?.id) return;
    try { setCategoryRows(await fetchCategories(practice.id)); }
    catch (e) { console.error("Failed to load categories:", e.message); setCategoryRows([]); }
  }, [practice?.id]);
  useEffect(() => { reloadCategories(); }, [reloadCategories]);
  const categories = useMemo(() => categoryRows || [], [categoryRows]);

  // Per-location cabinet labels (managed list, 0015). RLS scopes the select to
  // the caller's locations. Grouped by location NAME for the item-form dropdowns
  // and the Locations Cabinets editor.
  const [cabinetRows, setCabinetRows] = useState(null);
  const reloadCabinets = useCallback(async () => {
    if (!practice?.id) return;
    try { setCabinetRows(await fetchLocationCabinets()); }
    catch (e) { console.error("Failed to load cabinets:", e.message); setCabinetRows([]); }
  }, [practice?.id]);
  useEffect(() => { reloadCabinets(); }, [reloadCabinets]);
  const cabinetsByLoc = useMemo(() => {
    const idToName = Object.fromEntries((locations || []).map((l) => [l.id, l.name]));
    const m = {};
    for (const c of cabinetRows || []) {
      const name = idToName[c.location_id];
      if (name) (m[name] = m[name] || []).push(c);
    }
    return m;
  }, [cabinetRows, locations]);

  // Shipments (+ their per-location split) and transfers from Supabase. Both
  // reloads depend on `locations` so a rename re-translates them (per 0003).
  const [shipmentsData, setShipmentsData] = useState(null);
  const reloadShipments = useCallback(async () => {
    if (!practice?.id || locations === null) return;
    try { setShipmentsData(await fetchShipments(practice.id, locations)); }
    catch (e) { console.error("Failed to load shipments:", e.message); setShipmentsData([]); }
  }, [practice?.id, locations]);
  useEffect(() => { reloadShipments(); }, [reloadShipments]);
  const shipments = shipmentsData || [];

  const [transfersData, setTransfersData] = useState(null);
  const reloadTransfers = useCallback(async () => {
    if (!practice?.id || locations === null) return;
    try { setTransfersData(await fetchTransfers(practice.id, locations)); }
    catch (e) { console.error("Failed to load transfers:", e.message); setTransfersData([]); }
  }, [practice?.id, locations]);
  useEffect(() => { reloadTransfers(); }, [reloadTransfers]);
  const transfers = transfersData || [];

  // Ordering queue (queue_entries + queue_locations) from Supabase.
  const [queueData, setQueueData] = useState(null);
  const reloadQueue = useCallback(async () => {
    if (!practice?.id || locations === null) return;
    try { setQueueData(await fetchQueue(practice.id, locations)); }
    catch (e) { console.error("Failed to load queue:", e.message); setQueueData([]); }
  }, [practice?.id, locations]);
  useEffect(() => { reloadQueue(); }, [reloadQueue]);
  const queue = queueData || [];

  // Check-ins (one row per item+location) from Supabase. The displayed date is
  // derived in the practice's timezone, so it needs practice.timezone as well.
  const [checksData, setChecksData] = useState(null);
  const reloadChecks = useCallback(async () => {
    if (!practice?.id || locations === null) return;
    try { setChecksData(await fetchChecks(practice.id, locations, practice?.timezone)); }
    catch (e) { console.error("Failed to load check-ins:", e.message); setChecksData({}); }
  }, [practice?.id, practice?.timezone, locations]);
  useEffect(() => { reloadChecks(); }, [reloadChecks]);
  const checks = checksData || {};

  // The practice's own "today" (timezone-aware), fetched once and reused for
  // app-written dates like a queue entry's flagged date.
  const [today, setToday] = useState(null);
  useEffect(() => {
    let active = true;
    if (practice?.id) practiceToday(practice.id).then((d) => { if (active) setToday(d); });
    return () => { active = false; };
  }, [practice?.id]);

  const ready = locations !== null && items !== null && distributorRows !== null
    && shipmentsData !== null && transfersData !== null && categoryRows !== null && cabinetRows !== null
    && queueData !== null && checksData !== null;

  // Save a check-in to Supabase. counted_qty vs status is chosen by tracking type.
  // If it lands the item at "Need to Order", flag the ordering queue (Supabase).
  const handleSaveCheck = useCallback(async (item, location, patch) => {
    const key = keyFor(location, item.id);
    const nextCheck = { ...(checks[key] || {}), ...patch };
    const isQty = item.type === "Quantity";
    try {
      await saveCheck(practice.id, item.id, location, {
        counted_qty: isQty ? (nextCheck.count === "" || nextCheck.count == null ? null : Number(nextCheck.count)) : null,
        status: isQty ? null : (nextCheck.status || null),
        notes: nextCheck.notes || null,
      }, locations, { performedBy: profile?.id });
      await reloadChecks();
    } catch (e) {
      console.error("Failed to save check-in:", e.message);
      return;
    }

    const status = effectiveStatus(item, nextCheck);
    if (status === "Need to Order") {
      const detail = {
        qty: isQty ? nextCheck.count : null,
        reason: isQty
          ? "Counted " + nextCheck.count + " (threshold " + item.threshold + ")"
          : "Marked Need to Order on location check",
      };
      try {
        await flagQueueLocation(practice.id, item.id, location, detail, locations, { performedBy: profile?.id, flaggedDate: today });
        await reloadQueue();
      } catch (e) {
        console.error("Failed to flag item for the ordering queue:", e.message);
      }
    }
  }, [checks, practice?.id, locations, profile?.id, today, reloadChecks, reloadQueue]);

  // Log a new order: atomic shipment + split via the create_shipment RPC (0007).
  const handleAddShipment = useCallback(async (shipment) => {
    try {
      await createShipment(shipment.itemId, shipment, locations);
      await reloadShipments();
    } catch (e) {
      console.error("Failed to log shipment:", e.message);
    }
  }, [locations, reloadShipments]);

  // A shipment update is one of two things: editing its per-location split (a
  // plain multi-row write) or marking it Received. "Received" goes through the
  // receive_shipment RPC (0007), which atomically flips the status AND creates
  // the pending transfers for every non-ship-to location — so a received
  // shipment can never silently skip its transfers.
  const handleUpdateShipment = useCallback(async (id, patch) => {
    try {
      if (patch.status === "Received") {
        await receiveShipment(id, null);          // RPC computes the timezone-correct date
        await reloadShipments();
        await reloadTransfers();
      } else if ("split" in patch) {
        await updateShipmentSplit(id, patch.split, locations);
        await reloadShipments();
      }
    } catch (e) {
      console.error("Failed to update shipment:", e.message);
    }
  }, [locations, reloadShipments, reloadTransfers]);

  // Confirm a transfer arrived. Single-table update + best-effort audit; sets
  // performed_by to the current user (no staff dropdown).
  const handleUpdateTransfer = useCallback(async (id) => {
    try {
      await confirmTransfer(id, { performedBy: profile?.id, practiceId: practice?.id });
      await reloadTransfers();
    } catch (e) {
      console.error("Failed to confirm transfer:", e.message);
    }
  }, [profile?.id, practice?.id, reloadTransfers]);

  // Update a queue entry. Field edits and location-set changes are direct writes;
  // the moment it becomes ready-to-order ("Ordered" + distributor + qty), the
  // shipment is created via the ATOMIC create_shipment_from_queue RPC (0007),
  // which reads the entry + its locations, even-splits, creates the shipment +
  // split, and flags the entry — all in one transaction.
  const handleUpdateQueue = useCallback(async (id, patch) => {
    const existing = queue.find((q) => q.id === id);
    if (!existing) return;
    try {
      if ("locations" in patch) {
        await setQueueLocations(id, patch.locations, patch.details, locations);
      } else {
        await updateQueueFields(id, patch);
      }
      const next = { ...existing, ...patch };
      const readyToOrder = next.distributor && Number(next.qtyToOrder) > 0;
      if (next.status === "Ordered" && readyToOrder && !next.shipmentCreated) {
        await orderQueueEntry(id);        // atomic shipment + split + queue flag
        await reloadShipments();
      }
      await reloadQueue();
    } catch (e) {
      console.error("Failed to update queue entry:", e.message);
    }
  }, [queue, locations, reloadQueue, reloadShipments]);

  // Bulk "mark as Ordered" for a set of pending queue entries. Each ready entry
  // (distributor + qty) auto-logs a shipment via the same atomic RPC as the
  // single-row path; the rest just move to Ordered. One reload at the end.
  const handleBulkOrderQueue = useCallback(async (ids) => {
    let anyShipment = false;
    for (const id of ids) {
      const existing = queue.find((q) => q.id === id);
      if (!existing || existing.status === "Ordered") continue;
      try {
        await updateQueueFields(id, { status: "Ordered" });
        const ready = existing.distributor && Number(existing.qtyToOrder) > 0;
        if (ready && !existing.shipmentCreated) { await orderQueueEntry(id); anyShipment = true; }
      } catch (e) {
        console.error(`Failed to mark queue entry ${id} ordered:`, e.message);
      }
    }
    await reloadQueue();
    if (anyShipment) await reloadShipments();
  }, [queue, reloadQueue, reloadShipments]);

  const handleManualQueueAdd = useCallback(async (itemId, locationsToAdd) => {
    try {
      for (const loc of locationsToAdd) {
        await flagQueueLocation(practice.id, itemId, loc, { qty: null, reason: "Manually added to queue" }, locations,
          { performedBy: profile?.id, flaggedDate: today });
      }
      await reloadQueue();
      return true;
    } catch (e) {
      console.error("Failed to add to queue:", e.message);
      return false;
    }
  }, [practice?.id, locations, profile?.id, today, reloadQueue]);

  const handleAddItem = useCallback(async (itemData, initialQty) => {
    try {
      const newId = await createItem(practice.id, itemData, locations);
      await reloadItems();

      // Initial on-hand counts are check-ins — write them to Supabase as checks.
      if (initialQty) {
        for (const loc of locationNames) {
          if (initialQty[loc] !== "" && initialQty[loc] !== undefined) {
            await saveCheck(practice.id, newId, loc, { counted_qty: Number(initialQty[loc]), status: null, notes: null },
              locations, { performedBy: profile?.id });
          }
        }
        await reloadChecks();
      }
    } catch (e) {
      console.error("Failed to add item:", e.message);
    }
  }, [practice?.id, locations, reloadItems, locationNames, profile?.id, reloadChecks]);

  const handleUpdateItem = useCallback(async (id, patch) => {
    try {
      await updateItem(id, patch, locations);
      await reloadItems();
    } catch (e) {
      console.error("Failed to update item:", e.message);
    }
  }, [locations, reloadItems]);

  const handleDeleteItem = useCallback(async (id) => {
    try {
      await deleteItem(id);
      await reloadItems();
    } catch (e) {
      console.error("Failed to delete item:", e.message);
    }
  }, [reloadItems]);

  // Bulk CSV import. Lets the error propagate so the modal can surface it; the
  // RPC is atomic, so a failure means nothing was imported.
  const handleBulkImport = useCallback(async (payload) => {
    const count = await bulkImportItems(payload);
    await reloadItems();
    return count;
  }, [reloadItems]);

  // Logo upload/remove. Errors propagate to the Branding screen. After either,
  // refresh the practice so logo_path (and the re-signed header logo) update.
  const handleUploadLogo = useCallback(async (file) => {
    await uploadLogo(practice.id, file, practice.logo_path);
    await onPracticeRefresh?.();
  }, [practice?.id, practice?.logo_path, onPracticeRefresh]);

  const handleRemoveLogo = useCallback(async () => {
    await removeLogo(practice.id, practice.logo_path);
    await onPracticeRefresh?.();
  }, [practice?.id, practice?.logo_path, onPracticeRefresh]);

  // Save brand colors (hex to customize, null to reset a column to default).
  const handleSaveColors = useCallback(async (primary, accent) => {
    await saveColors(practice.id, primary, accent);
    await onPracticeRefresh?.();
  }, [practice?.id, onPracticeRefresh]);

  const handleSaveTimezone = useCallback(async (tz) => {
    await savePracticeTimezone(practice.id, tz);
    await onPracticeRefresh?.();
  }, [practice?.id, onPracticeRefresh]);

  const handleAddDistributor = useCallback(async (fields) => {
    const name = (fields?.name || "").trim();
    if (!name) return { error: "Enter a distributor name." };
    if (distributors.some((d) => d.toLowerCase() === name.toLowerCase())) {
      return { error: `"${name}" is already in the directory.` };
    }
    try {
      await createDistributor(practice.id, fields);
      await reloadDistributors();
      return {};
    } catch (e) {
      console.error("Failed to add distributor:", e.message);
      return { error: e.message || "Could not add distributor." };
    }
  }, [distributors, practice?.id, reloadDistributors]);

  const handleUpdateDistributor = useCallback(async (id, fields) => {
    try {
      await updateDistributor(id, fields);
      await reloadDistributors();
      return {};
    } catch (e) {
      console.error("Failed to update distributor:", e.message);
      return { error: e.message || "Could not update distributor." };
    }
  }, [reloadDistributors]);

  const handleRemoveDistributor = useCallback(async (id) => {
    try {
      await deleteDistributor(id);
      await reloadDistributors();
    } catch (e) {
      console.error("Failed to remove distributor:", e.message);
    }
  }, [reloadDistributors]);

  const locCounts = useMemo(() => {
    const c = {};
    locationNames.forEach((loc) => {
      let n = 0;
      itemList.forEach((item) => {
        if (item.type === "Quantity") {
          const stock = liveStock(item, loc, checks, shipments, transfers);
          if (invStatus(item, stock) === "REORDER NOW") n++;
        } else {
          const st = effectiveStatus(item, checks[keyFor(loc, item.id)]);
          if (st === "Need to Order") n++;
        }
      });
      c[loc] = n;
    });
    return c;
  }, [itemList, checks, shipments, transfers, locationNames]);

  // ---- Location CRUD (writes to Supabase, then reloads) ----------------------
  // Uniqueness is enforced in the DB (migration 0005) and pre-checked here so the
  // user sees a friendly message instead of a raw constraint error.
  const handleAddLocation = useCallback(async (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return { error: "Enter a location name." };
    if (nameTaken(locations || [], trimmed)) return { error: `"${trimmed}" already exists.` };
    try {
      await createLocation(practice.id, trimmed, (locations || []).length);
      await reloadLocations();
      return {};
    } catch (e) {
      return { error: /duplicate|unique/i.test(e.message || "") ? `"${trimmed}" already exists.` : (e.message || "Could not add location.") };
    }
  }, [locations, practice?.id, reloadLocations]);

  const handleRenameLocation = useCallback(async (id, name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return { error: "Enter a location name." };
    if (nameTaken(locations || [], trimmed, id)) return { error: `"${trimmed}" already exists.` };
    try {
      await renameLocation(id, trimmed);
      await reloadLocations();
      return {};
    } catch (e) {
      return { error: /duplicate|unique/i.test(e.message || "") ? `"${trimmed}" already exists.` : (e.message || "Could not rename location.") };
    }
  }, [locations, reloadLocations]);

  const handleDeleteLocation = useCallback(async (id) => {
    if ((locations || []).length <= 1) return { error: "A practice must keep at least one location." };
    try {
      await deleteLocation(id);
      await reloadLocations();
      return {};
    } catch (e) {
      return { error: e.message || "Could not delete location." };
    }
  }, [locations, reloadLocations]);

  const handleReorderLocations = useCallback(async (orderedIds) => {
    // Optimistic: reflect the new order immediately, then persist.
    setLocations((prev) => {
      if (!prev) return prev;
      const byId = Object.fromEntries(prev.map((l) => [l.id, l]));
      return orderedIds.map((id) => byId[id]).filter(Boolean);
    });
    try {
      await saveLocationOrder(orderedIds);
      await reloadLocations();
    } catch {
      await reloadLocations();
    }
  }, [reloadLocations]);

  const handleSaveLocationAddresses = useCallback(async (id, physical, billing) => {
    await saveLocationAddresses(id, physical, billing);
    await reloadLocations();
  }, [reloadLocations]);

  const handleAddCabinet = useCallback(async (locationId, label) => {
    const trimmed = (label || "").trim();
    if (!trimmed) return { error: "Enter a cabinet label." };
    if (cabinetLabelTaken(cabinetRows || [], locationId, trimmed)) return { error: `"${trimmed}" already exists at this location.` };
    try { await addCabinet(locationId, trimmed); await reloadCabinets(); return {}; }
    catch (e) { return { error: /duplicate|unique/i.test(e.message || "") ? `"${trimmed}" already exists at this location.` : (e.message || "Could not add cabinet.") }; }
  }, [cabinetRows, reloadCabinets]);

  const handleRenameCabinet = useCallback(async (id, locationId, label) => {
    const trimmed = (label || "").trim();
    if (!trimmed) return { error: "Enter a cabinet label." };
    if (cabinetLabelTaken(cabinetRows || [], locationId, trimmed, id)) return { error: `"${trimmed}" already exists at this location.` };
    try { await renameCabinet(id, trimmed); await reloadCabinets(); await reloadItems(); return {}; }
    catch (e) { return { error: /duplicate|unique/i.test(e.message || "") ? `"${trimmed}" already exists at this location.` : (e.message || "Could not rename cabinet.") }; }
  }, [cabinetRows, reloadCabinets, reloadItems]);

  const handleDeleteCabinet = useCallback(async (id) => {
    try { await deleteCabinet(id); await reloadCabinets(); await reloadItems(); return {}; }
    catch (e) { return { error: e.message || "Could not delete cabinet." }; }
  }, [reloadCabinets, reloadItems]);

  const handleCopyCabinets = useCallback(async (fromLocationId, toLocationId) => {
    try { const n = await copyCabinets(fromLocationId, toLocationId); await reloadCabinets(); return { count: n }; }
    catch (e) { return { error: e.message || "Could not copy cabinets." }; }
  }, [reloadCabinets]);

  // ---- Category CRUD (same shape as locations) --------------------------------
  const handleAddCategory = useCallback(async (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return { error: "Enter a category name." };
    if (categoryNameTaken(categoryRows || [], trimmed)) return { error: `"${trimmed}" already exists.` };
    try {
      await createCategory(practice.id, trimmed, (categoryRows || []).length);
      await reloadCategories();
      return {};
    } catch (e) {
      return { error: /duplicate|unique/i.test(e.message || "") ? `"${trimmed}" already exists.` : (e.message || "Could not add category.") };
    }
  }, [categoryRows, practice?.id, reloadCategories]);

  const handleRenameCategory = useCallback(async (id, name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return { error: "Enter a category name." };
    if (categoryNameTaken(categoryRows || [], trimmed, id)) return { error: `"${trimmed}" already exists.` };
    try {
      await renameCategory(id, trimmed);
      await reloadCategories();
      // an item's category name is denormalized in the item list via catById,
      // which reads from `categories`, so reloading categories is enough.
      return {};
    } catch (e) {
      return { error: /duplicate|unique/i.test(e.message || "") ? `"${trimmed}" already exists.` : (e.message || "Could not rename category.") };
    }
  }, [categoryRows, reloadCategories]);

  const handleDeleteCategory = useCallback(async (id) => {
    try {
      await deleteCategory(id);
      await reloadCategories();
      await reloadItems();          // items in this category are now uncategorized (category_id -> null)
      return {};
    } catch (e) {
      return { error: e.message || "Could not delete category." };
    }
  }, [reloadCategories, reloadItems]);

  const handleReorderCategories = useCallback(async (orderedIds) => {
    setCategoryRows((prev) => {
      if (!prev) return prev;
      const byId = Object.fromEntries(prev.map((c) => [c.id, c]));
      return orderedIds.map((id) => byId[id]).filter(Boolean);
    });
    try {
      await saveCategoryOrder(orderedIds);
      await reloadCategories();
    } catch {
      await reloadCategories();
    }
  }, [reloadCategories]);

  const totalFlagged = Object.values(locCounts).reduce((a, b) => a + b, 0);
  const pendingQueue = queue.filter((q) => q.status === "Pending").length;
  const pendingTransfers = transfers.filter((t) => t.status === "Pending").length;
  // Outright deletion of managed entities is owner/admin-only (RLS 0016 enforces
  // it; this hides the buttons so staff don't hit a rejected action).
  const canManage = profile?.role === "owner" || profile?.role === "admin";

  if (!ready) {
    return (
      <div className="app-loading">
        <style>{STYLES}</style>
        <img src={DEFAULT_LOGO_SRC} alt="" className="loading-logo" />
        <div className="spinner" />
        <div>Loading supply data…</div>
      </div>
    );
  }

  // Safety net: a practice should never have zero locations (0005 seeds a default
  // and backfills existing ones), but if it somehow does, guide setup instead of
  // rendering screens that all iterate over an empty location list.
  if (locations.length === 0) {
    return <LocationSetup practiceName={practice?.name} onAdd={handleAddLocation} onSignOut={onSignOut} error={locationsError} />;
  }

  return (
    <div className="app-root">
      <style>{STYLES}</style>
      {practiceBrandCss(practice) && <style>{practiceBrandCss(practice)}</style>}
      <Header onMenuClick={() => setDrawerOpen(true)} practiceName={practice?.name} practiceLogo={headerLogo}
        profile={profile} practice={practice} onSignOut={onSignOut} />

      <div className="app-shell">
        <SideDrawer open={drawerOpen} view={view} setView={setView} onClose={() => setDrawerOpen(false)} pendingTransfers={pendingTransfers} role={profile?.role} />

        <main className="main-panel">
          {view === "dashboard" && (
            <Dashboard items={itemList} checks={checks} shipments={shipments} transfers={transfers} queue={queue} setView={setView} setActiveLocation={setActiveLocation} locations={locationNames} practiceName={practice?.name} today={today}
              onConfirmTransfer={handleUpdateTransfer} onReceiveShipment={(id) => handleUpdateShipment(id, { status: "Received" })} />
          )}
          {view === "checkin" && (
            <CheckIn items={itemList} checks={checks} activeLocation={activeLocation} setActiveLocation={setActiveLocation}
              onSaveCheck={handleSaveCheck} locCounts={locCounts} locations={locationNames} />
          )}
          {view === "shipments" && (
            <ShipmentsView items={itemList} shipments={shipments} distributors={distributors}
              onAdd={handleAddShipment} onUpdate={handleUpdateShipment} locations={locationNames} />
          )}
          {view === "queue" && (
            <QueueView items={itemList} queue={queue} distributors={distributors}
              onUpdate={handleUpdateQueue} onManualAdd={handleManualQueueAdd} onBulkOrder={handleBulkOrderQueue} locations={locationNames} />
          )}
          {view === "inventory" && (
            <InventoryView items={itemList} checks={checks} shipments={shipments} transfers={transfers} locations={locationNames} />
          )}
          {view === "items" && (
            <ManageItems items={itemList} onAdd={handleAddItem} onUpdate={handleUpdateItem} onDelete={handleDeleteItem} onBulkImport={handleBulkImport} locations={locationNames} categories={categories} cabinetsByLoc={cabinetsByLoc} canDelete={canManage} />
          )}
          {view === "locations" && (
            <LocationsManager locations={locations} onAdd={handleAddLocation} onRename={handleRenameLocation}
              onDelete={handleDeleteLocation} onReorder={handleReorderLocations} onSaveAddresses={handleSaveLocationAddresses}
              cabinetsByLoc={cabinetsByLoc} onAddCabinet={handleAddCabinet} onRenameCabinet={handleRenameCabinet}
              onDeleteCabinet={handleDeleteCabinet} onCopyCabinets={handleCopyCabinets} canManage={canManage} />
          )}
          {view === "categories" && (
            <CategoriesManager categories={categories} onAdd={handleAddCategory} onRename={handleRenameCategory}
              onDelete={handleDeleteCategory} onReorder={handleReorderCategories} canManage={canManage} />
          )}
          {view === "distributors" && (
            <DistributorsScreen distributorRows={distributorRows || []}
              onAdd={handleAddDistributor} onUpdate={handleUpdateDistributor} onRemove={handleRemoveDistributor} canDelete={canManage} />
          )}
          {view === "transfers" && (
            <TransfersView items={itemList} transfers={transfers} onUpdate={handleUpdateTransfer} />
          )}
          {view === "settings" && (profile?.role === "owner" || profile?.role === "admin") && (
            <SettingsScreen practice={practice} logoUrl={headerLogo} onUpload={handleUploadLogo} onRemove={handleRemoveLogo} onSaveColors={handleSaveColors} onSaveTimezone={handleSaveTimezone} />
          )}
          {view === "members" && (profile?.role === "owner" || profile?.role === "admin") && (
            <MembersScreen members={members} currentUserId={profile?.id} onChangeRole={handleChangeMemberRole} />
          )}
          {view === "help" && <HelpScreen />}
        </main>
      </div>

      <div className="bottom-bar">
        <nav className="bottom-nav">
          <NavItem icon={<Icon name="dashboard" />} label="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")} count={totalFlagged} />
          <NavItem icon={<Icon name="checkin" />} label="Check-in" active={view === "checkin"} onClick={() => setView("checkin")} />
          <NavItem icon={<Icon name="shipments" />} label="Shipments" active={view === "shipments"} onClick={() => setView("shipments")} />
          <NavItem icon={<Icon name="queue" />} label="Queue" active={view === "queue"} onClick={() => setView("queue")} count={pendingQueue} />
        </nav>
        <div className="powered-strip">Powered by <span>Baybridge</span></div>
      </div>
    </div>
  );
}

/* ============================== STYLES ============================== */
const STYLES = `
:root {
  /* Baybridge platform defaults (navy + teal). An un-customized practice sees
     this look; a practice with its own primary_color/accent_color overrides
     --ink / --brand-green at runtime (see practiceBrandCss). */
  --ink: #14263D;
  --ink-2: #2C4A6B;
  --ink-soft: #66738F;
  --paper: #F5F7FA;
  --card: #FFFFFF;
  --line: #E1E6EE;
  --brand-green: #4089A2;
  --brand-green-dark: #35748A;
  --good: #4C8A3F;
  --good-bg: #E9F2E2;
  --low: #B0762A;
  --low-bg: #FBF0DC;
  --reorder: #C0392B;
  --reorder-bg: #FBE6E3;
}

* { box-sizing: border-box; }

.app-root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: var(--paper);
  color: var(--ink);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding-bottom: 90px;
}

.app-loading {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; color: var(--ink-soft); background: var(--paper);
}
.spinner { width: 28px; height: 28px; border: 3px solid var(--line); border-top-color: var(--ink); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.app-body { flex: 1; }
.main-panel { max-width: 880px; margin: 0 auto; padding: 20px 16px 40px; }

.view-header { margin-bottom: 18px; }
.view-header h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px; letter-spacing: -0.01em; }
.view-sub { font-size: 13px; color: var(--ink-soft); margin: 0; line-height: 1.45; }

.card-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 18px; }
@media (min-width: 640px) { .card-grid { grid-template-columns: repeat(4, 1fr); } }

.loc-card {
  background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px;
  text-align: left; cursor: pointer; transition: box-shadow 0.15s, transform 0.15s;
}
.loc-card:hover { box-shadow: 0 4px 14px rgba(27,58,87,0.08); transform: translateY(-1px); }
.loc-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.loc-card-name { font-weight: 600; font-size: 13px; color: var(--ink); }
.loc-card-dot { width: 8px; height: 8px; border-radius: 50%; }
.loc-card-count { font-size: 26px; font-weight: 700; font-family: ui-monospace, "SF Mono", Menlo, monospace; line-height: 1; }
.loc-card-label { font-size: 11px; color: var(--ink-soft); margin-top: 2px; }
/* Status-colored left accent + tint on location cards (semantic status tokens) */
.loc-card { border-left: 4px solid var(--line); }
.loc-card-alert { border-left-color: var(--reorder); background: var(--reorder-bg); }
.loc-card-alert .loc-card-count { color: var(--reorder); }
.loc-card-ok { border-left-color: var(--good); }

/* Dashboard hitlist rows: severity-colored left accent + warm tint for urgent ones */
.hit-list { display: flex; flex-direction: column; gap: 8px; }
.hit-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 11px 12px; border: 1px solid var(--line); border-left: 4px solid var(--line);
  border-radius: 10px; background: var(--card); flex-wrap: wrap;
}
.hit-danger  { border-left-color: var(--reorder); background: var(--reorder-bg); }
.hit-warning { border-left-color: var(--low);     background: var(--low-bg); }
.hit-info    { border-left-color: var(--ink-2); }
.hit-icon { display: flex; align-items: center; flex-shrink: 0; color: var(--ink-soft); }
.hit-danger  .hit-icon { color: var(--reorder); }
.hit-warning .hit-icon { color: var(--low); }
.hit-info    .hit-icon { color: var(--ink-2); }
.hit-main { flex: 1; min-width: 160px; }
.hit-name { font-size: 13.5px; font-weight: 700; color: var(--ink); }
.hit-meta { font-size: 11.5px; color: var(--ink-soft); margin-top: 2px; line-height: 1.4; }

.panel { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin-bottom: 16px; }
.panel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.panel-header h2 { font-size: 15px; font-weight: 600; margin: 0; }
.pill { font-size: 11px; background: var(--paper); border: 1px solid var(--line); border-radius: 100px; padding: 3px 10px; color: var(--ink-soft); font-weight: 600; }

.empty-state { color: var(--ink-soft); font-size: 13px; padding: 20px 4px; text-align: center; }

.flag-list { display: flex; flex-direction: column; gap: 1px; }
.flag-row { display: flex; align-items: center; gap: 10px; padding: 10px 4px; border-bottom: 1px solid var(--line); }
.flag-row:last-child { border-bottom: none; }
.flag-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.flag-main { flex: 1; min-width: 0; }
.flag-name { font-size: 13px; font-weight: 600; }
.flag-meta { font-size: 11.5px; color: var(--ink-soft); margin-top: 1px; line-height: 1.4; }
.muted { color: var(--ink-soft); }

.badge { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 100px; white-space: nowrap; letter-spacing: 0.01em; }
.badge-sm { font-size: 10.5px; padding: 2px 8px; }
.badge-empty { background: var(--line); color: var(--ink-soft); }

.btn { border: none; border-radius: 9px; font-weight: 600; cursor: pointer; font-size: 13px; padding: 9px 16px; transition: opacity 0.15s; font-family: inherit; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
/* Primary CTAs: solid in the practice's ACCENT color (flows through the per-practice
   override); secondary + danger stay bordered/tinted. The two-class selectors give
   these higher specificity than .btn-tiny, so the size modifier no longer sets color. */
.btn.btn-primary { background: var(--brand-green); color: #fff; }
.btn.btn-primary:hover:not(:disabled) { background: var(--brand-green-dark); }
.btn.btn-secondary { background: var(--paper); color: var(--ink); border: 1px solid var(--line); }
.btn.btn-danger { background: var(--reorder-bg); color: var(--reorder); border: 1px solid var(--reorder); }
.btn.btn-secondary:hover:not(:disabled) { background: var(--line); }
.btn.btn-danger:hover:not(:disabled) { background: var(--reorder); color: #fff; }
.btn-secondary { background: var(--paper); color: var(--ink); border: 1px solid var(--line); }
.btn-tiny { padding: 5px 10px; font-size: 11.5px; background: var(--brand-green); color: #fff; border-radius: 7px; }

/* Drawer tabs - signature element for location switching */
.drawer-tabs { display: flex; gap: 4px; padding: 0 2px; }
.drawer-tab {
  position: relative; flex: 1; background: #EDEAE0; border: 1px solid var(--line); border-bottom: none;
  border-radius: 10px 10px 0 0; padding: 10px 8px 12px; cursor: pointer; font-family: inherit;
  display: flex; align-items: center; justify-content: center; gap: 6px; transition: background 0.15s;
}
.drawer-tab:hover { background: #F1EEE4; }
.drawer-tab-active { background: var(--card); box-shadow: 0 -3px 10px rgba(27,58,87,0.06); z-index: 1; }
.drawer-tab-label { font-size: 12.5px; font-weight: 700; color: var(--ink); }
.drawer-tab-badge { background: var(--reorder); color: #fff; font-size: 10px; font-weight: 700; border-radius: 100px; padding: 1px 6px; min-width: 16px; text-align: center; }
.drawer-panel { border-top-left-radius: 0; margin-top: -1px; }

.checkin-controls { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.select, .text-input { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 13px; background: var(--card); color: var(--ink); font-family: inherit; }
.select { min-width: 130px; }
.text-input { flex: 1; min-width: 140px; }

.cabinet-group { margin-bottom: 14px; }
.cabinet-label { font-size: 11px; font-weight: 700; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.05em; margin: 10px 0 6px 2px; }

.item-row { display: flex; align-items: center; gap: 10px; padding: 9px 4px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.item-row:last-child { border-bottom: none; }
.item-main { flex: 1; min-width: 160px; }
.item-name { font-size: 13px; font-weight: 600; }
.item-meta { font-size: 11.5px; color: var(--ink-soft); margin-top: 1px; line-height: 1.4; }

.qty-input { width: 70px; border: 1px solid var(--line); border-radius: 7px; padding: 6px 8px; font-size: 13px; font-family: ui-monospace, "SF Mono", Menlo, monospace; }

/* Focus rings on every form control. The main app previously had no focus
   style at all (only the auth screens did); the ring is themeable — it mixes
   the practice's own --ink accent so custom-branded practices stay on-brand. */
.text-input:focus, .select:focus, .qty-input:focus,
.app-root input:focus, .app-root textarea:focus, .app-root select:focus {
  outline: none;
  border-color: var(--ink);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ink) 18%, transparent);
}

.status-toggle { display: flex; gap: 5px; }
.toggle-btn { border: 1px solid var(--line); background: var(--paper); border-radius: 7px; padding: 6px 10px; font-size: 11.5px; font-weight: 600; cursor: pointer; color: var(--ink-soft); font-family: inherit; transition: border-color 0.12s, color 0.12s; }
.toggle-btn:hover:not(.toggle-btn-active) { border-color: var(--ink-soft); color: var(--ink); }
.toggle-btn-active { font-weight: 700; }

.ship-form { display: flex; flex-direction: column; gap: 12px; }
.form-row { display: flex; gap: 10px; flex-wrap: wrap; }
.form-field { flex: 1; min-width: 110px; position: relative; }
.form-field-wide { flex: 2; min-width: 220px; }
.form-field label { display: block; font-size: 11px; font-weight: 600; color: var(--ink-soft); margin-bottom: 4px; }
.form-field .text-input, .form-field .select { width: 100%; }

.autocomplete { position: absolute; top: 100%; left: 0; right: 0; background: var(--card); border: 1px solid var(--line); border-radius: 8px; margin-top: 4px; max-height: 220px; overflow-y: auto; z-index: 10; box-shadow: 0 6px 20px rgba(27,58,87,0.12); }
.autocomplete-item { padding: 8px 10px; font-size: 12.5px; cursor: pointer; border-bottom: 1px solid var(--line); }
.autocomplete-item:hover { background: var(--paper); }
.autocomplete-item:last-child { border-bottom: none; }

.warn-line { font-size: 12px; color: var(--low); background: var(--low-bg); padding: 8px 10px; border-radius: 8px; }

.filter-chips { display: flex; gap: 6px; }
.chip { border: 1px solid var(--line); background: var(--paper); border-radius: 100px; padding: 4px 11px; font-size: 11.5px; font-weight: 600; color: var(--ink-soft); cursor: pointer; font-family: inherit; transition: border-color 0.12s, color 0.12s; }
.chip:hover:not(.chip-active) { border-color: var(--ink-soft); color: var(--ink); }
.chip-active { background: var(--ink); color: #fff; border-color: var(--ink); }

/* Filtering lists — shared FilterBar of labeled dropdowns (Shipments, Queue). */
.filter-bar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; margin: 12px 0 4px; }
.filter-select { display: flex; flex-direction: column; gap: 3px; }
.filter-label { font-size: 11px; font-weight: 600; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.03em; }
.filter-select .select { min-width: 150px; }
.filter-clear { align-self: flex-end; }

/* Queue: bulk select + distributor grouping. */
.queue-groups { display: flex; flex-direction: column; gap: 6px; }
.queue-group-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 4px 6px; border-bottom: 2px solid var(--line); margin-top: 6px; }
.group-select { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.group-name { font-size: 13px; font-weight: 700; color: var(--ink); }
.pill-quiet { background: transparent; }
.queue-check { width: 16px; height: 16px; accent-color: var(--brand-green); cursor: pointer; margin-right: 8px; }
.queue-row-selected { background: color-mix(in srgb, var(--brand-green) 7%, transparent); border-radius: 8px; }
.bulk-bar { position: sticky; bottom: 8px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 14px; padding: 10px 14px; background: var(--ink); color: #fff; border-radius: 10px; box-shadow: 0 4px 16px rgba(20,38,61,0.22); }
.bulk-count { font-weight: 700; font-size: 13px; }
.bulk-hint { color: rgba(255,255,255,0.7) !important; font-size: 11.5px; }
.bulk-actions { margin-left: auto; display: flex; gap: 8px; }

/* Help screen. */
.help-steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 9px; font-size: 13.5px; color: var(--ink); line-height: 1.5; }
.faq-list { display: flex; flex-direction: column; }
.faq-item { border-bottom: 1px solid var(--line); }
.faq-q { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; background: none; border: none; padding: 12px 2px; font-size: 13.5px; font-weight: 600; color: var(--ink); cursor: pointer; font-family: inherit; text-align: left; }
.faq-caret { color: var(--ink-soft); font-size: 16px; font-weight: 400; }
.faq-a { padding: 0 2px 13px; font-size: 13px; color: var(--ink-soft); line-height: 1.55; }
.help-contact { font-size: 13.5px; color: var(--ink); }
.help-link { color: var(--brand-green); font-weight: 600; text-decoration: none; }
.help-link:hover { text-decoration: underline; }

.ship-list, .queue-list { display: flex; flex-direction: column; }
.ship-row, .queue-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 4px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.ship-row:last-child, .queue-row:last-child { border-bottom: none; }
.ship-main, .queue-main { flex: 1; min-width: 200px; }
.ship-actions { display: flex; align-items: center; gap: 8px; }
.queue-fields { display: flex; gap: 6px; flex-wrap: wrap; }

.inv-table { display: flex; flex-direction: column; font-size: 12px; }
.inv-head, .inv-row { display: grid; grid-template-columns: 2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 0.7fr 1fr; gap: 6px; align-items: center; padding: 8px 4px; }
.inv-head { font-size: 10.5px; font-weight: 700; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 2px solid var(--line); }
.inv-row { border-bottom: 1px solid var(--line); }
.inv-name { font-weight: 600; font-size: 12px; }
.inv-cell { display: flex; flex-direction: column; line-height: 1.15; }
.inv-updated { font-size: 9.5px; color: var(--ink-soft); font-variant-numeric: tabular-nums; margin-top: 1px; }

/* Fixed bottom bar = nav row + a thin "Powered by Baybridge" strip. z-index sits
   ABOVE the drawer (30) so the nav tabs stay reachable while the drawer is open. */
.bottom-bar {
  position: fixed; bottom: 0; left: 0; right: 0; background: var(--card); border-top: 1px solid var(--line);
  z-index: 45; padding-bottom: env(safe-area-inset-bottom);
}
.bottom-nav { display: flex; justify-content: space-around; padding: 6px 4px 4px; }
.powered-strip {
  text-align: center; font-size: 10px; color: var(--ink-soft); letter-spacing: 0.02em;
  padding: 3px 0 6px; border-top: 1px solid var(--line); opacity: 0.9;
}
.powered-strip span { font-weight: 700; color: #4089A2; }
.nav-item { flex: 1; background: none; border: none; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 2px; cursor: pointer; color: var(--ink-soft); font-family: inherit; position: relative; }
.nav-item-active { color: var(--ink); }
.nav-icon { display: flex; align-items: center; justify-content: center; line-height: 1; }
.nav-label { font-size: 9.5px; font-weight: 600; }
.nav-count { position: absolute; top: 2px; right: 18%; background: var(--reorder); color: #fff; font-size: 9px; font-weight: 700; border-radius: 100px; min-width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; padding: 0 3px; }

@media (min-width: 640px) {
  .main-panel { padding: 32px 24px 40px; }
}


/* Brand header */
.brand-header {
  display: flex; align-items: center; gap: 10px; padding: 12px 16px;
  background: var(--card); border-bottom: 2px solid var(--brand-green);
}
.brand-logo { height: 34px; width: 34px; object-fit: contain; }
.brand-text { display: flex; flex-direction: column; line-height: 1.1; }
.brand-name { font-size: 15px; font-weight: 800; color: var(--ink); letter-spacing: -0.01em; }
.brand-tag { font-size: 10.5px; font-weight: 700; color: var(--brand-green-dark); text-transform: uppercase; letter-spacing: 0.06em; }

/* Persistent account control, top-right of the header */
.header-account { margin-left: auto; position: relative; }
.account-btn { background: none; border: none; cursor: pointer; padding: 0; display: flex; }
.account-avatar {
  width: 34px; height: 34px; border-radius: 50%; background: var(--ink); color: #fff;
  font-size: 12px; font-weight: 700; letter-spacing: 0.02em;
  display: flex; align-items: center; justify-content: center;
}
.account-backdrop { position: fixed; inset: 0; z-index: 40; }
.account-menu {
  position: absolute; top: calc(100% + 8px); right: 0; z-index: 41; min-width: 210px;
  background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  box-shadow: 0 8px 30px rgba(20,38,61,0.14); padding: 14px 16px;
}
.account-menu-name { font-size: 13px; font-weight: 700; color: var(--ink); }
.account-menu-meta { font-size: 11.5px; color: var(--ink-soft); margin-top: 2px; }
.account-menu-code { font-size: 11.5px; color: var(--ink-soft); margin-top: 8px; }
.account-menu-code span { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-weight: 700; color: var(--ink); letter-spacing: 0.06em; }
.account-menu-signout { margin-top: 12px; width: 100%; border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 8px; padding: 8px 12px; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; }

/* CSV import modal (sits above the bottom bar z-45) */
.modal-backdrop { position: fixed; inset: 0; background: rgba(20,30,40,0.45); z-index: 50; }
.modal-card {
  position: fixed; z-index: 51; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: min(680px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow-y: auto;
  background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 20px;
  box-shadow: 0 20px 60px rgba(20,38,61,0.25);
}
.modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.modal-head h2 { font-size: 17px; font-weight: 700; margin: 0; color: var(--ink); }
.modal-x { background: none; border: none; font-size: 22px; line-height: 1; color: var(--ink-soft); cursor: pointer; padding: 0 4px; font-family: inherit; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }

.import-intro { font-size: 12.5px; color: var(--ink-soft); line-height: 1.5; margin: 0 0 14px; }
.import-intro code { background: var(--paper); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; font-size: 11.5px; }
.linklike { background: none; border: none; color: var(--brand-green-dark); font-weight: 600; cursor: pointer; font-family: inherit; font-size: 12.5px; padding: 0; margin-left: 6px; text-decoration: underline; }
.import-inputs { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.import-file-btn { display: inline-flex; }
.import-filename { font-size: 12px; color: var(--ink-soft); }
.import-paste { margin-top: 10px; }
.import-paste summary { font-size: 12px; color: var(--ink-soft); cursor: pointer; }
.import-paste textarea { width: 100%; margin-top: 8px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; resize: vertical; }

.import-preview { margin-top: 14px; }
.import-note { font-size: 11.5px; color: var(--low); margin-bottom: 8px; }
.import-summary { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.import-chip { font-size: 11.5px; font-weight: 700; border-radius: 100px; padding: 3px 10px; }
.import-chip.ok { background: var(--good-bg); color: var(--good); }
.import-chip.warn { background: var(--low-bg); color: var(--low); }
.import-chip.err { background: var(--reorder-bg); color: var(--reorder); }
.import-rows { display: flex; flex-direction: column; gap: 4px; max-height: 280px; overflow-y: auto; border: 1px solid var(--line); border-radius: 10px; padding: 6px; }
.import-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 9px; border-radius: 8px; border-left: 3px solid var(--line); background: var(--paper); }
.import-ok { border-left-color: var(--good); }
.import-warning, .import-skip { border-left-color: var(--low); background: var(--low-bg); }
.import-error { border-left-color: var(--reorder); background: var(--reorder-bg); }
.import-row-main { min-width: 0; flex: 1; }
.import-row-name { font-size: 12.5px; font-weight: 600; color: var(--ink); }
.import-row-msg { display: block; font-size: 11px; color: var(--ink-soft); margin-top: 1px; line-height: 1.4; }
.import-row-tag { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-soft); flex-shrink: 0; }
.import-done { text-align: center; padding: 24px 8px; color: var(--ink-soft); font-size: 14px; }
.import-done-count { font-size: 40px; font-weight: 800; color: var(--good); font-family: ui-monospace, "SF Mono", Menlo, monospace; line-height: 1; }

/* Branding screen — logo editor */
.brand-logo-editor { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
.brand-logo-preview {
  width: 96px; height: 96px; flex-shrink: 0; border: 1px solid var(--line); border-radius: 12px;
  background: var(--paper); display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.brand-logo-preview img { max-width: 82%; max-height: 82%; object-fit: contain; }
.brand-logo-controls { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.brand-logo-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.brand-logo-hint { font-size: 11.5px; color: var(--ink-soft); margin: 2px 0 0; line-height: 1.45; max-width: 340px; }

/* Branding screen — color pickers + live preview */
.brand-colors { display: flex; gap: 28px; flex-wrap: wrap; margin-bottom: 16px; }
.brand-color-field { display: flex; flex-direction: column; gap: 6px; }
.brand-color-field > span:first-child { font-size: 12px; font-weight: 600; color: var(--ink-soft); }
.brand-color-input { display: flex; align-items: center; gap: 9px; }
.brand-color-input input[type="color"] { width: 46px; height: 32px; padding: 0; border: 1px solid var(--line); border-radius: 8px; background: none; cursor: pointer; }
.brand-color-input code { font-size: 12px; font-weight: 600; color: var(--ink); text-transform: uppercase; letter-spacing: 0.03em; }
.brand-color-preview {
  border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; margin-bottom: 14px;
  display: flex; flex-direction: column; gap: 10px; align-items: flex-start; background: var(--card);
}
.brand-color-preview .bcp-header { display: flex; align-items: baseline; gap: 10px; width: 100%; padding-bottom: 8px; border-bottom: 2px solid var(--line); }
.brand-color-preview .bcp-tag { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.brand-color-preview .bcp-btn { color: #fff; font-weight: 600; font-size: 13px; padding: 8px 14px; border-radius: 9px; }
.brand-color-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.brand-saved { font-size: 12px; font-weight: 600; color: var(--good); }

/* Per-location address editor (Locations screen) */
.addr-editor { border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 2px 0 12px; background: var(--paper); }
.addr-section-label { font-size: 11px; font-weight: 700; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px; }
.addr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.addr-grid .addr-wide { grid-column: 1 / -1; }
.addr-grid .form-field { min-width: 0; }
.addr-same { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; color: var(--ink); margin: 12px 0 4px; cursor: pointer; }
.addr-same input { width: 15px; height: 15px; }
.addr-actions { display: flex; gap: 8px; margin-top: 12px; }
@media (max-width: 560px) { .addr-grid { grid-template-columns: 1fr; } }

/* Per-location cabinets editor */
.cab-add { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
.cab-add .text-input { flex: 1; min-width: 0; }
.cab-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.cab-row { display: flex; align-items: center; gap: 8px; }
.cab-row .text-input { flex: 1; min-width: 0; }
.cab-label { flex: 1; font-size: 13px; font-weight: 600; color: var(--ink); }
.cab-copy { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; border-top: 1px solid var(--line); padding-top: 12px; }
.cab-copy > span:first-child { font-size: 12.5px; color: var(--ink-soft); font-weight: 600; }
.cab-copy .select { min-width: 150px; }
.account-menu-signout:hover { background: var(--paper); }

.loading-logo { height: 48px; width: 48px; object-fit: contain; margin-bottom: 4px; }

.btn-accent { background: var(--brand-green); color: #fff; }
.btn-accent:hover:not(:disabled) { background: var(--brand-green-dark); }
.btn-danger { background: var(--reorder-bg); color: var(--reorder); border: 1px solid var(--reorder); }

.add-item-form { display: flex; flex-direction: column; gap: 12px; padding-top: 4px; }
.form-field-note { font-size: 11.5px; color: var(--ink-soft); font-style: italic; }

.manage-list { display: flex; flex-direction: column; }
.manage-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 4px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.manage-row:last-child { border-bottom: none; }
.manage-main { flex: 1; min-width: 200px; }
.manage-actions { display: flex; gap: 6px; }
.edit-inline { flex: 1; width: 100%; padding: 8px 0; }

.checkbox-line { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--ink-soft); font-weight: 600; cursor: pointer; }
.checkbox-line input { width: 15px; height: 15px; accent-color: var(--ink); }

.hamburger-btn { background: none; border: none; cursor: pointer; padding: 4px; color: var(--ink); display: flex; }

.app-shell { display: flex; flex: 1; position: relative; }

.side-drawer {
  position: fixed; top: 0; left: -260px; bottom: 0; width: 240px; background: var(--card);
  border-right: 1px solid var(--line); z-index: 30; transition: left 0.2s ease; padding-top: 62px;
  overflow-y: auto; display: flex; flex-direction: column;
}
.side-drawer.open { left: 0; box-shadow: 4px 0 20px rgba(27,58,87,0.15); }
.drawer-backdrop { position: fixed; inset: 0; background: rgba(20,30,40,0.32); z-index: 25; }
.drawer-section-label { font-size: 11px; font-weight: 700; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 18px; }
.drawer-link { display: flex; align-items: center; gap: 10px; padding: 11px 18px; cursor: pointer; color: var(--ink-soft); font-weight: 600; font-size: 13px; border: none; background: none; width: 100%; text-align: left; font-family: inherit; }
.drawer-link:hover { background: var(--paper); }
.drawer-link-active { color: var(--ink); background: var(--paper); border-right: 3px solid var(--brand-green); }
.drawer-icon { font-size: 15px; width: 18px; text-align: center; }

.drawer-account { margin-top: auto; border-top: 1px solid var(--line); padding: 16px 18px 18px; }
.drawer-account-name { font-size: 13px; font-weight: 700; color: var(--ink); }
.drawer-account-meta { font-size: 11.5px; color: var(--ink-soft); margin-top: 2px; }
.drawer-account-code { font-size: 11.5px; color: var(--ink-soft); margin-top: 6px; }
.drawer-account-code span { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-weight: 700; color: var(--ink); letter-spacing: 0.06em; }
.drawer-signout { margin-top: 12px; width: 100%; border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 8px; padding: 9px 12px; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; }
.drawer-signout:hover { background: var(--paper); }
.drawer-powered { margin-top: 12px; text-align: center; font-size: 10.5px; color: var(--ink-soft); letter-spacing: 0.02em; opacity: 0.85; }
.drawer-powered span { font-weight: 700; color: #4089A2; }

@media (min-width: 900px) {
  /* padding-bottom clears the fixed bottom-nav so the account footer isn't hidden behind it */
  .side-drawer { position: sticky; left: 0 !important; top: 0; height: 100vh; padding-top: 20px; padding-bottom: 84px; }
  .drawer-backdrop { display: none; }
  .hamburger-btn { display: none; }
}

.name-add-row { display: flex; gap: 8px; margin-bottom: 12px; }
.name-add-row .text-input { flex: 1; }
.name-list { display: flex; flex-direction: column; }
.name-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 4px; border-bottom: 1px solid var(--line); font-size: 13px; }
.name-row:last-child { border-bottom: none; }
.name-remove { background: none; border: none; color: var(--ink-soft); font-size: 17px; cursor: pointer; line-height: 1; padding: 2px 6px; border-radius: 6px; }
.name-remove:hover { background: var(--reorder-bg); color: var(--reorder); }

.qty-order-input { max-width: 100px; }
.queue-notes { width: 100%; margin-top: 8px; resize: vertical; font-family: inherit; }

.queue-row { flex-direction: column; align-items: stretch; }
.queue-row .queue-main { min-width: unset; margin-bottom: 8px; }
.queue-row .queue-fields { margin-bottom: 4px; }

.loc-toggle { display: flex; gap: 5px; flex-wrap: wrap; }
.loc-chip { border: 1px solid var(--line); background: var(--paper); border-radius: 100px; padding: 4px 11px; font-size: 11px; font-weight: 600; color: var(--ink-soft); cursor: pointer; font-family: inherit; }
.loc-chip-active { background: var(--ink); color: #fff; border-color: var(--ink); }
.loc-chip-all { border-style: dashed; }
.loc-chip-all.loc-chip-active { background: var(--brand-green); border-color: var(--brand-green); border-style: solid; color: #fff; }

.drawer-badge { margin-left: auto; background: var(--reorder); color: #fff; font-size: 10px; font-weight: 700; border-radius: 100px; min-width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; padding: 0 5px; }
`;
