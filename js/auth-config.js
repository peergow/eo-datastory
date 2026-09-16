/* =========================================================================
   auth-config.js — konfigurasi khusus fitur Login.
   Dipisah dari CONFIG di js/data.js supaya CONFIG.API_URL (backend
   EVENTS/ITEMS yang sudah dipakai) tidak pernah diubah/disentuh.
   ========================================================================= */

const AUTH_CONFIG = {
  // Tempel URL /exec dari deployment Login.gs (Web App terpisah) di sini,
  // contoh: "https://script.google.com/macros/s/AKfycb.../exec".
  // Kosongkan untuk mode demo lokal (lihat catatan di login.js).
  LOGIN_API_URL: "https://script.google.com/macros/s/AKfycbyU5voosoxMXGvUoQ7SZbeJII-ITjHGNu5uhU88SIAJmoDjQ_XGzDEqmyvTr4TSwd8f/exec",

  // Key sessionStorage yang menandai user sudah login di tab browser ini.
  SESSION_KEY: "maximum_auth_session",
};
