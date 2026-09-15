/* =========================================================================
   data.js
   Data layer shared by input.js and analytics.js.

   Responsibilities:
   - CONFIG: where the app gets its data from (Google Apps Script Web App,
     or local demo mode using bundled sample data + localStorage).
   - Normalization helpers (vendor names, numbers, currency parsing).
   - Statistical aggregation functions used across the analytics sections.

   Nothing in this file mutates SAMPLE_EVENTS. Locally-submitted reports are
   kept separately in localStorage so the bundled sample dataset always
   stays intact.
   ========================================================================= */

const CONFIG = {
  // Paste your deployed Google Apps Script Web App URL here to run against
  // a real backend, e.g. "https://script.google.com/macros/s/AKfycbyDJUY1mecPE2DRjAsfN8KgJN2sdIJbg05u4xy9qv80BBm0MGiCl_JNeaQxsmoHSCUs/exec".
  // Leave empty to run fully client-side against the bundled sample data +
  // localStorage, which is the default "run locally" mode described in
  // README.md.
  API_URL: "",
  LOCAL_STORAGE_KEY: "eo_datastory_submissions_v1",
};

/* -------------------------------------------------------------------------
   Sample dataset (used whenever CONFIG.API_URL is empty). Independent of
   whatever the user has submitted locally, so the analytics page always has
   something meaningful to show on first run.
   ------------------------------------------------------------------------- */
const SAMPLE_EVENTS = [
  mk("Nadia", "Wedding Reception - Aditya & Rani", "PT Anugerah Selaras", "2026-01-11", 1, 1, 0, "Bandung", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 40, 32000000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 8, 18500000),
    it("GEN-02", "Genset 50kVA", "Genset", "Vendor B", 1, 4200000),
  ]),
  mk("Nadia", "Corporate Townhall Q1", "Bank Kartika", "2026-01-18", 1, 1, 1, "Jakarta", "Indonesia", [
    it("LED-02", "LED Panel P4", "LED", "Vendor A", 24, 15000000),
    it("MIC-01", "Mic Wireless Handheld", "Audio", "Vendor D", 6, 3600000),
    it("LGT-03", "Moving Head Beam", "Lighting", "Vendor B", 12, 9600000),
  ]),
  mk("Rizky", "Product Launch - Skinlab", "Skinlab Cosmetics", "2026-02-02", 2, 2, 1, "Jakarta", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 60, 48000000),
    it("LGT-03", "Moving Head Beam", "Lighting", "Vendor B", 20, 16000000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 12, 27750000),
    it("RIG-01", "Truss Support 3m", "Rigging", "Vendor E", 16, 6400000),
  ]),
  mk("Rizky", "Wedding Reception - Bagus & Sinta", "Keluarga Bagus", "2026-02-14", 1, 1, 0, "Bandung", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 32, 25600000),
    it("SND-02", "Speaker Portable Set", "Audio", "Vendor C", 4, 6000000),
  ]),
  mk("Vina", "Music Festival Day 1", "Kolektif Bunyi", "2026-02-21", 3, 1, 2, "Bandung", "Indonesia", [
    it("LED-02", "LED Panel P4", "LED", "Vendor A", 80, 50000000),
    it("LGT-01", "Moving Head Spot", "Lighting", "Vendor B", 30, 27000000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 24, 55500000),
    it("GEN-01", "Genset 100kVA", "Genset", "Vendor B", 2, 12000000),
    it("RIG-02", "Truss Support 6m", "Rigging", "Vendor E", 20, 12000000),
  ]),
  mk("Nadia", "Annual Gala Dinner", "PT Sumber Makmur", "2026-03-06", 1, 1, 1, "Jakarta", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "vendor a", 48, 38400000),
    it("MIC-01", "Mic Wireless Handheld", "Audio", "Vendor D", 8, 4800000),
    it("DOC-01", "Videography Crew", "Documentation", "Vendor F", 1, 8000000),
  ]),
  mk("Rizky", "Church Youth Retreat", "GKI Youth", "2026-03-13", 3, 1, 1, "Lembang", "Indonesia", [
    it("SND-02", "Speaker Portable Set", "Audio", "Vendor C", 2, 3000000),
    it("MIC-01", "Mic Wireless Handheld", "Audio", "Vendor D", 3, 1800000),
    it("LGT-04", "Par Led Stage Light", "Lighting", "Vendor B", 12, 3600000),
  ]),
  mk("Vina", "Wedding Reception - Farhan & Dinda", "Keluarga Farhan", "2026-03-21", 1, 1, 0, "Surabaya", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 36, 28800000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 8, 18500000),
    it("GEN-02", "Genset 50kVA", "Genset", "Vendor B", 1, 4200000),
  ]),
  mk("Nadia", "Product Launch - Aetherwear", "Aetherwear Studio", "2026-04-04", 2, 1, 1, "Jakarta", "Indonesia", [
    it("LGT-01", "Moving Head Spot", "Lighting", "Vendor B", 16, 14400000),
    it("SND-02", "Speaker Portable Set", "Audio", "Vendor C", 6, 9000000),
    it("DOC-02", "Photography Crew", "Documentation", "Vendor F", 2, 6000000),
    it("MUL-01", "LED Video Wall Content", "Multimedia", "Vendor G", 1, 11000000),
  ]),
  mk("Rizky", "Wedding Reception - Galih & Wulan", "Keluarga Galih", "2026-04-12", 1, 1, 0, "Bandung", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 32, 25600000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 8, 18500000),
  ]),
  mk("Vina", "Corporate Family Day", "PT Jaya Abadi", "2026-04-25", 1, 1, 0, "Bandung", "Indonesia", [
    it("SND-02", "Speaker Portable Set", "Audio", "Vendor C", 4, 6000000),
    it("MIC-01", "Mic Wireless Handheld", "Audio", "Vendor D", 4, 2400000),
    it("GEN-02", "Genset 50kVA", "Genset", "Vendor B", 1, 4200000),
  ]),
  mk("Nadia", "Music Festival Day 2", "Kolektif Bunyi", "2026-05-02", 2, 1, 2, "Bandung", "Indonesia", [
    it("LED-02", "LED Panel P4", "LED", "Vendor A", 70, 43750000),
    it("LGT-01", "Moving Head Spot", "Lighting", "Vendor B", 24, 21600000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 20, 46250000),
    it("RIG-02", "Truss Support 6m", "Rigging", "Vendor E", 16, 9600000),
  ]),
  mk("Rizky", "Wedding Reception - Hasan & Nadira", "Keluarga Hasan", "2026-05-09", 1, 1, 0, "Jakarta", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 40, 32000000),
    it("LGT-04", "Par Led Stage Light", "Lighting", "Vendor B", 16, 4800000),
    it("SND-02", "Speaker Portable Set", "Audio", "Vendor C", 4, 6000000),
  ]),
  mk("Vina", "Ministry Leaders Gathering", "GARA Community", "2026-05-16", 2, 1, 1, "Bandung", "Indonesia", [
    it("SND-02", "Speaker Portable Set", "Audio", "Vendor C", 3, 4500000),
    it("MIC-01", "Mic Wireless Handheld", "Audio", "Vendor D", 4, 2400000),
    it("DOC-02", "Photography Crew", "Documentation", "Vendor F", 1, 3000000),
  ]),
  mk("Nadia", "Product Launch - Rasa Nusantara", "Rasa Nusantara F&B", "2026-06-06", 1, 1, 0, "Jakarta", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 28, 22400000),
    it("SND-02", "Speaker Portable Set", "Audio", "Vendor C", 4, 6000000),
    it("DOC-01", "Videography Crew", "Documentation", "Vendor F", 1, 8000000),
  ]),
  mk("Rizky", "Wedding Reception - Irfan & Kayla", "Keluarga Irfan", "2026-06-20", 1, 1, 0, "Bandung", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 36, 28800000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 8, 18500000),
    it("GEN-02", "Genset 50kVA", "Genset", "Vendor B", 1, 4200000),
  ]),
  mk("Vina", "Corporate Annual Meeting", "PT Sumber Makmur", "2026-07-11", 1, 1, 0, "Jakarta", "Indonesia", [
    it("LED-02", "LED Panel P4", "LED", "Vendor A", 20, 12500000),
    it("MIC-01", "Mic Wireless Handheld", "Audio", "Vendor D", 6, 3600000),
  ]),
  mk("Nadia", "Wedding Reception - Joko & Larasati", "Keluarga Joko", "2026-08-08", 1, 1, 0, "Surabaya", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 32, 25600000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 8, 18500000),
    it("GEN-02", "Genset 50kVA", "Genset", "Vendor B", 1, 4200000),
  ]),
  mk("Rizky", "Youth Retreat NRG 2026", "GARA Community", "2026-08-07", 3, 1, 1, "Lembang", "Indonesia", [
    it("SND-02", "Speaker Portable Set", "Audio", "Vendor C", 3, 4500000),
    it("MIC-01", "Mic Wireless Handheld", "Audio", "Vendor D", 4, 2400000),
    it("LGT-04", "Par Led Stage Light", "Lighting", "Vendor B", 10, 3000000),
    it("DOC-02", "Photography Crew", "Documentation", "Vendor F", 1, 3000000),
  ]),
  mk("Vina", "Product Launch - Meridian Tech", "Meridian Technologies", "2026-09-03", 2, 1, 1, "Jakarta", "Indonesia", [
    it("LED-02", "LED Panel P4", "LED", "Vendor A", 90, 56250000),
    it("LGT-01", "Moving Head Spot", "Lighting", "Vendor B", 30, 27000000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 16, 37000000),
    it("RIG-02", "Truss Support 6m", "Rigging", "Vendor E", 24, 14400000),
    it("MUL-01", "LED Video Wall Content", "Multimedia", "Vendor G", 1, 15000000),
  ]),
  mk("Nadia", "Wedding Reception - Kevin & Marsha", "Keluarga Kevin", "2026-09-12", 1, 1, 0, "Bandung", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 36, 28800000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 8, 18500000),
    it("GEN-02", "Genset 50kVA", "Genset", "Vendor B", 1, 4200000),
  ]),
];

function it(itemCode, itemName, category, vendor, quantity, totalPrice) {
  return { itemCode, itemName, category, vendor, quantity, totalPrice };
}

function mk(user, event, client, eventDate, duration, eventDays, gr, city, country, items) {
  const eventPrice = items.reduce((sum, i) => sum + i.totalPrice, 0);
  // submittedAt is spread a few hours after the event date so "last updated"
  // has realistic variety in the sample data.
  const submittedAt = new Date(eventDate + "T09:00:00");
  submittedAt.setDate(submittedAt.getDate() + 1);
  return {
    eventId: "smp-" + event.replace(/\s+/g, "-").toLowerCase(),
    user, event, client, eventPrice, eventDate, duration, eventDays, gr, city, country,
    items,
    submittedAt: submittedAt.toISOString(),
  };
}

/* -------------------------------------------------------------------------
   Normalization
   ------------------------------------------------------------------------- */

// Collapses "Vendor A", "vendor a", " VENDOR A " into one canonical display
// label. The first form encountered (in dataset order) wins as the display
// label; raw stored data is never mutated.
function normalizeLabel(raw) {
  return String(raw || "").trim().replace(/\s+/g, " ");
}

function canonicalKey(raw) {
  return normalizeLabel(raw).toLowerCase();
}

// Builds a lookup of canonicalKey -> first-seen display label across a list
// of events, for vendors and item names respectively.
function buildLabelMap(events, picker) {
  const map = new Map();
  for (const ev of events) {
    for (const item of ev.items) {
      const raw = picker(item);
      const key = canonicalKey(raw);
      if (key && !map.has(key)) map.set(key, normalizeLabel(raw));
    }
  }
  return map;
}

/* -------------------------------------------------------------------------
   Loading
   ------------------------------------------------------------------------- */

function readLocalSubmissions() {
  try {
    const raw = localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to read local submissions", e);
    return [];
  }
}

function writeLocalSubmission(report) {
  const all = readLocalSubmissions();
  all.push(report);
  localStorage.setItem(CONFIG.LOCAL_STORAGE_KEY, JSON.stringify(all));
}

// Loads the full dataset. In local/demo mode this is the bundled sample
// data plus anything the user has submitted through input.html in this
// browser. When CONFIG.API_URL is set, it fetches from the Apps Script
// backend instead.
async function loadAllEvents() {
  if (CONFIG.API_URL) {
    const res = await fetch(CONFIG.API_URL + "?action=getAnalytics");
    if (!res.ok) throw new Error("Failed to load data from API: " + res.status);
    const payload = await res.json();
    return payload.events || [];
  }
  return [...SAMPLE_EVENTS, ...readLocalSubmissions()];
}

async function submitEvent(report) {
  if (CONFIG.API_URL) {
    const res = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight on Apps Script
      body: JSON.stringify(report),
    });
    if (!res.ok) throw new Error("Failed to submit report: " + res.status);
    return res.json();
  }
  writeLocalSubmission(report);
  return { ok: true, eventId: report.eventId };
}

/* -------------------------------------------------------------------------
   Statistics
   ------------------------------------------------------------------------- */

// Percentile using linear interpolation between closest ranks (equivalent
// to Excel's PERCENTILE.INC / "inclusive" method). Documented here because
// there are several competing quartile conventions; this is the one used
// consistently everywhere in this app.
function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const rank = p * (sortedValues.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const weight = rank - lowerIndex;
  if (lowerIndex === upperIndex) return sortedValues[lowerIndex];
  return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight;
}

function computePriceStats(events) {
  const values = events.map((e) => e.eventPrice).sort((a, b) => a - b);
  const n = values.length;
  if (n === 0) {
    return { mean: 0, median: 0, q1: 0, q3: 0, min: 0, max: 0, n: 0 };
  }
  const mean = values.reduce((s, v) => s + v, 0) / n;
  return {
    mean,
    median: percentile(values, 0.5),
    q1: percentile(values, 0.25),
    q3: percentile(values, 0.75),
    min: values[0],
    max: values[n - 1],
    n,
  };
}

// Vendor aggregation. "eventCount" = number of DISTINCT events that used
// this vendor at least once (never conflate with item occurrences or pcs).
function aggregateVendors(events) {
  const labelMap = buildLabelMap(events, (i) => i.vendor);
  const byKey = new Map();
  for (const ev of events) {
    const vendorsInThisEvent = new Set();
    for (const item of ev.items) {
      const key = canonicalKey(item.vendor);
      if (!key) continue;
      vendorsInThisEvent.add(key);
      if (!byKey.has(key)) {
        byKey.set(key, { vendor: labelMap.get(key), eventIds: new Set(), itemOccurrences: 0, totalSpending: 0 });
      }
      const rec = byKey.get(key);
      rec.itemOccurrences += 1;
      rec.totalSpending += Number(item.totalPrice) || 0;
    }
    for (const key of vendorsInThisEvent) byKey.get(key).eventIds.add(ev.eventId);
  }
  return [...byKey.values()].map((r) => ({
    vendor: r.vendor,
    eventCount: r.eventIds.size,
    itemOccurrences: r.itemOccurrences,
    totalSpending: r.totalSpending,
    avgSpendingPerEvent: r.eventIds.size ? r.totalSpending / r.eventIds.size : 0,
  }));
}

// Item aggregation. "eventCount" = distinct events the item appeared in,
// "occurrences" = number of line entries across all events (an item can
// appear more than once per event with different vendors), "totalQty" =
// sum of pcs, kept separate from both of the above per the spec.
function aggregateItems(events) {
  const labelMap = buildLabelMap(events, (i) => i.itemName);
  const byKey = new Map();
  for (const ev of events) {
    const itemsInThisEvent = new Set();
    for (const item of ev.items) {
      const key = canonicalKey(item.itemName);
      if (!key) continue;
      itemsInThisEvent.add(key);
      if (!byKey.has(key)) {
        byKey.set(key, { itemName: labelMap.get(key), eventIds: new Set(), occurrences: 0, totalQty: 0, totalSpending: 0 });
      }
      const rec = byKey.get(key);
      rec.occurrences += 1;
      rec.totalQty += Number(item.quantity) || 0;
      rec.totalSpending += Number(item.totalPrice) || 0;
    }
    for (const key of itemsInThisEvent) byKey.get(key).eventIds.add(ev.eventId);
  }
  return [...byKey.values()].map((r) => ({
    itemName: r.itemName,
    eventCount: r.eventIds.size,
    occurrences: r.occurrences,
    totalQty: r.totalQty,
    totalSpending: r.totalSpending,
  }));
}

// Item x Vendor combinations — the pairing the spec calls a headline
// visualization.
function aggregateItemVendor(events) {
  const itemLabels = buildLabelMap(events, (i) => i.itemName);
  const vendorLabels = buildLabelMap(events, (i) => i.vendor);
  const byKey = new Map();
  for (const ev of events) {
    for (const item of ev.items) {
      const itemKey = canonicalKey(item.itemName);
      const vendorKey = canonicalKey(item.vendor);
      if (!itemKey || !vendorKey) continue;
      const key = itemKey + "::" + vendorKey;
      if (!byKey.has(key)) {
        byKey.set(key, {
          itemName: itemLabels.get(itemKey),
          vendor: vendorLabels.get(vendorKey),
          frequency: 0,
          totalPcs: 0,
          totalSpending: 0,
        });
      }
      const rec = byKey.get(key);
      rec.frequency += 1;
      rec.totalPcs += Number(item.quantity) || 0;
      rec.totalSpending += Number(item.totalPrice) || 0;
    }
  }
  return [...byKey.values()];
}

// ISO-week number (1-53) within the event's own year, used for the "peak
// week" view. Weeks are Monday-start.
function isoWeek(dateStr) {
  const d = new Date(Date.UTC(new Date(dateStr).getFullYear(), new Date(dateStr).getMonth(), new Date(dateStr).getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return week;
}

function aggregatePeakWeek(events) {
  const byWeek = new Map();
  for (const ev of events) {
    const w = isoWeek(ev.eventDate);
    byWeek.set(w, (byWeek.get(w) || 0) + 1);
  }
  return [...byWeek.entries()].map(([week, count]) => ({ week, count })).sort((a, b) => a.week - b.week);
}

const MONTH_LABELS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function aggregatePeakMonth(events) {
  const byMonth = new Map();
  for (const ev of events) {
    const m = new Date(ev.eventDate).getMonth();
    byMonth.set(m, (byMonth.get(m) || 0) + 1);
  }
  return MONTH_LABELS_ID.map((label, m) => ({ month: m, label, count: byMonth.get(m) || 0 }));
}

// Monthly spending + event count timeline, keyed by calendar month across
// the full span of the dataset (not just months with SAMPLE_EVENTS entries)
// so trend lines don't skip gaps.
function aggregateMonthlyTimeline(events) {
  if (events.length === 0) return [];
  const byMonth = new Map();
  for (const ev of events) {
    const d = new Date(ev.eventDate);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    if (!byMonth.has(key)) byMonth.set(key, { key, year: d.getFullYear(), month: d.getMonth(), spending: 0, eventCount: 0 });
    const rec = byMonth.get(key);
    rec.eventCount += 1;
    rec.spending += ev.items.reduce((s, i) => s + (Number(i.totalPrice) || 0), 0);
  }
  return [...byMonth.values()]
    .sort((a, b) => (a.year - b.year) || (a.month - b.month))
    .map((r) => ({ ...r, label: MONTH_LABELS_ID[r.month] + " " + r.year, avgPerEvent: r.eventCount ? r.spending / r.eventCount : 0 }));
}

function getLastUpdated(events) {
  if (events.length === 0) return null;
  return events.reduce((latest, ev) => {
    const t = new Date(ev.submittedAt).getTime();
    return t > latest ? t : latest;
  }, 0);
}

/* -------------------------------------------------------------------------
   Formatting
   ------------------------------------------------------------------------- */

function formatRupiah(value) {
  return "Rp " + Math.round(value).toLocaleString("id-ID");
}

function formatRupiahCompact(value) {
  if (value >= 1e9) return "Rp " + (value / 1e9).toFixed(1).replace(/\.0$/, "") + " M";
  if (value >= 1e6) return "Rp " + (value / 1e6).toFixed(1).replace(/\.0$/, "") + " Jt";
  if (value >= 1e3) return "Rp " + (value / 1e3).toFixed(0) + " Rb";
  return "Rp " + Math.round(value);
}

function formatDateID(dateStr) {
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateTimeID(timestamp) {
  const d = new Date(timestamp);
  const date = d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
  return { date, time: time + " WIB" };
}
