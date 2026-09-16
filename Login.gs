/**
 * Login.gs — Backend Google Apps Script TERPISAH khusus untuk fitur Login.
 *
 * SENGAJA DIPISAH dari Code.gs:
 * - Code.gs (backend EVENTS/ITEMS) dan URL /exec yang sudah dipakai di
 *   js/data.js (CONFIG.API_URL) TIDAK disentuh sama sekali oleh file ini.
 * - File ini di-deploy sebagai Web App TERPISAH, dengan URL /exec-nya
 *   sendiri, lalu ditempel ke js/auth-config.js (AUTH_CONFIG.LOGIN_API_URL).
 *
 * Spreadsheet untuk login HARUS spreadsheet baru (bukan spreadsheet
 * EVENTS/ITEMS), dengan satu sheet bernama "USERS" berkolom:
 *   A: username | B: password
 * (baris 1 = header, data mulai baris 2).
 *
 * Cara pakai:
 * 1. Buat Google Spreadsheet baru, salin ID-nya dari URL.
 * 2. Buat sheet bernama USERS, isi kolom A "username" dan B "password" di
 *    baris 1, lalu isi daftar akun mulai baris 2.
 * 3. Extensions → Apps Script di spreadsheet baru itu, tempel seluruh isi
 *    file ini sebagai project BARU (jangan digabung ke Code.gs).
 * 4. Ganti LOGIN_SPREADSHEET_ID di bawah dengan ID dari langkah 1.
 * 5. Deploy → New deployment → Web app (Execute as: Me, Who has access:
 *    Anyone), lalu salin URL /exec ke js/auth-config.js.
 */

const LOGIN_SPREADSHEET_ID = "PASTE_SPREADSHEET_ID_LOGIN_DI_SINI";
const USERS_SHEET_NAME = "USERS";

function loginSs_() {
  if (!LOGIN_SPREADSHEET_ID || LOGIN_SPREADSHEET_ID === "PASTE_SPREADSHEET_ID_LOGIN_DI_SINI") {
    throw new Error("LOGIN_SPREADSHEET_ID belum diisi di Login.gs.");
  }
  return SpreadsheetApp.openById(LOGIN_SPREADSHEET_ID);
}

function loginJsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------------------- */
/* POST — login                                                            */
/* ---------------------------------------------------------------------- */
function doPost(e) {
  let payload;

  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return loginJsonResponse_({ ok: false, error: "Invalid JSON body." });
  }

  try {
    if (payload.action !== "login") {
      return loginJsonResponse_({ ok: false, error: "Unknown action." });
    }

    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");

    if (!username || !password) {
      return loginJsonResponse_({ ok: false, error: "Username dan password wajib diisi." });
    }

    const sheet = loginSs_().getSheetByName(USERS_SHEET_NAME);
    if (!sheet) throw new Error("Sheet USERS tidak ditemukan.");

    const rows = sheet.getDataRange().getValues();
    const isMatch = rows.slice(1).some((row) => {
      return String(row[0] || "").trim() === username && String(row[1] || "") === password;
    });

    if (!isMatch) {
      return loginJsonResponse_({ ok: false, error: "Username atau password salah." });
    }

    return loginJsonResponse_({ ok: true, username: username });
  } catch (err) {
    return loginJsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

/* ---------------------------------------------------------------------- */
/* GET — health check                                                       */
/* ---------------------------------------------------------------------- */
function doGet(e) {
  return loginJsonResponse_({
    ok: true,
    message: "Login API aktif. Gunakan POST dengan { action: 'login', username, password }.",
  });
}

/**
 * Jalankan sekali dari editor Apps Script untuk membuat sheet USERS +
 * header-nya jika belum ada (opsional, bisa juga dibuat manual).
 */
function setupLoginSheet() {
  const ss = loginSs_();
  let sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["username", "password"]);
  }
  return { ok: true, sheet: sheet.getName() };
}
