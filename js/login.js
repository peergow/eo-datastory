/* =========================================================================
   login.js — logika halaman login.html untuk MAXIMUM THE ULTIMATE.
   Memanggil AUTH_CONFIG.LOGIN_API_URL (Login.gs, backend terpisah dari
   Code.gs/CONFIG.API_URL) untuk memverifikasi username & password terhadap
   spreadsheet baru (sheet USERS: kolom username, password).
   ========================================================================= */

(function () {
  /* ---------------------------------------------------------------------
     AKUN LOKAL (login instan, tanpa menunggu server Apps Script).
     Tambahkan akun di daftar LOCAL_USERS di bawah, satu baris per akun:
       { username: "nama", password: "katasandi" },
     Kalau username & password cocok dengan salah satu baris, login langsung
     berhasil saat itu juga. Kalau tidak cocok dan FALLBACK_TO_SERVER = true,
     login tetap dicek ke server seperti sebelumnya (akun di sheet USERS
     tetap berfungsi). Set FALLBACK_TO_SERVER = false kalau hanya ingin
     akun di daftar ini yang boleh masuk.
     CATATAN: isi file ini bisa dibaca siapa pun yang membuka situs
     (View Source). Pakai password khusus untuk situs ini saja.
     --------------------------------------------------------------------- */
  const LOCAL_USERS = [
    // { username: "maximum", password: "jayajayajaya" },
  ];
  const FALLBACK_TO_SERVER = true;

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

    // Cek akun lokal dulu: instan, tanpa request jaringan.
    const localUser = LOCAL_USERS.find(function (u) {
      return String(u.username || "").trim() === username && String(u.password || "") === password;
    });
    if (localUser) {
      try {
        sessionStorage.setItem(AUTH_CONFIG.SESSION_KEY, String(localUser.username).trim());
      } catch (_) {}
      window.location.href = "index.html";
      return;
    }
    if (!FALLBACK_TO_SERVER) {
      setError("Username atau password salah.");
      return;
    }

    if (!AUTH_CONFIG.LOGIN_API_URL) {
      setError("Backend login belum dikonfigurasi (isi AUTH_CONFIG.LOGIN_API_URL di js/auth-config.js).");
      return;
    }

    setLoading(true);
    MaximumLoader.show("Memeriksa Akun");

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
        // REVISI: delay splash sebelumnya 3000ms lalu 400ms (fix, tidak
        // tergantung kecepatan server) — salah satu penyebab login "terasa
        // lama" di atas waktu respons Apps Script itu sendiri. Sekarang
        // hanya menunggu 2 frame (dua requestAnimationFrame) supaya label
        // "Harap Tunggu" sempat ter-render di layar sebelum pindah halaman,
        // alih-alih menunggu angka milidetik tetap yang lebih lama dari
        // yang sebenarnya dibutuhkan browser untuk menggambar 1 frame.
        MaximumLoader.setLabel("Harap Tunggu");
        const goToIndex = function () { window.location.href = "index.html"; };
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(function () { requestAnimationFrame(goToIndex); });
        } else {
          setTimeout(goToIndex, 50);
        }
        return; // jangan matikan loader / tombol, biar transisinya mulus
      }

      MaximumLoader.hide();
      setError((data && data.error) || "Username atau password salah.");
      setLoading(false);
    } catch (err) {
      console.error(err);
      MaximumLoader.hide();
      setError("Tidak bisa terhubung ke server login. Coba lagi.");
      setLoading(false);
    }
  });
})();