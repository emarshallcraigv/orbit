import React, { useState, useEffect, useMemo, useCallback } from "react";
import { fetchLocations, createLocation, renameLocation, deleteLocation, saveLocationOrder, nameTaken } from "./lib/locations";
import { fetchItems, createItem, updateItem, deleteItem } from "./lib/items";
import { fetchDistributors, createDistributor, updateDistributor, deleteDistributor } from "./lib/distributors";
import { fetchShipments, createShipment, updateShipmentSplit, receiveShipment } from "./lib/shipments";
import { fetchTransfers, confirmTransfer } from "./lib/transfers";
import { fetchCategories, createCategory, renameCategory, deleteCategory, saveCategoryOrder, nameTaken as categoryNameTaken } from "./lib/categories";
import { fetchQueue, flagQueueLocation, updateQueueFields, setQueueLocations, orderQueueEntry, practiceToday } from "./lib/queue";
import { fetchChecks, saveCheck } from "./lib/checks";
import { rankHitlist, daysBetween } from "./lib/hitlist";

/* ============================== BRAND ============================== */
const LOGO_SRC = "/logo.jpg";

/* ============================== SEED DATA ============================== */
// Locations are no longer a hardcoded constant — they come from the practice's
// own `locations` table (loaded in MainApp) and are threaded down as a `locations`
// prop (an array of names). See docs step 2. Anything that used to iterate the old
// LOCATIONS array now iterates that prop, so a practice works with 1 or 20 offices.

// Legacy shipment records stored per-location quantity in fixed columns
// (tampa/palmetto/stpete/largo). New records use a `split` map keyed by location
// name. shipQty reads whichever exists, so old blob data keeps computing until the
// step 3 data-layer rewrite retires the legacy shape entirely.
const LEGACY_SHIP_FIELD = { "Tampa": "tampa", "Palmetto": "palmetto", "St. Pete": "stpete", "Largo": "largo" };
function shipQty(shipment, location) {
  if (shipment.split && Object.prototype.hasOwnProperty.call(shipment.split, location)) {
    return Number(shipment.split[location]) || 0;
  }
  const legacy = LEGACY_SHIP_FIELD[location];
  return legacy ? Number(shipment[legacy]) || 0 : 0;
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
// Mann's stored colors equal the stylesheet defaults, so this is a no-op for
// them (their look is unchanged); other practices get their own primary/accent.
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
          <div className="item-meta">Cabinet {item.cabinets[location]} · threshold {item.threshold}{item.unit ? " · " + item.unit : ""}</div>
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
        <div className="item-meta">Cabinet {item.cabinets[location]}{check && check.date ? " · last checked " + fmtDate(check.date) : ""}</div>
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
    const s = new Set(items.map((i) => i.cabinets[activeLocation]));
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
            {cabinets.map((c) => <option key={c} value={c}>Cabinet {c}</option>)}
          </select>
        </div>

        {Object.keys(grouped).length === 0 ? (
          <div className="empty-state">No items match that search.</div>
        ) : (
          Object.keys(grouped).sort((a,b)=> (isNaN(a)||isNaN(b)? String(a).localeCompare(String(b)) : Number(a)-Number(b))).map((cab) => (
            <div key={cab} className="cabinet-group">
              <div className="cabinet-label">Cabinet {cab}</div>
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

function ShipmentsView({ items, shipments, distributors, onAdd, onUpdate, locations }) {
  const [filter, setFilter] = useState("All");
  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const filtered = shipments.filter((s) => filter === "All" || s.status === filter).sort((a, b) => (b.dateOrdered || "").localeCompare(a.dateOrdered || ""));

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
        {filtered.length === 0 ? (
          <div className="empty-state">No shipments logged yet.</div>
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

function QueueRow({ q, item, distributors, onUpdate, locations }) {
  const [notes, setNotes] = useState(q.notes || "");
  const ready = q.distributor && Number(q.qtyToOrder) > 0;

  useEffect(() => { setNotes(q.notes || ""); }, [q.notes]);

  const handleLocationChange = (next) => {
    const nextDetails = { ...q.details };
    next.forEach((loc) => { if (!nextDetails[loc]) nextDetails[loc] = { qty: null, reason: "Added manually" }; });
    onUpdate(q.id, { locations: next, details: nextDetails });
  };

  return (
    <div className="queue-row">
      <div className="queue-main">
        <div className="flag-name">{item ? item.name : q.itemId}</div>
        <div className="flag-meta">flagged {fmtDate(q.dateFlagged)}</div>
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

function QueueView({ items, queue, distributors, onUpdate, onManualAdd, locations }) {
  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("All");

  const pending = queue.filter((q) => q.status === "Pending").sort((a, b) => (b.dateFlagged || "").localeCompare(a.dateFlagged || ""));
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
          <span className="pill">{pending.length} pending</span>
        </div>
        <div style={{ marginBottom: 14 }}>
          <AddToQueueForm items={items} onAdd={onManualAdd} locations={locations} />
        </div>
        {pending.length === 0 ? (
          <div className="empty-state">Nothing pending right now.</div>
        ) : (
          <div className="queue-list">
            {pending.map((q) => (
              <QueueRow key={q.id} q={q} item={itemById[q.itemId]} distributors={distributors} onUpdate={onUpdate} locations={locations} />
            ))}
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
        <p className="view-sub">Live stock for your {qtyItems.length} quantity-tracked items — last count plus anything received since.</p>
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
            const stocks = locations.map((loc) => liveStock(item, loc, checks, shipments, transfers));
            const total = stocks.reduce((a, b) => a + b, 0);
            const status = invStatus(item, total);
            return (
              <div className="inv-row" key={item.id} style={gridCols}>
                <span className="inv-name">{item.name}</span>
                <span className="muted">{item.threshold}</span>
                {stocks.map((s, i) => <span key={i}>{s}</span>)}
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
      {/* The practice's own logo once inside their tenant; Mann (practice #1)
          has no uploaded logo_url, so it falls back to its existing /logo.jpg. */}
      <img src={practiceLogo || LOGO_SRC} alt="" className="brand-logo" />
      <div className="brand-text">
        <div className="brand-name">{practiceName || "Supply System"}</div>
        <div className="brand-tag">Supply System</div>
      </div>
      <HeaderAccount profile={profile} practice={practice} onSignOut={onSignOut} />
    </div>
  );
}

function SideDrawer({ open, view, setView, onClose, pendingTransfers }) {
  const items = [
    { key: "inventory", label: "Inventory", icon: "≡" },
    { key: "transfers", label: "Transfers between locations", icon: "⇄", count: pendingTransfers },
    { key: "items", label: "Manage items", icon: "▦" },
    { key: "locations", label: "Locations", icon: "⌘" },
    { key: "categories", label: "Categories", icon: "▤" },
    { key: "distributors", label: "Distributors", icon: "☎" },
  ];
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
                      <button className="btn btn-danger btn-tiny" onClick={() => setConfirmId(d.id)}>Delete</button>
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

function DistributorsScreen({ distributorRows, onAdd, onUpdate, onRemove }) {
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

function LocationsManager({ locations, onAdd, onRename, onDelete, onReorder }) {
  const [newName, setNewName] = useState("");
  const [addErr, setAddErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [confirmId, setConfirmId] = useState(null); // id pending delete confirmation
  const [rowErr, setRowErr] = useState({}); // id -> message

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
        <p className="view-sub">Add, rename, reorder, or remove the offices this practice tracks supplies for. Names must be unique.</p>
      </div>

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

      <div className="panel">
        <div className="panel-header">
          <h2>Current locations</h2>
          <span className="pill">{locations.length}</span>
        </div>
        <div className="manage-list">
          {locations.map((loc, i) => (
            <div className="manage-row" key={loc.id}>
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
                    {rowErr[loc.id] && <div className="warn-line" style={{ marginTop: 6 }}>{rowErr[loc.id]}</div>}
                  </div>
                  <div className="manage-actions">
                    <button className="btn btn-secondary btn-tiny" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                    <button className="btn btn-secondary btn-tiny" onClick={() => move(i, 1)} disabled={i === locations.length - 1} aria-label="Move down">↓</button>
                    <button className="btn btn-secondary btn-tiny" onClick={() => { setEditingId(loc.id); setEditValue(loc.name); setError(loc.id, ""); }}>Rename</button>
                    <button className="btn btn-danger btn-tiny" onClick={() => { setConfirmId(loc.id); setError(loc.id, ""); }} disabled={locations.length <= 1}>Delete</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================== CATEGORIES ============================== */
function CategoriesManager({ categories, onAdd, onRename, onDelete, onReorder }) {
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
        <p className="view-sub">A fixed list to categorize items — so the same category can't drift into several spellings. Names must be unique.</p>
      </div>

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
                  <div className="manage-actions">
                    <button className="btn btn-secondary btn-tiny" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                    <button className="btn btn-secondary btn-tiny" onClick={() => move(i, 1)} disabled={i === categories.length - 1} aria-label="Move down">↓</button>
                    <button className="btn btn-secondary btn-tiny" onClick={() => { setEditingId(cat.id); setEditValue(cat.name); setError(cat.id, ""); }}>Rename</button>
                    <button className="btn btn-danger btn-tiny" onClick={() => { setConfirmId(cat.id); setError(cat.id, ""); }}>Delete</button>
                  </div>
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

/* ============================== MANAGE ITEMS ============================== */
function CabinetInputs({ cabinets, onChange, locations }) {
  return (
    <div className="form-row">
      {locations.map((loc) => (
        <div className="form-field" key={loc}>
          <label>{loc} cabinet</label>
          <input className="text-input" value={cabinets[loc] || ""} onChange={(e) => onChange({ ...cabinets, [loc]: e.target.value })} placeholder="e.g. 3" />
        </div>
      ))}
    </div>
  );
}

function AddItemForm({ onAdd, locations, categories }) {
  const blankMap = () => Object.fromEntries(locations.map((l) => [l, ""]));
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [cabinets, setCabinets] = useState(blankMap);
  const [sameCabinet, setSameCabinet] = useState(true);
  const [type, setType] = useState("Good/Low");
  const [unit, setUnit] = useState("");
  const [threshold, setThreshold] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [cost, setCost] = useState("");
  const [qty, setQty] = useState(blankMap);
  const [open, setOpen] = useState(false);

  const setAllCabinets = (v) => setCabinets(Object.fromEntries(locations.map((l) => [l, v])));

  const reset = () => {
    setName(""); setDesc(""); setCabinets(blankMap());
    setSameCabinet(true); setType("Good/Low"); setUnit(""); setThreshold("");
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

      <div className="form-row">
        <label className="checkbox-line">
          <input type="checkbox" checked={sameCabinet} onChange={(e) => {
            setSameCabinet(e.target.checked);
            if (e.target.checked) setAllCabinets(cabinets[locations[0]] || "");
          }} />
          Same cabinet number at every location
        </label>
      </div>

      {sameCabinet ? (
        <div className="form-row">
          <div className="form-field">
            <label>Cabinet (all locations)</label>
            <input className="text-input" value={cabinets[locations[0]] || ""}
              onChange={(e) => setAllCabinets(e.target.value)}
              placeholder="e.g. 3" />
          </div>
        </div>
      ) : (
        <CabinetInputs cabinets={cabinets} onChange={setCabinets} locations={locations} />
      )}

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
              { name: desc ? name + " - " + desc : name, item: name, desc, cabinets, type,
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

function ManageItems({ items, onAdd, onUpdate, onDelete, locations, categories }) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const catById = useMemo(() => Object.fromEntries((categories || []).map((c) => [c.id, c.name])), [categories]);
  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="view">
      <div className="view-header">
        <h1>Manage items</h1>
        <p className="view-sub">Add new supplies, set a different cabinet per location, switch tracking type, or remove items you no longer stock.</p>
      </div>

      <div className="panel">
        <AddItemForm onAdd={onAdd} locations={locations} categories={categories} />
      </div>

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
                <EditItemInline item={item} onSave={(patch) => { onUpdate(item.id, patch); setEditingId(null); }} onCancel={() => setEditingId(null)} locations={locations} categories={categories} />
              ) : (
                <>
                  <div className="manage-main">
                    <div className="flag-name">{item.name}</div>
                    <div className="flag-meta">
                      {locations.map((loc) => loc + " Cab " + (item.cabinets[loc] || "—")).join("  ·  ")}
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
                    ) : (
                      <button className="btn btn-secondary btn-tiny" onClick={() => setConfirmDeleteId(item.id)}>Delete</button>
                    )}
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

function EditItemInline({ item, onSave, onCancel, locations, categories }) {
  const [type, setType] = useState(item.type);
  const [threshold, setThreshold] = useState(item.threshold ?? "");
  const [unit, setUnit] = useState(item.unit || "");
  const [categoryId, setCategoryId] = useState(item.categoryId || "");
  const [cost, setCost] = useState(item.estimatedUnitCost ?? "");
  const [cabinets, setCabinets] = useState({ ...item.cabinets });

  return (
    <div className="edit-inline">
      <CabinetInputs cabinets={cabinets} onChange={setCabinets} locations={locations} />
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
        <button className="btn btn-primary btn-tiny" onClick={() => onSave({ type, cabinets, threshold: type === "Quantity" ? Number(threshold) || 0 : null, unit, categoryId, estimatedUnitCost: cost })}>Save</button>
        <button className="btn btn-secondary btn-tiny" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ============================== APP SHELL ============================== */
export function MainApp({ profile, practice, onSignOut }) {
  // Items + distributors are real Supabase tables (step 3a). The remaining
  // entities (checks/shipments/transfers/queue, plus the staff pick-list) are
  // still on the localStorage blob and get migrated in later slices (3b–3e).

  const [view, setView] = useState("dashboard");
  const [activeLocation, setActiveLocation] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  // Item categories (0008) — practice-scoped, flat list.
  const [categoryRows, setCategoryRows] = useState(null);
  const reloadCategories = useCallback(async () => {
    if (!practice?.id) return;
    try { setCategoryRows(await fetchCategories(practice.id)); }
    catch (e) { console.error("Failed to load categories:", e.message); setCategoryRows([]); }
  }, [practice?.id]);
  useEffect(() => { reloadCategories(); }, [reloadCategories]);
  const categories = useMemo(() => categoryRows || [], [categoryRows]);

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
    && shipmentsData !== null && transfersData !== null && categoryRows !== null
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

  if (!ready) {
    return (
      <div className="app-loading">
        <style>{STYLES}</style>
        <img src={LOGO_SRC} alt="" className="loading-logo" />
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
      <Header onMenuClick={() => setDrawerOpen(true)} practiceName={practice?.name} practiceLogo={practice?.logo_url}
        profile={profile} practice={practice} onSignOut={onSignOut} />

      <div className="app-shell">
        <SideDrawer open={drawerOpen} view={view} setView={setView} onClose={() => setDrawerOpen(false)} pendingTransfers={pendingTransfers} />

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
              onUpdate={handleUpdateQueue} onManualAdd={handleManualQueueAdd} locations={locationNames} />
          )}
          {view === "inventory" && (
            <InventoryView items={itemList} checks={checks} shipments={shipments} transfers={transfers} locations={locationNames} />
          )}
          {view === "items" && (
            <ManageItems items={itemList} onAdd={handleAddItem} onUpdate={handleUpdateItem} onDelete={handleDeleteItem} locations={locationNames} categories={categories} />
          )}
          {view === "locations" && (
            <LocationsManager locations={locations} onAdd={handleAddLocation} onRename={handleRenameLocation}
              onDelete={handleDeleteLocation} onReorder={handleReorderLocations} />
          )}
          {view === "categories" && (
            <CategoriesManager categories={categories} onAdd={handleAddCategory} onRename={handleRenameCategory}
              onDelete={handleDeleteCategory} onReorder={handleReorderCategories} />
          )}
          {view === "distributors" && (
            <DistributorsScreen distributorRows={distributorRows || []}
              onAdd={handleAddDistributor} onUpdate={handleUpdateDistributor} onRemove={handleRemoveDistributor} />
          )}
          {view === "transfers" && (
            <TransfersView items={itemList} transfers={transfers} onUpdate={handleUpdateTransfer} />
          )}
        </main>
      </div>

      <div className="bottom-bar">
        <nav className="bottom-nav">
          <NavItem icon="⌂" label="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")} count={totalFlagged} />
          <NavItem icon="✓" label="Check-in" active={view === "checkin"} onClick={() => setView("checkin")} />
          <NavItem icon="▢" label="Shipments" active={view === "shipments"} onClick={() => setView("shipments")} />
          <NavItem icon="⚑" label="Queue" active={view === "queue"} onClick={() => setView("queue")} count={pendingQueue} />
        </nav>
        <div className="powered-strip">Powered by <span>Baybridge</span></div>
      </div>
    </div>
  );
}

/* ============================== STYLES ============================== */
const STYLES = `
:root {
  --ink: #15409E;
  --ink-2: #1B4FC4;
  --ink-soft: #66738F;
  --paper: #F5F7FA;
  --card: #FFFFFF;
  --line: #E1E6EE;
  --brand-green: #6FA030;
  --brand-green-dark: #5C8827;
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
.view-sub { font-size: 13px; color: var(--ink-soft); margin: 0; }

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
.hit-main { flex: 1; min-width: 180px; }
.hit-name { font-size: 13.5px; font-weight: 700; color: var(--ink); }
.hit-meta { font-size: 11.5px; color: var(--ink-soft); margin-top: 2px; }

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
.flag-meta { font-size: 11.5px; color: var(--ink-soft); margin-top: 1px; }
.muted { color: var(--ink-soft); }

.badge { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 100px; white-space: nowrap; letter-spacing: 0.01em; }
.badge-sm { font-size: 10.5px; padding: 2px 8px; }
.badge-empty { background: var(--line); color: var(--ink-soft); }

.btn { border: none; border-radius: 9px; font-weight: 600; cursor: pointer; font-size: 13px; padding: 9px 16px; transition: opacity 0.15s; font-family: inherit; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary { background: var(--ink); color: #fff; }
.btn-primary:hover:not(:disabled) { opacity: 0.88; }
.btn-secondary { background: var(--paper); color: var(--ink); border: 1px solid var(--line); }
.btn-tiny { padding: 5px 10px; font-size: 11.5px; background: var(--ink); color: #fff; border-radius: 7px; }

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
.item-meta { font-size: 11px; color: var(--ink-soft); margin-top: 1px; }

.qty-input { width: 70px; border: 1px solid var(--line); border-radius: 7px; padding: 6px 8px; font-size: 13px; font-family: ui-monospace, "SF Mono", Menlo, monospace; }

.status-toggle { display: flex; gap: 5px; }
.toggle-btn { border: 1px solid var(--line); background: var(--paper); border-radius: 7px; padding: 6px 10px; font-size: 11.5px; font-weight: 600; cursor: pointer; color: var(--ink-soft); font-family: inherit; }
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
.chip { border: 1px solid var(--line); background: var(--paper); border-radius: 100px; padding: 4px 11px; font-size: 11.5px; font-weight: 600; color: var(--ink-soft); cursor: pointer; font-family: inherit; }
.chip-active { background: var(--ink); color: #fff; border-color: var(--ink); }

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
.nav-icon { font-size: 17px; line-height: 1; }
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
