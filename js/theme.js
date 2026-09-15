/* Shared light/dark theme + MAXIMUM THE ULTIMATE branding. */
(function () {
  const KEY = "maximum-theme";
  const root = document.documentElement;
  function apply(theme) {
    const t = theme === "dark" ? "dark" : "light";
    root.dataset.theme = t;
    try { localStorage.setItem(KEY, t); } catch (_) {}
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.textContent = t === "dark" ? "☀️ Terang" : "🌙 Gelap";
      btn.setAttribute("aria-label", t === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap");
      btn.setAttribute("title", t === "dark" ? "Mode terang" : "Mode gelap");
    });
  }
  let saved = "light";
  try { saved = localStorage.getItem(KEY) || "light"; } catch (_) {}
  apply(saved);
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme-toggle]");
    if (!btn) return;
    apply(root.dataset.theme === "dark" ? "light" : "dark");
  });
  window.MaximumTheme = { apply };
})();
