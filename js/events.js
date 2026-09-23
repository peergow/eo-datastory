/* =========================================================================
   events.js — "Daftar Event": memuat daftar ringkas semua event, dengan
   pencarian dan tombol Edit yang membuka input.html dalam mode edit
   (input.html?edit=<eventId>).
   ========================================================================= */

(function () {
  const loadingEl = document.getElementById("events-loading");
  const errorEl = document.getElementById("events-error");
  const emptyEl = document.getElementById("events-empty");
  const listEl = document.getElementById("events-list");
  const countEl = document.getElementById("events-count");
  const searchInput = document.getElementById("events-search");
  const rowTemplate = document.getElementById("event-row-template");

  let allEvents = [];

  function renderCount(shown, total) {
    countEl.textContent = shown === total
      ? `${total} event`
      : `${shown} dari ${total} event`;
  }

  function renderRows(events) {
    listEl.innerHTML = "";
    events
      .slice()
      .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))
      .forEach((ev) => {
        const node = rowTemplate.content.firstElementChild.cloneNode(true);
        node.querySelector("[data-event-name]").textContent = ev.event || "(Tanpa nama event)";
        node.querySelector("[data-event-client]").textContent = ev.client || "—";
        node.querySelector("[data-event-location]").textContent = [ev.city, ev.country].filter(Boolean).join(", ") || "—";
        node.querySelector("[data-event-price]").textContent = formatRupiah(ev.eventPrice || 0);
        node.querySelector("[data-event-date]").textContent = ev.eventDate ? formatDateID(ev.eventDate) : "—";
        node.querySelector("[data-event-submitted]").textContent = ev.submittedAt ? formatDateTimeID(ev.submittedAt).date : "—";
        node.querySelector("[data-event-items]").textContent = `${ev.itemCount || 0} barang`;
        node.querySelector("[data-event-edit-link]").href = "input.html?edit=" + encodeURIComponent(ev.eventId);
        listEl.appendChild(node);
      });

    listEl.hidden = events.length === 0;
    emptyEl.hidden = events.length !== 0 || allEvents.length !== 0;
  }

  function applySearch() {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = !q ? allEvents : allEvents.filter((ev) =>
      [ev.event, ev.client, ev.city, ev.country].some((f) => String(f || "").toLowerCase().includes(q))
    );
    renderCount(filtered.length, allEvents.length);
    renderRows(filtered);
  }

  searchInput.addEventListener("input", applySearch);

  (async function init() {
    try {
      allEvents = await loadEventsList((attempt, attempts) => {
        const labelEl = loadingEl.querySelector(".mx-label");
        if (labelEl) labelEl.textContent = `Masih memuat, mencoba lagi… (${attempt}/${attempts})`;
      });
      loadingEl.hidden = true;
      if (allEvents.length === 0) {
        emptyEl.hidden = false;
        countEl.textContent = "";
        return;
      }
      listEl.hidden = false;
      renderCount(allEvents.length, allEvents.length);
      renderRows(allEvents);
    } catch (err) {
      console.error(err);
      loadingEl.hidden = true;
      errorEl.hidden = false;
      errorEl.textContent = "Gagal memuat daftar event. Periksa koneksi atau konfigurasi API_URL di js/data.js.";
    }
  })();
})();
