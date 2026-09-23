/**
 * Code.gs — Google Apps Script backend for MAXIMUM THE ULTIMATE.
 *
 * IMPORTANT:
 * - Data laporan (EVENTS/ITEMS) ditulis HANYA ke sheet `EVENTS` dan `ITEMS`.
 * - REVISI (dictionary live sync): `ITEM_DICTIONARY` dan `VENDOR_DICTIONARY`
 *   sekarang DIBUAT & DIBACA dari spreadsheet yang sama (lihat
 *   ensureDictionarySheets_ / getDictionariesCached_ di bawah), supaya
 *   Kategori & Nama Vendor di form Input Report bisa diedit langsung dari
 *   spreadsheet tanpa perlu redeploy Code.gs. Array bundled di js/data.js
 *   tetap ada, tapi sekarang HANYA dipakai sebagai fallback (mode demo
 *   tanpa backend, atau kalau fetch ke Apps Script gagal).
 *
 * REVISI: fitur Edit Laporan + penyimpanan Status Pembayaran (Lunas/DP) +
 * caching supaya "Analytics" & "Daftar Event" tidak selalu membaca ulang
 * seluruh spreadsheet dari nol setiap request (lihat catatan CACHING di
 * bawah, dan SETUP_FIX.md untuk perubahan kolom sheet ITEMS yang WAJIB
 * dilakukan manual satu kali).
 */

const SPREADSHEET_ID = "PASTE_YOUR_SPREADSHEET_ID_HERE";
const EVENTS_SHEET_NAME = "EVENTS";
const ITEMS_SHEET_NAME = "ITEMS";
const ITEM_DICTIONARY_SHEET_NAME = "ITEM_DICTIONARY";
const VENDOR_DICTIONARY_SHEET_NAME = "VENDOR_DICTIONARY";

const ITEM_DICTIONARY_HEADERS = ["ITEM ID", "KATEGORI", "NAMA ITEM STANDAR", "SATUAN STANDAR"];
const VENDOR_DICTIONARY_HEADERS = ["VENDOR ID", "NAMA VENDOR", "KATEGORI LAYANAN"];

const EVENTS_HEADERS = [
  "EVENT ID", "USER", "EVENT NAME", "CLIENT", "EVENT PRICE", "EVENT DATE",
  "EVENT DAYS", "GR", "CITY", "COUNTRY", "SUBMITTED AT",
];

// NOTE: "PAYMENT STATUS" & "NOMINAL DP" ditambahkan DI AKHIR (bukan di
// tengah) supaya kolom lama (EVENT ID..KETERANGAN) tidak bergeser posisi.
// WAJIB: tambahkan 2 kolom ini di sheet ITEMS Anda, persis di kolom I & J,
// dengan header persis "PAYMENT STATUS" dan "NOMINAL DP". Lihat SETUP_FIX.md.
const ITEMS_HEADERS = [
  "EVENT ID", "ITEM ID", "ITEM NAME", "CATEGORY", "VENDOR", "QUANTITY",
  "TOTAL PRICE", "KETERANGAN", "PAYMENT STATUS", "NOMINAL DP",
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

// Membuat sheet ITEM_DICTIONARY / VENDOR_DICTIONARY kalau belum ada (hanya
// header, tanpa data) supaya Anda tinggal mengisi/mengimpor barisnya. Kalau
// sheetnya sudah ada, dibiarkan apa adanya (tidak menimpa data yang sudah
// Anda isi).
function ensureDictionarySheets_() {
  const ss = ss_();
  let itemDictSheet = ss.getSheetByName(ITEM_DICTIONARY_SHEET_NAME);
  if (!itemDictSheet) {
    itemDictSheet = ss.insertSheet(ITEM_DICTIONARY_SHEET_NAME);
    itemDictSheet.appendRow(ITEM_DICTIONARY_HEADERS);
    itemDictSheet.setFrozenRows(1);
  }
  let vendorDictSheet = ss.getSheetByName(VENDOR_DICTIONARY_SHEET_NAME);
  if (!vendorDictSheet) {
    vendorDictSheet = ss.insertSheet(VENDOR_DICTIONARY_SHEET_NAME);
    vendorDictSheet.appendRow(VENDOR_DICTIONARY_HEADERS);
    vendorDictSheet.setFrozenRows(1);
  }
  return { itemDictSheet, vendorDictSheet };
}

function setup() {
  const { eventsSheet, itemsSheet } = ensureSheets_();
  const { itemDictSheet, vendorDictSheet } = ensureDictionarySheets_();
  return {
    ok: true,
    eventsSheet: eventsSheet.getName(),
    itemsSheet: itemsSheet.getName(),
    itemDictionarySheet: itemDictSheet.getName(),
    vendorDictionarySheet: vendorDictSheet.getName(),
    message: "Backend terhubung ke EVENTS dan ITEMS. Sheet ITEM_DICTIONARY dan " +
      "VENDOR_DICTIONARY dibuat (kalau belum ada) — isi/import barisnya lalu " +
      "dropdown Kategori & Nama Vendor di form akan otomatis ikut berubah.",
  };
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------------------- */
/* CACHING — supaya "Analytics" & "Daftar Event" tidak membaca ulang       */
/* seluruh sheet dari nol setiap kali dibuka (ini salah satu penyebab      */
/* utama "memuat data lama"). Cache di-invalidate otomatis setiap ada      */
/* submit/update baru lewat doPost.                                       */
/* ---------------------------------------------------------------------- */
const EVENTS_CACHE_KEY = "mx_events_cache_v2";
const EVENTS_CACHE_TTL_SECONDS = 120; // 2 menit

function getEventsCached_() {
  const cache = CacheService.getScriptCache();
  try {
    const cached = cache.get(EVENTS_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    // Cache tidak terbaca — lanjut baca langsung dari sheet.
  }

  const events = readAllEvents_();

  try {
    cache.put(EVENTS_CACHE_KEY, JSON.stringify(events), EVENTS_CACHE_TTL_SECONDS);
  } catch (e) {
    // Dataset terlalu besar untuk cache (limit ~100KB/key) — abaikan saja,
    // request tetap berhasil, hanya tidak dipercepat oleh cache.
  }

  return events;
}

function invalidateEventsCache_() {
  try {
    CacheService.getScriptCache().remove(EVENTS_CACHE_KEY);
  } catch (e) {
    // no-op
  }
}

/* ---------------------------------------------------------------------- */
/* Dictionaries (ITEM_DICTIONARY / VENDOR_DICTIONARY) — live dari sheet,   */
/* di-cache singkat (60 detik) supaya edit di spreadsheet terlihat di      */
/* website tanpa redeploy, tapi sheet tidak dibaca ulang di SETIAP request.*/
/* Pakai ?action=getDictionaries&nocache=1 untuk memaksa baca langsung.    */
/* ---------------------------------------------------------------------- */
const DICTIONARIES_CACHE_KEY = "mx_dictionaries_cache_v1";
const DICTIONARIES_CACHE_TTL_SECONDS = 60;

// Sheet -> array of objects, berdasarkan header baris pertama. Baris tanpa
// nilai di kolom pertama dilewati (dianggap baris kosong).
function sheetToObjects_(sheet, headers, keys) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  return values.slice(1)
    .filter((row) => String(row[0] || "").trim() !== "")
    .map((row) => {
      const obj = {};
      keys.forEach((key, i) => { obj[key] = row[i] !== undefined ? row[i] : ""; });
      return obj;
    });
}

function readItemDictionary_() {
  const { itemDictSheet } = ensureDictionarySheets_();
  return sheetToObjects_(itemDictSheet, ITEM_DICTIONARY_HEADERS,
    ["itemId", "kategori", "namaItemStandar", "satuanStandar"]);
}

function readVendorDictionary_() {
  const { vendorDictSheet } = ensureDictionarySheets_();
  return sheetToObjects_(vendorDictSheet, VENDOR_DICTIONARY_HEADERS,
    ["vendorId", "namaVendor", "kategoriLayanan"]);
}

function getDictionariesCached_(skipCache) {
  const cache = CacheService.getScriptCache();
  if (!skipCache) {
    try {
      const cached = cache.get(DICTIONARIES_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      // Cache tidak terbaca — lanjut baca langsung dari sheet.
    }
  }

  const result = { items: readItemDictionary_(), vendors: readVendorDictionary_() };

  try {
    cache.put(DICTIONARIES_CACHE_KEY, JSON.stringify(result), DICTIONARIES_CACHE_TTL_SECONDS);
  } catch (e) {
    // Dataset terlalu besar untuk cache — abaikan, tetap berhasil dibaca.
  }

  return result;
}

/* ---------------------------------------------------------------------- */
/* GET                                                                      */
/* ---------------------------------------------------------------------- */
function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : null;

    if (action === "getAnalytics") {
      return jsonResponse_({ ok: true, events: getEventsCached_() });
    }

    // Daftar event ringkas (TANPA daftar item) untuk halaman "Daftar Event"
    // — jauh lebih ringan/cepat daripada getAnalytics karena tidak perlu
    // mengirim seluruh baris ITEMS ke browser.
    if (action === "getEventsList") {
      const events = getEventsCached_();
      const list = events.map((ev) => ({
        eventId: ev.eventId,
        event: ev.event,
        client: ev.client,
        city: ev.city,
        country: ev.country,
        eventDate: ev.eventDate,
        eventDays: ev.eventDays,
        eventPrice: ev.eventPrice,
        submittedAt: ev.submittedAt,
        itemCount: ev.items.length,
      }));
      return jsonResponse_({ ok: true, events: list });
    }

    // Satu event lengkap (dengan item) berdasarkan eventId — dipakai untuk
    // mengisi ulang form Input Report saat tombol "Edit" diklik.
    if (action === "getEventById") {
      const id = String((e.parameter && e.parameter.eventId) || "");
      if (!id) return jsonResponse_({ ok: false, error: "Parameter eventId wajib diisi." });
      const events = getEventsCached_();
      const found = events.find((ev) => String(ev.eventId) === id);
      if (!found) return jsonResponse_({ ok: false, error: "Event tidak ditemukan." });
      return jsonResponse_({ ok: true, event: found });
    }

    if (action === "getDictionaries") {
      // Dibaca LIVE dari sheet ITEM_DICTIONARY & VENDOR_DICTIONARY (dengan
      // cache 60 detik). Kalau kedua sheet itu masih kosong (baru dibuat,
      // belum diisi), items/vendors akan kosong dan frontend otomatis
      // jatuh ke data bundled di js/data.js sebagai fallback.
      const skipCache = String(e.parameter && e.parameter.nocache) === "1";
      return jsonResponse_(Object.assign({ ok: true }, getDictionariesCached_(skipCache)));
    }

    return jsonResponse_({
      ok: true,
      message: "MAXIMUM THE ULTIMATE API aktif. Gunakan ?action=getAnalytics, ?action=getEventsList, ?action=getEventById&eventId=... atau ?action=getDictionaries.",
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

      const totalPrice = Number(row[6]) || 0;
      // Kolom baru (index 8 & 9) mungkin belum ada nilainya untuk baris
      // lama yang disubmit sebelum revisi ini — dibiarkan kosong/"" dan
      // akan ditandai "Tidak Diketahui" oleh frontend (ensurePaymentFields
      // di js/data.js), bukan ditebak jadi Lunas/DP.
      const paymentStatus = row[8] ? String(row[8]) : "";
      const nominalDP = paymentStatus ? (Number(row[9]) || 0) : 0;
      const sisaDP = paymentStatus === "Lunas" ? 0 : Math.max(0, totalPrice - nominalDP);

      const item = {
        itemCode: row[1],
        itemName: row[2],
        category: row[3],
        vendor: row[4] || "",
        quantity: Number(row[5]) || 0,
        totalPrice: totalPrice,
        description: row[7] || "",
      };
      if (paymentStatus) {
        item.paymentStatus = paymentStatus;
        item.nominalDP = nominalDP;
        item.sisaDP = sisaDP;
      }
      ev.items.push(item);
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
/* Submit report (create) / Update report (edit)                          */
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

    // ---- EDIT: eventId sudah ada dan payload.isEdit=true -> update di
    // tempat (bukan menambah baris baru). Dipakai oleh tombol "Edit" di
    // halaman Daftar Event.
    if (payload.eventId && payload.isEdit) {
      const result = updateEvent_(payload, eventsSheet, itemsSheet);
      if (result.ok) invalidateEventsCache_();
      return jsonResponse_(result);
    }

    // ---- CREATE (perilaku lama, tidak diubah) ----
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
        item.paymentStatus || "",
        Number(item.nominalDP) || 0,
      ]);
    });

    invalidateEventsCache_();
    return jsonResponse_({ ok: true, eventId: payload.eventId });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

/**
 * Update satu event yang sudah ada: timpa barisnya di EVENTS (SUBMITTED AT
 * asli dipertahankan, tidak ditimpa), lalu ganti seluruh baris ITEMS milik
 * eventId tsb dengan daftar item yang baru dikirim dari form.
 */
function updateEvent_(payload, eventsSheet, itemsSheet) {
  const data = eventsSheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(payload.eventId)) {
      rowIndex = i;
      break;
    }
  }

  if (rowIndex === -1) {
    return { ok: false, error: "Event dengan ID " + payload.eventId + " tidak ditemukan untuk diedit." };
  }

  const originalSubmittedAt = data[rowIndex][10];

  eventsSheet.getRange(rowIndex + 1, 1, 1, EVENTS_HEADERS.length).setValues([[
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
    originalSubmittedAt,
  ]]);

  // Ganti semua baris ITEMS milik eventId ini: simpan baris milik event
  // LAIN apa adanya, buang baris lama milik eventId ini, lalu tulis ulang
  // item yang baru dikirim dari form edit.
  const itemsData = itemsSheet.getDataRange().getValues();
  const header = itemsData.length ? itemsData[0] : ITEMS_HEADERS;
  const keptRows = itemsData.slice(1).filter((row) => String(row[0]) !== String(payload.eventId));

  itemsSheet.clearContents();
  itemsSheet.getRange(1, 1, 1, header.length).setValues([header]);
  if (keptRows.length) {
    itemsSheet.getRange(2, 1, keptRows.length, header.length).setValues(keptRows);
  }

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
      item.paymentStatus || "",
      Number(item.nominalDP) || 0,
    ]);
  });

  return { ok: true, eventId: payload.eventId, updated: true };
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
