/* =========================================================================
   outbox.js — kirim laporan di LATAR BELAKANG (tanpa layar loading).

   Alurnya:
   1. Saat pengguna menekan Submit/Update di pratinjau, laporan lebih dulu
      disimpan ke antrean lokal (localStorage) — ini instan.
   2. Halaman langsung lanjut (form dikosongkan / pindah ke Daftar Event).
   3. Pengiriman ke server tetap memakai submitEvent() di js/data.js
      (tidak diubah), tetapi berjalan di belakang layar. Kalau berhasil,
      laporan dihapus dari antrean. Kalau gagal (offline / server lambat),
      laporan TETAP tersimpan di antrean dan dicoba lagi otomatis — juga
      saat halaman Input atau Daftar Event dibuka lagi.

   Efeknya: data baru boleh telat muncul di Analytics / spreadsheet, tapi
   pengguna tidak perlu menunggu, dan data tidak hilang kalau koneksi putus.
   ========================================================================= */
(function () {
  var KEY = "mx_outbox_v1";
  var LOCK_MS = 60000;      // entri yang sedang dikirim tab lain tidak dikirim ulang selama ini
  var MAX_AUTO_RETRY = 5;   // percobaan ulang otomatis per sesi halaman
  var flushing = false;
  var retryCount = 0;
  var retryTimer = null;
  var toastEl = null;
  var toastTimer = null;

  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (_) { return []; }
  }
  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch (_) { return false; }
  }
  function patch(id, fn) {
    var list = read();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { fn(list[i]); break; }
    }
    write(list);
  }
  function remove(id) {
    write(read().filter(function (e) { return e.id !== id; }));
  }

  // Menambah laporan ke antrean. Mengembalikan entri, atau null kalau
  // penyimpanan lokal tidak tersedia (pemanggil harus pakai jalur biasa).
  function enqueue(report) {
    var list = read();
    // Edit event yang sama: antrean lama yang belum terkirim dibuang, yang terbaru menang.
    if (report && report.isEdit && report.eventId) {
      list = list.filter(function (e) {
        return !(e.report && e.report.isEdit && String(e.report.eventId) === String(report.eventId));
      });
    }
    var entry = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      report: report,
      addedAt: Date.now(),
      sendingAt: 0
    };
    list.push(entry);
    return write(list) ? entry : null;
  }

  function pending() { return read(); }

  function isNetworkOrServerError(err) {
    if (!err) return true;
    if (err instanceof TypeError) return true; // "Failed to fetch"
    return /^Failed to submit report/i.test(String(err.message || ""));
  }

  function notify(message, kind, sticky) {
    try {
      if (!document.body) return;
      if (toastEl) { toastEl.remove(); toastEl = null; }
      clearTimeout(toastTimer);
      var el = document.createElement("div");
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.textContent = message;
      el.style.cssText =
        "position:fixed;left:24px;bottom:24px;max-width:340px;padding:14px 18px;" +
        "border-radius:10px;font:500 0.88rem/1.45 var(--font-sans,system-ui,sans-serif);" +
        "z-index:70;box-shadow:0 12px 30px rgba(0,0,0,.22);cursor:pointer;" +
        (kind === "error"
          ? "background:#c1352e;color:#fff;"
          : "background:var(--ink,#1b1b1f);color:var(--paper,#fff);");
      el.addEventListener("click", function () { el.remove(); if (toastEl === el) toastEl = null; });
      document.body.appendChild(el);
      toastEl = el;
      toastTimer = setTimeout(function () {
        if (toastEl === el) { el.remove(); toastEl = null; }
      }, sticky ? 14000 : 4500);
    } catch (_) { /* notifikasi hanya tambahan; jangan sampai mengganggu */ }
  }

  // Kirim semua entri yang siap. options.quiet = true -> jangan tampilkan
  // notifikasi sukses (dipakai halaman Input yang sudah punya toast sendiri).
  async function flush(options) {
    options = options || {};
    if (flushing || typeof submitEvent !== "function") return;
    flushing = true;
    var sentEdits = 0, sentCreates = 0, failed = 0, rejectedMsg = null;
    try {
      var now = Date.now();
      var due = read().filter(function (e) { return !e.sendingAt || now - e.sendingAt > LOCK_MS; });
      for (var i = 0; i < due.length; i++) {
        var entry = due[i];
        patch(entry.id, function (x) { x.sendingAt = Date.now(); });
        try {
          await submitEvent(entry.report);
          remove(entry.id);
          if (entry.report && entry.report.isEdit) sentEdits++; else sentCreates++;
        } catch (err) {
          console.error("[outbox] gagal kirim:", err);
          if (isNetworkOrServerError(err)) {
            patch(entry.id, function (x) { x.sendingAt = 0; });
            failed++;
          } else {
            // Ditolak server karena isi data (bukan masalah koneksi): mengulang tidak akan membantu.
            remove(entry.id);
            rejectedMsg = (err && err.message) || "Server menolak data.";
          }
        }
      }
    } finally {
      flushing = false;
    }

    if (rejectedMsg) {
      notify("Data ditolak server: " + rejectedMsg + " Buka kembali form dan coba lagi.", "error", true);
    } else if (failed) {
      notify("Belum terkirim (koneksi atau server bermasalah). Data aman di perangkat ini dan akan dicoba lagi otomatis.", "error", true);
      scheduleRetry();
    } else if ((sentEdits || sentCreates) && !options.quiet) {
      notify(
        sentEdits && !sentCreates
          ? "Perubahan event tersimpan. Daftar akan diperbarui sebentar lagi."
          : "Laporan terkirim. Daftar akan diperbarui sebentar lagi."
      );
    }
    if (!failed) retryCount = 0;
  }

  function scheduleRetry() {
    if (retryCount >= MAX_AUTO_RETRY) return;
    retryCount += 1;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(function () { flush({ quiet: true }); }, 20000 * retryCount);
  }

  window.MaximumOutbox = { enqueue: enqueue, flush: flush, pending: pending };

  // Kirim sisa antrean (mis. dari kunjungan sebelumnya) begitu halaman siap.
  function autoFlush() { setTimeout(function () { flush(); }, 400); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoFlush);
  else autoFlush();
  window.addEventListener("online", function () { flush(); });
})();
