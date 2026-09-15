/**
 * Code.gs — Google Apps Script backend for MAXIMUM THE ULTIMATE.
 *
 * IMPORTANT:
 * - Data is written ONLY to the existing `EVENTS` and `ITEMS` sheets.
 * - ITEM_DICTIONARY and VENDOR_DICTIONARY are NOT created here.
 * - The website uses the bundled dictionary data generated from the supplied
 *   Item_Dictionary.xlsx and Vendor_Dictionary.xlsx files.
 */

const SPREADSHEET_ID = "PASTE_YOUR_SPREADSHEET_ID_HERE";
const EVENTS_SHEET_NAME = "EVENTS";
const ITEMS_SHEET_NAME = "ITEMS";

const EVENTS_HEADERS = [
  "EVENT ID", "USER", "EVENT NAME", "CLIENT", "EVENT PRICE", "EVENT DATE",
  "EVENT DAYS", "GR", "CITY", "COUNTRY", "SUBMITTED AT",
];

const ITEMS_HEADERS = [
  "EVENT ID", "ITEM ID", "ITEM NAME", "CATEGORY", "VENDOR", "QUANTITY",
  "TOTAL PRICE", "KETERANGAN",
];

function ss_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === "PASTE_YOUR_SPREADSHEET_ID_HERE") {
    throw new Error("SPREADSHEET_ID belum diisi di Code.gs.");
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function ensureSheets_() {
  const ss = ss_();
  const eventsSheet = ss.getSheetByName(EVENTS_SHEET_NAME);
  const itemsSheet = ss.getSheetByName(ITEMS_SHEET_NAME);

  if (!eventsSheet) throw new Error("Sheet EVENTS tidak ditemukan.");
  if (!itemsSheet) throw new Error("Sheet ITEMS tidak ditemukan.");

  return { eventsSheet, itemsSheet };
}

function setup() {
  const { eventsSheet, itemsSheet } = ensureSheets_();
  return {
    ok: true,
    eventsSheet: eventsSheet.getName(),
    itemsSheet: itemsSheet.getName(),
    message: "Backend terhubung ke EVENTS dan ITEMS. Dictionary tab tidak dibuat.",
  };
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------------------- */
/* GET                                                                      */
/* ---------------------------------------------------------------------- */
function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : null;

    if (action === "getAnalytics") {
      return jsonResponse_({ ok: true, events: readAllEvents_() });
    }

    if (action === "getDictionaries") {
      // Keep dictionaries outside Data Input. Frontend loadDictionaries()
      // falls back to its bundled 204-item / 15-vendor reference data.
      return jsonResponse_({ ok: true, items: [], vendors: [] });
    }

    return jsonResponse_({
      ok: true,
      message: "MAXIMUM THE ULTIMATE API aktif. Gunakan ?action=getAnalytics atau ?action=getDictionaries.",
    });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

/* ---------------------------------------------------------------------- */
/* Read analytics                                                          */
/* ---------------------------------------------------------------------- */
function readAllEvents_() {
  const { eventsSheet, itemsSheet } = ensureSheets_();

  const eventRows = eventsSheet.getDataRange().getValues();
  const events = eventRows.slice(1)
    .filter((row) => row[0])
    .map((row) => ({
      eventId: String(row[0]),
      user: row[1],
      event: row[2],
      client: row[3],
      eventPrice: Number(row[4]) || 0,
      eventDate: formatDateOnly_(row[5]),
      eventDays: Number(row[6]) || 0,
      gr: Number(row[7]) || 0,
      city: row[8],
      country: row[9],
      submittedAt: row[10] instanceof Date
        ? row[10].toISOString()
        : String(row[10] || ""),
      items: [],
    }));

  const byId = new Map(events.map((ev) => [ev.eventId, ev]));
  const itemRows = itemsSheet.getDataRange().getValues();

  itemRows.slice(1)
    .filter((row) => row[0])
    .forEach((row) => {
      const eventId = String(row[0]);
      const ev = byId.get(eventId);
      if (!ev) return;

      ev.items.push({
        itemCode: row[1],
        itemName: row[2],
        category: row[3],
        vendor: row[4] || "",
        quantity: Number(row[5]) || 0,
        totalPrice: Number(row[6]) || 0,
        description: row[7] || "",
      });
    });

  return events;
}

function formatDateOnly_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value || "");
}

/* ---------------------------------------------------------------------- */
/* Submit report                                                           */
/* ---------------------------------------------------------------------- */
function doPost(e) {
  let payload;

  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return jsonResponse_({ ok: false, error: "Invalid JSON body." });
  }

  try {
    const validationError = validateReport_(payload);
    if (validationError) {
      return jsonResponse_({ ok: false, error: validationError });
    }

    const { eventsSheet, itemsSheet } = ensureSheets_();

    if (!payload.eventId) {
      payload.eventId = makeEventId_(eventsSheet, payload.eventDate);
    }

    // Prevent the exact same event_id from being stored twice.
    const existingIds = eventsSheet.getLastRow() > 1
      ? eventsSheet.getRange(2, 1, eventsSheet.getLastRow() - 1, 1).getValues().flat()
      : [];

    if (existingIds.includes(payload.eventId)) {
      return jsonResponse_({
        ok: true,
        eventId: payload.eventId,
        note: "Duplicate submission ignored.",
      });
    }

    eventsSheet.appendRow([
      payload.eventId,
      payload.user,
      payload.event,
      payload.client,
      payload.eventPrice,
      payload.eventDate,
      payload.eventDays,
      payload.gr,
      payload.city,
      payload.country,
      payload.submittedAt || new Date().toISOString(),
    ]);

    (Array.isArray(payload.items) ? payload.items : []).forEach((item) => {
      itemsSheet.appendRow([
        payload.eventId,
        item.itemCode,
        item.itemName,
        item.category,
        item.vendor,
        Number(item.quantity) || 0,
        Number(item.totalPrice) || 0,
        item.description || "",
      ]);
    });

    return jsonResponse_({ ok: true, eventId: payload.eventId });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

function makeEventId_(eventsSheet, eventDate) {
  const d = new Date(eventDate);
  if (isNaN(d.getTime())) throw new Error("eventDate tidak valid.");

  const tz = Session.getScriptTimeZone();
  const month = Utilities.formatDate(d, tz, "MM");
  const year = Utilities.formatDate(d, tz, "yyyy");

  let count = 0;
  if (eventsSheet.getLastRow() > 1) {
    const dates = eventsSheet
      .getRange(2, 6, eventsSheet.getLastRow() - 1, 1)
      .getValues()
      .flat();

    dates.forEach((v) => {
      if (!v) return;
      const rowDate = v instanceof Date ? v : new Date(v);
      if (!isNaN(rowDate.getTime()) &&
          Utilities.formatDate(rowDate, tz, "MM-yyyy") === `${month}-${year}`) {
        count += 1;
      }
    });
  }

  return `${month}-ke-${String(count + 1).padStart(2, "0")}-ke-${year}`;
}

function validateReport_(p) {
  if (!p) return "Empty payload.";

  const requiredStrings = [
    "user", "event", "client", "eventDate", "eventDateEnd", "city", "country",
  ];

  for (const key of requiredStrings) {
    if (!p[key] || typeof p[key] !== "string" || !p[key].trim()) {
      return "Missing or invalid field: " + key;
    }
  }

  const start = new Date(p.eventDate);
  const end = new Date(p.eventDateEnd);
  if (isNaN(start.getTime())) return "Invalid eventDate.";
  if (isNaN(end.getTime())) return "Invalid eventDateEnd.";
  if (end < start) return "eventDateEnd must not be before eventDate.";

  if (typeof p.eventPrice !== "number" || p.eventPrice < 0) {
    return "Invalid eventPrice.";
  }
  if (!Number.isInteger(p.eventDays) || p.eventDays < 1) {
    return "eventDays must be an integer >= 1.";
  }
  if (!Number.isInteger(p.gr) || p.gr < 0) {
    return "gr must be an integer >= 0.";
  }
  if (p.items && !Array.isArray(p.items)) {
    return "items must be an array.";
  }

  for (const item of p.items || []) {
    if (!item.itemCode || !item.itemName || !item.category || !item.vendor) {
      return "Every item needs itemCode, itemName, category, and vendor.";
    }
    if (typeof item.quantity !== "number" || item.quantity <= 0) {
      return "Every item's quantity must be a positive number.";
    }
    if (typeof item.totalPrice !== "number" || item.totalPrice < 0) {
      return "Every item's totalPrice must be a non-negative number.";
    }
  }

  return null;
}
