/**
 * Code.gs — Google Apps Script backend for the Event Data Story app.
 *
 * Architecture: Website (index/input/analytics.html) -> this Web App -> a
 * Google Spreadsheet with two sheets, EVENTS and ITEMS.
 *
 * SETUP
 * 1. Create (or open) a Google Spreadsheet and copy its ID from the URL:
 *    https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
 * 2. Paste that ID into SPREADSHEET_ID below.
 * 3. Extensions -> Apps Script, paste this whole file in as Code.gs.
 * 4. Run `setup` once from the Apps Script editor to create the EVENTS,
 *    ITEMS, ITEM_DICTIONARY, and VENDOR_DICTIONARY sheets with headers (or
 *    just call any endpoint once — doGet/doPost/getDictionaries all call
 *    ensureSheets_ automatically).
 * 5. Import the dictionary data: open Item_Dictionary.xlsx and
 *    Vendor_Dictionary.xlsx, copy their rows (everything below the header),
 *    and paste into the ITEM_DICTIONARY / VENDOR_DICTIONARY sheets this
 *    script just created (starting at row 2, headers already match).
 * 6. Deploy -> New deployment -> Web app.
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    Copy the resulting /exec URL into CONFIG.API_URL in js/data.js.
 *
 * Once CONFIG.API_URL is set, the Item ID / Vendor dropdown-search fields in
 * input.html read live from ITEM_DICTIONARY / VENDOR_DICTIONARY (via
 * ?action=getDictionaries) instead of the bundled fallback data in
 * js/data.js — so editing those two sheets updates the dropdowns for
 * everyone without a redeploy.
 */

const SPREADSHEET_ID = "PASTE_YOUR_SPREADSHEET_ID_HERE";
const EVENTS_SHEET_NAME = "sheets events";
const ITEMS_SHEET_NAME = "sheets item";

const EVENTS_HEADERS = [
  "event_id", "user", "event_name", "client", "event_price", "event_date",
  "event_end_date", "event_days", "gr", "city", "country", "submitted_at",
];
const ITEMS_HEADERS = [
  "item_id", "event_id", "item_code", "item_name", "category", "description", "vendor",
  "quantity", "total_price",
];
// ITEM_DICTIONARY / VENDOR_DICTIONARY: master reference sheets that power
// the Item ID / Vendor dropdown-search fields in input.html. Import
// Item_Dictionary.xlsx and Vendor_Dictionary.xlsx as sheets with these exact
// names (or paste their rows into sheets you create with these names) —
// ensureSheets_ only creates the header row if the sheet doesn't exist yet,
// it never overwrites existing data.
const ITEM_DICTIONARY_HEADERS = ["item_id", "kategori", "nama_item_standar", "satuan_standar"];
const VENDOR_DICTIONARY_HEADERS = ["vendor_id", "nama_vendor", "kategori_layanan"];

function ss_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function ensureSheets_() {
  const ss = ss_();
  let eventsSheet = ss.getSheetByName(EVENTS_SHEET_NAME);
  if (!eventsSheet) {
    eventsSheet = ss.insertSheet(EVENTS_SHEET_NAME);
    eventsSheet.appendRow(EVENTS_HEADERS);
  }
  let itemsSheet = ss.getSheetByName(ITEMS_SHEET_NAME);
  if (!itemsSheet) {
    itemsSheet = ss.insertSheet(ITEMS_SHEET_NAME);
    itemsSheet.appendRow(ITEMS_HEADERS);
  }
  let itemDictSheet = ss.getSheetByName("ITEM_DICTIONARY");
  if (!itemDictSheet) {
    itemDictSheet = ss.insertSheet("ITEM_DICTIONARY");
    itemDictSheet.appendRow(ITEM_DICTIONARY_HEADERS);
  }
  let vendorDictSheet = ss.getSheetByName("VENDOR_DICTIONARY");
  if (!vendorDictSheet) {
    vendorDictSheet = ss.insertSheet("VENDOR_DICTIONARY");
    vendorDictSheet.appendRow(VENDOR_DICTIONARY_HEADERS);
  }
  return { eventsSheet, itemsSheet, itemDictSheet, vendorDictSheet };
}

function setup() {
  ensureSheets_();
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------------------- */
/* GET — analytics read                                                    */
/* ---------------------------------------------------------------------- */
function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : null;
  if (action === "getAnalytics") {
    return jsonResponse_({ events: readAllEvents_() });
  }
  if (action === "getDictionaries") {
    return jsonResponse_(readDictionaries_());
  }
  return jsonResponse_({ ok: true, message: "Event Data Story API is running. Use ?action=getAnalytics or ?action=getDictionaries to read data." });
}

// Reads ITEM_DICTIONARY and VENDOR_DICTIONARY into the shape js/data.js
// expects (loadDictionaries() in js/data.js): { items: [...], vendors: [...] }.
function readDictionaries_() {
  const { itemDictSheet, vendorDictSheet } = ensureSheets_();

  const itemValues = itemDictSheet.getDataRange().getValues();
  const itemHeader = itemValues.shift() || [];
  const items = itemValues
    .filter((row) => row[0])
    .map((row) => {
      const rec = {};
      itemHeader.forEach((h, i) => (rec[h] = row[i]));
      return {
        itemId: String(rec.item_id),
        kategori: rec.kategori,
        namaItemStandar: rec.nama_item_standar,
        satuanStandar: rec.satuan_standar,
      };
    });

  const vendorValues = vendorDictSheet.getDataRange().getValues();
  const vendorHeader = vendorValues.shift() || [];
  const vendors = vendorValues
    .filter((row) => row[0])
    .map((row) => {
      const rec = {};
      vendorHeader.forEach((h, i) => (rec[h] = row[i]));
      return {
        vendorId: String(rec.vendor_id),
        namaVendor: rec.nama_vendor,
        kategoriLayanan: rec.kategori_layanan,
      };
    });

  return { items, vendors };
}

function readAllEvents_() {
  const { eventsSheet, itemsSheet } = ensureSheets_();

  const eventsValues = eventsSheet.getDataRange().getValues();
  const eventsHeader = eventsValues.shift() || [];
  const events = eventsValues
    .filter((row) => row[0]) // skip blank trailing rows
    .map((row) => {
      const rec = {};
      eventsHeader.forEach((h, i) => (rec[h] = row[i]));
      return {
        eventId: String(rec.event_id),
        user: rec.user,
        event: rec.event_name,
        client: rec.client,
        eventPrice: Number(rec.event_price) || 0,
        eventDate: formatDateOnly_(rec.event_date),
        eventDateEnd: formatDateOnly_(rec.event_end_date),
        eventDays: Number(rec.event_days) || 0,
        gr: Number(rec.gr) || 0,
        city: rec.city,
        country: rec.country,
        submittedAt: rec.submitted_at instanceof Date ? rec.submitted_at.toISOString() : String(rec.submitted_at),
        items: [],
      };
    });

  const byId = new Map(events.map((ev) => [ev.eventId, ev]));

  const itemsValues = itemsSheet.getDataRange().getValues();
  const itemsHeader = itemsValues.shift() || [];
  itemsValues
    .filter((row) => row[0])
    .forEach((row) => {
      const rec = {};
      itemsHeader.forEach((h, i) => (rec[h] = row[i]));
      const ev = byId.get(String(rec.event_id));
      if (!ev) return;
      ev.items.push({
        itemCode: rec.item_code,
        itemName: rec.item_name,
        category: rec.category,
        description: rec.description || "",
        vendor: rec.vendor || rec.vendor_name || "",
        quantity: Number(rec.quantity) || 0,
        totalPrice: Number(rec.total_price) || 0,
      });
    });

  return events;
}

function formatDateOnly_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value);
}

/* ---------------------------------------------------------------------- */
/* POST — submit a report                                                  */
/* ---------------------------------------------------------------------- */
function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ ok: false, error: "Invalid JSON body." });
  }

  const validationError = validateReport_(payload);
  if (validationError) {
    return jsonResponse_({ ok: false, error: validationError });
  }

  const { eventsSheet, itemsSheet } = ensureSheets_();

  // Generate Event ID centrally so every client uses one consistent format: MM-ke-NN-ke-YYYY.
  if (!payload.eventId) payload.eventId = makeEventId_(eventsSheet, payload.eventDate);

  // Duplicate-submission guard: same event_id already stored.
  const existingIds = eventsSheet.getLastRow() > 1
    ? eventsSheet.getRange(2, 1, eventsSheet.getLastRow() - 1, 1).getValues().flat()
    : [];
  if (existingIds.indexOf(payload.eventId) !== -1) {
    return jsonResponse_({ ok: true, eventId: payload.eventId, note: "Duplicate submission ignored." });
  }

  eventsSheet.appendRow([
    payload.eventId,
    payload.user,
    payload.event,
    payload.client,
    payload.eventPrice,
    payload.eventDate,
    payload.eventDateEnd,
    payload.eventDays,
    payload.gr,
    payload.city,
    payload.country,
    payload.submittedAt || new Date().toISOString(),
  ]);

  const items = Array.isArray(payload.items) ? payload.items : [];
  items.forEach((item, i) => {
    itemsSheet.appendRow([
      payload.eventId + "-item-" + (i + 1),
      payload.eventId,
      item.itemCode,
      item.itemName,
      item.category,
      item.description || "",
      item.vendor,
      Number(item.quantity) || 0,
      Number(item.totalPrice) || 0,
    ]);
  });

  return jsonResponse_({ ok: true, eventId: payload.eventId });
}

function makeEventId_(eventsSheet, eventDate) {
  const d = new Date(eventDate);
  const tz = Session.getScriptTimeZone();
  const month = Utilities.formatDate(d, tz, "MM");
  const year = Utilities.formatDate(d, tz, "yyyy");
  let count = 0;
  if (eventsSheet.getLastRow() > 1) {
    const dates = eventsSheet.getRange(2, 6, eventsSheet.getLastRow() - 1, 1).getValues().flat();
    dates.forEach((v) => {
      if (!v) return;
      const rowDate = v instanceof Date ? v : new Date(v);
      if (!isNaN(rowDate.getTime()) && Utilities.formatDate(rowDate, tz, "MM-yyyy") === `${month}-${year}`) count += 1;
    });
  }
  return `${month}-ke-${String(count + 1).padStart(2, "0")}-ke-${year}`;
}

// Backend validation, independent of whatever the frontend already checked
// (per spec: never trust the frontend alone).
function validateReport_(p) {
  if (!p) return "Empty payload.";
  const requiredStrings = ["user", "event", "client", "eventDate", "eventDateEnd", "city", "country"];
  for (const key of requiredStrings) {
    if (!p[key] || typeof p[key] !== "string" || !p[key].trim()) return "Missing or invalid field: " + key;
  }
  const start = new Date(p.eventDate);
  const end = new Date(p.eventDateEnd);
  if (isNaN(start.getTime())) return "Invalid eventDate.";
  if (isNaN(end.getTime())) return "Invalid eventDateEnd.";
  if (end < start) return "eventDateEnd must not be before eventDate.";
  if (typeof p.eventPrice !== "number" || p.eventPrice < 0) return "Invalid eventPrice.";
  if (!Number.isInteger(p.eventDays) || p.eventDays < 1) return "eventDays must be an integer >= 1.";
  if (!Number.isInteger(p.gr) || p.gr < 0) return "gr must be an integer >= 0.";
  if (p.items && !Array.isArray(p.items)) return "items must be an array.";
  for (const item of p.items || []) {
    if (!item.itemCode || !item.itemName || !item.category || !item.vendor) return "Every item needs itemCode, itemName, category, and vendor.";
    if (typeof item.quantity !== "number" || item.quantity <= 0) return "Every item's quantity must be a positive number.";
    if (typeof item.totalPrice !== "number" || item.totalPrice < 0) return "Every item's totalPrice must be a non-negative number.";
  }
  return null;
}
