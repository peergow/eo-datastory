/* =========================================================================
   auth-config.js — konfigurasi khusus fitur Login.
   Dipisah dari CONFIG di js/data.js supaya CONFIG.API_URL (backend
   EVENTS/ITEMS yang sudah dipakai) tidak pernah diubah/disentuh.
   ========================================================================= */

const AUTH_CONFIG = {
  // Tempel URL /exec dari deployment Login.gs (Web App terpisah) di sini,
  // contoh: "https://script.google.com/macros/s/AKfycb.../exec".
  // Kosongkan untuk mode demo lokal (lihat catatan di login.js).
  LOGIN_API_URL: "https://script.google.com/macros/s/AKfycbxlw03mNPyig1zInCP2i3suEAqO3BXBZhLiffS-OXgCe6Bj_Hvp3kFWlpTwbVTSw4wH/exec",

  // Key sessionStorage yang menandai user sudah login di tab browser ini.
  SESSION_KEY: "maximum_auth_session",
};
