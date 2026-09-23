/* =========================================================================
   input.js — dynamic rental-item blocks, validation, and submission for
   the report form.
   ========================================================================= */

(function () {
  const form = document.getElementById("report-form");
  const itemsContainer = document.getElementById("items-container");
  const itemTemplate = document.getElementById("item-block-template");
  const addItemBtn = document.getElementById("add-item");
  const itemsCountEl = document.getElementById("items-count");
  const noItemsMsg = document.getElementById("no-items-msg");
  const submitBtn = document.getElementById("submit-report");
  const formLevelError = document.getElementById("form-level-error");
  const toast = document.getElementById("success-toast");

  // ---- Mode Edit (?edit=<eventId>) ----------------------------------------
  // Dipakai saat pengguna klik "Edit" di events.html: form ini dimuat ulang
  // dengan data event yang sudah ada, lalu submit akan MENGUPDATE event itu
  // (bukan membuat baris baru) lewat report.isEdit = true di submitEvent().
  const urlParams = new URLSearchParams(window.location.search);
  const editEventId = urlParams.get("edit");
  let editOriginalEvent = null;

  const pageEyebrow = document.getElementById("page-eyebrow");
  const pageTitle = document.getElementById("page-title");
  const pageDesc = document.getElementById("page-desc");
  const backToList = document.getElementById("back-to-list");
  const editModeNote = document.getElementById("edit-mode-note");

  if (editEventId) {
    pageEyebrow.textContent = "EDIT LAPORAN EVENT";
    pageTitle.textContent = "Edit detail event";
    pageDesc.textContent = "Perbaiki data yang salah, atau ubah status pembayaran (mis. DP → Lunas), lalu simpan perubahan.";
    backToList.hidden = false;
    editModeNote.hidden = false;
    submitBtn.textContent = "Update Report";
  }

  let itemSeq = 0;

  /* ---------------------------------------------------------------------
     Item & vendor dictionaries — power the Item ID / Vendor dropdown-search
     fields. Loaded once on page load; every item block wires its own
     combobox against these same arrays (see attachItemDictionaryCombo /
     attachVendorCombo below). When editing, the existing event's data is
     loaded in parallel and the form is prefilled once both are ready.
     --------------------------------------------------------------------- */
  let itemDictionary = [];
  let vendorDictionary = [];

  MaximumLoader.show(editEventId ? "Memuat Data Event" : "Memuat Data Master");
  Promise.all([
    loadDictionaries(),
    editEventId ? loadEventById(editEventId, (attempt, attempts) => {
      MaximumLoader.setLabel(`Masih memuat data event, mencoba lagi… (${attempt}/${attempts})`);
    }) : Promise.resolve(null),
  ]).then(([dicts, ev]) => {
    itemDictionary = dicts.items;
    vendorDictionary = dicts.vendors;

    if (editEventId) {
      if (!ev) throw new Error("Event tidak ditemukan.");
      editOriginalEvent = ev;
      populateFormForEdit(ev);
    } else {
      addItemBlock();
    }
  }).catch((err) => {
    console.error("Failed to load data master / event to edit", err);
    if (editEventId) {
      formLevelError.textContent = (err && err.message) || "Gagal memuat data event untuk diedit.";
      submitBtn.disabled = true;
    }
  }).finally(() => {
    MaximumLoader.hide();
  });

  function filterByQuery(list, query, ...fields) {
    const q = query.trim().toLowerCase();
    if (!q) return list.slice(0, 50); // cap the "browse all" list so it stays snappy
    return list.filter((entry) => fields.some((f) => String(entry[f] || "").toLowerCase().includes(q))).slice(0, 50);
  }

  // Daftar Kategori unik dari itemDictionary (yang sendiri berasal dari
  // sheet ITEM_DICTIONARY lewat loadDictionaries() — lihat js/data.js).
  // Diurutkan alfabetis (locale id) supaya dropdown rapi walau urutan baris
  // di sheet berantakan.
  function categoryList() {
    const seen = new Set();
    const list = [];
    itemDictionary.forEach((opt) => {
      const kategori = String(opt.kategori || "").trim();
      if (kategori && !seen.has(kategori)) {
        seen.add(kategori);
        list.push(kategori);
      }
    });
    return list.sort((a, b) => a.localeCompare(b, "id"));
  }

  // Mengisi ulang <option> pada select Kategori dari categoryList(),
  // mempertahankan pilihan sekarang kalau masih valid. Dipanggil saat blok
  // barang dibuat (dictionary sudah dimuat lebih dulu, lihat Promise.all
  // di atas) supaya Kategori selalu mengikuti sheet ITEM_DICTIONARY tanpa
  // perlu mengubah kode.
  function populateCategorySelect(select) {
    const current = select.value;
    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Pilih kategori";
    select.appendChild(placeholder);
    categoryList().forEach((kategori) => {
      const opt = document.createElement("option");
      opt.value = kategori;
      opt.textContent = kategori;
      select.appendChild(opt);
    });
    if ([...select.options].some((o) => o.value === current)) select.value = current;
  }

  function applyItemSelection(opt, block) {
    const codeInput = block.querySelector('[data-name="itemCode"]');
    const nameInput = block.querySelector('[data-name="itemName"]');
    const categorySelect = block.querySelector('[data-name="category"]');
    codeInput.value = opt.itemId;
    nameInput.value = opt.namaItemStandar;
    if ([...categorySelect.options].some((o) => o.value === opt.kategori)) categorySelect.value = opt.kategori;
    setError(codeInput.closest(".field"), "");
    setError(nameInput.closest(".field"), "");
    setError(categorySelect.closest(".field"), "");
  }

  function attachItemDictionaryCombo(block) {
    const codeInput = block.querySelector('[data-name="itemCode"]');
    const nameInput = block.querySelector('[data-name="itemName"]');
    const categorySelect = block.querySelector('[data-name="category"]');
    populateCategorySelect(categorySelect);
    const optionsFor = (query) => filterByQuery(itemDictionary, query, "itemId", "namaItemStandar", "kategori");

    initCombobox(codeInput, {
      getOptions: optionsFor,
      renderLabel: (opt) => `${opt.itemId} — ${opt.namaItemStandar} (${opt.kategori})`,
      getValue: (opt) => opt.itemId,
      onSelect: (opt) => applyItemSelection(opt, block),
    });

    initCombobox(nameInput, {
      getOptions: optionsFor,
      renderLabel: (opt) => `${opt.namaItemStandar} — ${opt.itemId} (${opt.kategori})`,
      getValue: (opt) => opt.namaItemStandar,
      onSelect: (opt) => applyItemSelection(opt, block),
    });

    // Keep the two search fields synchronized when the user types an exact Item ID.
    nameInput.addEventListener("blur", () => {
      const q = nameInput.value.trim().toLowerCase();
      const exact = itemDictionary.find((opt) => String(opt.itemId).toLowerCase() === q);
      if (exact) applyItemSelection(exact, block);
    });
  }

  function attachVendorCombo(block) {
    const vendorInput = block.querySelector('[data-name="vendor"]');
    initCombobox(vendorInput, {
      getOptions: (query) => filterByQuery(vendorDictionary, query, "namaVendor", "vendorId"),
      renderLabel: (opt) => opt.namaVendor,
      getValue: (opt) => opt.namaVendor,
      onSelect: () => setError(vendorInput.closest(".field"), ""),
    });
  }

  /* ---------------------------------------------------------------------
     Rupiah-formatted number inputs: store the raw digits, display with
     thousands separators as the user types.
     --------------------------------------------------------------------- */
  function attachRupiahFormatting(input) {
    input.addEventListener("input", () => {
      const digits = input.value.replace(/\D/g, "");
      input.value = digits ? Number(digits).toLocaleString("id-ID") : "";
    });
  }
  function rupiahValue(input) {
    const digits = input.value.replace(/\D/g, "");
    return digits ? Number(digits) : NaN;
  }

  /* ---------------------------------------------------------------------
     Payment status ↔ Nominal DP: only "DP" leaves nominalDP editable.
     "Lunas" derives it automatically (mirrors the normalizePayment_ logic
     in Code.gs, so the preview matches what the backend will actually
     store).
     --------------------------------------------------------------------- */
  function attachPaymentFields(block, priceInput) {
    const statusSelect = block.querySelector('[data-name="paymentStatus"]');
    const dpInput = block.querySelector('[data-name="nominalDP"]');
    const sisaDisplay = block.querySelector('[data-sisa-dp-display]');
    attachRupiahFormatting(dpInput);

    function syncDP() {
      const total = rupiahValue(priceInput) || 0;
      if (statusSelect.value === "Lunas") {
        dpInput.value = total.toLocaleString("id-ID");
        dpInput.disabled = true;
      } else if (statusSelect.value === "DP") {
        dpInput.disabled = false;
      } else {
        dpInput.value = "";
        dpInput.disabled = true;
      }
      const dp = rupiahValue(dpInput) || 0;
      const sisa = Math.max(0, total - dp);
      sisaDisplay.textContent = statusSelect.value
        ? `Sisa DP: Rp ${sisa.toLocaleString("id-ID")}`
        : "";
    }

    statusSelect.addEventListener("change", syncDP);
    dpInput.addEventListener("input", syncDP);
    priceInput.addEventListener("input", syncDP);
    syncDP();
  }

  /* ---------------------------------------------------------------------
     Dynamic item blocks
     --------------------------------------------------------------------- */
  function renumberItems() {
    const blocks = itemsContainer.querySelectorAll("[data-item-block]");
    blocks.forEach((block, i) => {
      block.querySelector("[data-item-number]").textContent = i + 1;
    });
    itemsCountEl.textContent = blocks.length;
    noItemsMsg.hidden = blocks.length > 0;
  }

  function addItemBlock(prefill) {
    itemSeq += 1;
    const node = itemTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.seq = itemSeq;

    node.querySelector("[data-remove-item]").addEventListener("click", () => {
      node.remove();
      renumberItems();
    });

    const priceInput = node.querySelector('[data-name="totalPrice"]');
    attachRupiahFormatting(priceInput);

    attachPaymentFields(node, priceInput);
    attachItemDictionaryCombo(node);
    attachVendorCombo(node);

    itemsContainer.appendChild(node);
    if (prefill) fillItemBlock(node, prefill);
    renumberItems();
    return node;
  }

  // Mengisi satu blok barang dengan data yang sudah ada (mode edit), lalu
  // memicu event input/change yang relevan supaya formatting Rupiah,
  // status pembayaran, dan tampilan "Sisa DP" ikut ter-sinkron seolah-olah
  // pengguna sendiri yang mengetiknya.
  function fillItemBlock(node, item) {
    node.querySelector('[data-name="itemCode"]').value = item.itemCode || "";
    node.querySelector('[data-name="itemName"]').value = item.itemName || "";

    const categorySelect = node.querySelector('[data-name="category"]');
    if ([...categorySelect.options].some((o) => o.value === item.category)) {
      categorySelect.value = item.category;
    }

    node.querySelector('[data-name="vendor"]').value = item.vendor || "";
    node.querySelector('[data-name="description"]').value = item.description || "";

    const priceInput = node.querySelector('[data-name="totalPrice"]');
    priceInput.value = item.totalPrice ? Number(item.totalPrice).toLocaleString("id-ID") : "";

    const statusSelect = node.querySelector('[data-name="paymentStatus"]');
    // Data lama (sebelum revisi ini) mungkin belum punya paymentStatus sama
    // sekali — dibiarkan kosong ("Pilih status") supaya pengguna mengisinya
    // secara sadar, bukan ditebak.
    if (item.paymentStatus === "Lunas" || item.paymentStatus === "DP") {
      statusSelect.value = item.paymentStatus;
    }
    statusSelect.dispatchEvent(new Event("change"));

    if (item.paymentStatus === "DP") {
      const dpInput = node.querySelector('[data-name="nominalDP"]');
      dpInput.value = Number(item.nominalDP || 0).toLocaleString("id-ID");
      dpInput.dispatchEvent(new Event("input"));
    }
  }

  // Mengisi seluruh form (bagian atas + semua blok barang) dari satu event
  // yang sudah ada, dipanggil sekali saat halaman dibuka dengan ?edit=...
  function populateFormForEdit(ev) {
    form.user.value = ev.user || "";
    form.event.value = ev.event || "";
    form.client.value = ev.client || "";
    form.city.value = ev.city || "";
    form.country.value = ev.country || "Indonesia";
    grInputEl.value = Number.isFinite(ev.gr) ? ev.gr : 0;

    dateStartInput.value = ev.eventDate || "";
    if (ev.eventDateEnd) {
      dateEndInput.value = ev.eventDateEnd;
    } else if (ev.eventDate && ev.eventDays) {
      // Sheet EVENTS hanya menyimpan tanggal mulai + jumlah hari, bukan
      // tanggal selesai — turunkan kembali dengan rumus yang sama seperti
      // saat pertama kali dihitung (lihat computedEventDays()).
      const end = new Date(ev.eventDate + "T00:00:00");
      end.setDate(end.getDate() + (Number(ev.eventDays) - 1));
      dateEndInput.value = end.toISOString().slice(0, 10);
    }
    recomputeEventDays();

    itemsContainer.innerHTML = "";
    (ev.items || []).forEach((item) => addItemBlock(item));
    if ((ev.items || []).length === 0) addItemBlock();
  }

  addItemBtn.addEventListener("click", () => addItemBlock());

  /* ---------------------------------------------------------------------
     Event duration: derived from start/end date (GR is counted separately
     via its own field) instead of a manual "jumlah day" or "durasi jam"
     input. Recomputes whenever either date, or the GR count, changes.
     --------------------------------------------------------------------- */
  const dateStartInput = document.getElementById("f-date-start");
  const dateEndInput = document.getElementById("f-date-end");
  const daysDisplay = document.getElementById("f-days");
  const grInputEl = document.getElementById("f-gr");
  const totalDaysHint = document.getElementById("total-days-hint");

  function computedEventDays() {
    if (!dateStartInput.value || !dateEndInput.value) return null;
    const start = new Date(dateStartInput.value);
    const end = new Date(dateEndInput.value);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const diffDays = Math.round((end - start) / 86400000) + 1; // inclusive of both ends
    return diffDays >= 1 ? diffDays : null;
  }

  function recomputeEventDays() {
    const days = computedEventDays();
    daysDisplay.value = days === null ? "—" : `${days} hari`;

    const gr = Number(grInputEl.value);
    if (days !== null && grInputEl.value !== "" && Number.isInteger(gr) && gr >= 0) {
      totalDaysHint.textContent = `Total termasuk GR: ${days + gr} hari (${days} event + ${gr} GR).`;
    } else {
      totalDaysHint.textContent = "";
    }
  }

  dateStartInput.addEventListener("change", recomputeEventDays);
  dateEndInput.addEventListener("change", recomputeEventDays);
  grInputEl.addEventListener("input", recomputeEventDays);

  // Total harga event is no longer a separate editable field — it's always
  // the sum of each item's own "Harga total", computed once at submit time
  // (see form submit handler below).
  function computeTotalEventPrice() {
    return [...itemsContainer.querySelectorAll('[data-name="totalPrice"]')]
      .reduce((sum, el) => sum + (rupiahValue(el) || 0), 0);
  }

  /* ---------------------------------------------------------------------
     Validation
     --------------------------------------------------------------------- */
  function setError(fieldEl, message) {
    fieldEl.classList.toggle("has-error", !!message);
    const msgEl = fieldEl.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = message || "";
  }

  function validateTopLevel() {
    let ok = true;
    const requiredText = ["user", "event", "client", "city", "country"];
    for (const name of requiredText) {
      const input = form.querySelector(`[name="${name}"]`);
      const fieldEl = input.closest(".field");
      if (!input.value.trim()) { setError(fieldEl, "Wajib diisi."); ok = false; }
      else setError(fieldEl, "");
    }

    const dateStartFieldEl = dateStartInput.closest(".field");
    const dateEndFieldEl = dateEndInput.closest(".field");
    const startValid = dateStartInput.value && !isNaN(new Date(dateStartInput.value).getTime());
    const endValid = dateEndInput.value && !isNaN(new Date(dateEndInput.value).getTime());

    if (!startValid) { setError(dateStartFieldEl, "Tanggal mulai tidak valid."); ok = false; }
    else setError(dateStartFieldEl, "");

    if (!endValid) { setError(dateEndFieldEl, "Tanggal selesai tidak valid."); ok = false; }
    else if (startValid && new Date(dateEndInput.value) < new Date(dateStartInput.value)) {
      setError(dateEndFieldEl, "Tanggal selesai tidak boleh sebelum tanggal mulai.");
      ok = false;
    } else setError(dateEndFieldEl, "");

    const grFieldEl = grInputEl.closest(".field");
    const gr = Number(grInputEl.value);
    if (grInputEl.value === "" || !Number.isInteger(gr) || gr < 0) { setError(grFieldEl, "GR tidak boleh negatif."); ok = false; }
    else setError(grFieldEl, "");

    recomputeEventDays();

    return ok;
  }

  function validateItems() {
    const blocks = [...itemsContainer.querySelectorAll("[data-item-block]")];
    if (blocks.length === 0) {
      formLevelError.textContent = "Tambahkan minimal satu barang, atau lanjutkan tanpa barang jika event ini memang tidak menyewa apa pun.";
      return true; // spec allows "event tanpa item" as a data-quality case to handle, not a hard block
    }
    let ok = true;
    for (const block of blocks) {
      const codeEl = block.querySelector('[data-name="itemCode"]').closest(".field");
      const nameEl = block.querySelector('[data-name="itemName"]').closest(".field");
      const catEl = block.querySelector('[data-name="category"]').closest(".field");
      const vendorEl = block.querySelector('[data-name="vendor"]').closest(".field");
      const descInput = block.querySelector('[data-name="description"]');
      const priceInput = block.querySelector('[data-name="totalPrice"]');
      const priceEl = priceInput.closest(".field");
      const statusSelect = block.querySelector('[data-name="paymentStatus"]');
      const statusEl = statusSelect.closest(".field");
      const dpInput = block.querySelector('[data-name="nominalDP"]');
      const dpEl = dpInput.closest(".field");

      setError(codeEl, codeEl.querySelector("input").value.trim() ? "" : "Wajib diisi.");
      setError(nameEl, nameEl.querySelector("input").value.trim() ? "" : "Wajib diisi.");
      setError(catEl, catEl.querySelector("select").value ? "" : "Pilih kategori.");
      setError(vendorEl, vendorEl.querySelector("input").value.trim() ? "" : "Wajib diisi.");

      const price = rupiahValue(priceInput);
      setError(priceEl, (Number.isFinite(price) && price >= 0) ? "" : "Harga harus berupa angka.");

      setError(statusEl, statusSelect.value ? "" : "Pilih status pembayaran.");

      const dp = rupiahValue(dpInput);
      const dpOk = statusSelect.value !== "DP" || (Number.isFinite(dp) && dp >= 0 && dp <= (Number.isFinite(price) ? price : Infinity));
      setError(dpEl, dpOk ? "" : "Nominal DP harus antara 0 dan harga total.");

      if (![codeEl, nameEl, catEl, vendorEl, priceEl, statusEl, dpEl].every((el) => !el.classList.contains("has-error"))) {
        ok = false;
      }
    }
    return ok;
  }

  /* ---------------------------------------------------------------------
     Submission
     --------------------------------------------------------------------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formLevelError.textContent = "";

    const topOk = validateTopLevel();
    const itemsOk = validateItems();
    if (!topOk || !itemsOk) {
      formLevelError.textContent = "Periksa kembali field yang ditandai merah.";
      form.querySelector(".has-error")?.querySelector("input,select")?.focus();
      return;
    }

    const items = [...itemsContainer.querySelectorAll("[data-item-block]")].map((block) => ({
      itemCode: block.querySelector('[data-name="itemCode"]').value.trim(),
      itemName: block.querySelector('[data-name="itemName"]').value.trim(),
      category: block.querySelector('[data-name="category"]').value,
      description: block.querySelector('[data-name="description"]').value.trim(),
      vendor: block.querySelector('[data-name="vendor"]').value.trim(),
      totalPrice: rupiahValue(block.querySelector('[data-name="totalPrice"]')),
      paymentStatus: block.querySelector('[data-name="paymentStatus"]').value,
      nominalDP: rupiahValue(block.querySelector('[data-name="nominalDP"]')) || 0,
      // REVISI: form ini tidak punya field kuantitas per barang (satu blok
      // = satu baris item dengan harga totalnya sendiri), tapi backend
      // (Code.gs validateReport_) mewajibkan quantity berupa angka > 0 —
      // tanpa ini SETIAP submit selalu ditolak. Default 1 per baris.
      quantity: 1,
    }));

    const report = {
      // Mode edit: pakai eventId yang sudah ada supaya backend meng-update
      // baris yang sama, bukan membuat event baru. Mode create: dibuat
      // otomatis oleh backend dengan format bulan-ke-event-ke-tahun.
      eventId: editEventId || "",
      isEdit: !!editEventId,
      user: form.user.value.trim(),
      event: form.event.value.trim(),
      client: form.client.value.trim(),
      eventPrice: computeTotalEventPrice(),
      eventDate: dateStartInput.value,
      eventDateEnd: dateEndInput.value,
      eventDays: computedEventDays(),
      gr: Number(grInputEl.value),
      city: form.city.value.trim(),
      country: form.country.value.trim(),
      items,
      submittedAt: new Date().toISOString(),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = editEventId ? "Menyimpan Perubahan…" : "Menyimpan…";
    MaximumLoader.show("Menyimpan Laporan");
    try {
      await submitEvent(report);
      if (editEventId) {
        MaximumLoader.setLabel("Tersimpan — Kembali ke Daftar Event");
        setTimeout(() => { window.location.href = "events.html"; }, 700);
        return; // biarkan loader tampil sampai redirect
      }
      showSuccess();
      resetForm();
    } catch (err) {
      console.error(err);
      formLevelError.textContent = editEventId
        ? "Gagal menyimpan perubahan. Silakan coba lagi."
        : "Gagal menyimpan laporan. Silakan coba lagi.";
    } finally {
      if (!editEventId) {
        MaximumLoader.hide();
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Report";
      }
    }
  });

  function showSuccess() {
    toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), 4200);
  }

  function resetForm() {
    form.reset();
    document.getElementById("f-country").value = "Indonesia";
    itemsContainer.innerHTML = "";
    renumberItems();
    recomputeEventDays();
    form.querySelectorAll(".field").forEach((f) => setError(f, ""));
  }

  // Blok barang kosong pertama ditambahkan lewat Promise.all(...) di atas
  // (baik untuk mode create maupun setelah data event mode edit termuat) —
  // jangan tambahkan lagi di sini, supaya tidak dobel / muncul sebelum
  // data edit selesai dimuat.
})();