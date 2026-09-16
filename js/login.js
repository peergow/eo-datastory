/* =========================================================================
   login.js — logika halaman login.html untuk MAXIMUM THE ULTIMATE.
   Memanggil AUTH_CONFIG.LOGIN_API_URL (Login.gs, backend terpisah dari
   Code.gs/CONFIG.API_URL) untuk memverifikasi username & password terhadap
   spreadsheet baru (sheet USERS: kolom username, password).
   ========================================================================= */

(function () {
  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");
  const submitBtn = document.getElementById("login-submit");
  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");

  // Sudah login sebelumnya di tab ini? Langsung lempar ke halaman utama.
  try {
    if (sessionStorage.getItem(AUTH_CONFIG.SESSION_KEY)) {
      window.location.replace("index.html");
      return;
    }
  } catch (_) {}

  function setError(msg) {
    errorEl.textContent = msg || "";
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? "Memeriksa…" : "Masuk";
  }

  form.addEventListener("submit", async function (evt) {
    evt.preventDefault();
    setError("");

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      setError("Username dan password wajib diisi.");
      return;
    }

    if (!AUTH_CONFIG.LOGIN_API_URL) {
      setError("Backend login belum dikonfigurasi (isi AUTH_CONFIG.LOGIN_API_URL di js/auth-config.js).");
      return;
    }

    setLoading(true);

    try {
      // GET dengan query string dipakai (bukan POST body) karena Apps Script
      // Web App sering me-redirect (302) request POST, dan pada redirect itu
      // body-nya dibuang oleh browser — query string tetap utuh.
      const url = AUTH_CONFIG.LOGIN_API_URL
        + "?action=login"
        + "&username=" + encodeURIComponent(username)
        + "&password=" + encodeURIComponent(password);
      const res = await fetch(url);

      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();

      if (data && data.ok) {
        try {
          sessionStorage.setItem(AUTH_CONFIG.SESSION_KEY, data.username || username);
        } catch (_) {}
        window.location.href = "index.html";
      } else {
        setError((data && data.error) || "Username atau password salah.");
      }
    } catch (err) {
      console.error(err);
      setError("Tidak bisa terhubung ke server login. Coba lagi.");
    } finally {
      setLoading(false);
    }
  });
})();
