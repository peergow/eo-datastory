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
  const priceField = document.getElementById("f-price");

  let itemSeq = 0;

  /* ---------------------------------------------------------------------
     Item & vendor dictionaries — power the Item ID / Vendor dropdown-search
     fields. Loaded once on page load; every item block wires its own
     combobox against these same arrays (see attachItemDictionaryCombo /
     attachVendorCombo below).
     --------------------------------------------------------------------- */
  let itemDictionary = [];
  let vendorDictionary = [];

  loadDictionaries().then((dicts) => {
    itemDictionary = dicts.items;
    vendorDictionary = dicts.vendors;
  }).catch((err) => {
    console.error("Failed to load item/vendor dictionaries", err);
  });

  function filterByQuery(list, query, ...fields) {
    const q = query.trim().toLowerCase();
    if (!q) return list.slice(0, 50); // cap the "browse all" list so it stays snappy
    return list.filter((entry) => fields.some((f) => String(entry[f] || "").toLowerCase().includes(q))).slice(0, 50);
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

  attachRupiahFormatting(priceField);

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
    recomputeSuggestedEventPrice();
  }

  function addItemBlock() {
    itemSeq += 1;
    const node = itemTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.seq = itemSeq;

    node.querySelector("[data-remove-item]").addEventListener("click", () => {
      node.remove();
      renumberItems();
    });

    const priceInput = node.querySelector('[data-name="totalPrice"]');
    attachRupiahFormatting(priceInput);
    priceInput.addEventListener("input", recomputeSuggestedEventPrice);

    attachItemDictionaryCombo(node);
    attachVendorCombo(node);

    itemsContainer.appendChild(node);
    renumberItems();
    return node;
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

  // Suggest the event's total price as the sum of item totals, but never
  // override a value the user has typed themselves once items exist.
  let userEditedPrice = false;
  priceField.addEventListener("input", () => { userEditedPrice = true; });

  function recomputeSuggestedEventPrice() {
    if (userEditedPrice) return;
    const total = [...itemsContainer.querySelectorAll('[data-name="totalPrice"]')]
      .reduce((sum, el) => sum + (rupiahValue(el) || 0), 0);
    priceField.value = total ? total.toLocaleString("id-ID") : "";
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

    const priceFieldEl = priceField.closest(".field");
    const price = rupiahValue(priceField);
    if (isNaN(price) || price <= 0) { setError(priceFieldEl, "Masukkan angka harga yang valid."); ok = false; }
    else setError(priceFieldEl, "");

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
      const qtyInput = block.querySelector('[data-name="quantity"]');
      const qtyEl = qtyInput.closest(".field");
      const descInput = block.querySelector('[data-name="description"]');
      const priceInput = block.querySelector('[data-name="totalPrice"]');
      const priceEl = priceInput.closest(".field");

      setError(codeEl, codeEl.querySelector("input").value.trim() ? "" : "Wajib diisi.");
      setError(nameEl, nameEl.querySelector("input").value.trim() ? "" : "Wajib diisi.");
      setError(catEl, catEl.querySelector("select").value ? "" : "Pilih kategori.");
      setError(vendorEl, vendorEl.querySelector("input").value.trim() ? "" : "Wajib diisi.");

      const qty = Number(qtyInput.value);
      setError(qtyEl, (Number.isFinite(qty) && qty > 0) ? "" : "Jumlah pcs harus angka positif.");

      const price = rupiahValue(priceInput);
      setError(priceEl, (Number.isFinite(price) && price >= 0) ? "" : "Harga harus berupa angka.");

      if (![codeEl, nameEl, catEl, vendorEl, qtyEl, priceEl].every((el) => !el.classList.contains("has-error"))) {
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
      quantity: Number(block.querySelector('[data-name="quantity"]').value),
      totalPrice: rupiahValue(block.querySelector('[data-name="totalPrice"]')),
    }));

    const report = {
      eventId: "", // dibuat otomatis oleh backend dengan format bulan-ke-event-ke-tahun
      user: form.user.value.trim(),
      event: form.event.value.trim(),
      client: form.client.value.trim(),
      eventPrice: rupiahValue(priceField),
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
    submitBtn.textContent = "Menyimpan…";
    try {
      await submitEvent(report);
      showSuccess();
      resetForm();
    } catch (err) {
      console.error(err);
      formLevelError.textContent = "Gagal menyimpan laporan. Silakan coba lagi.";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Report";
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
    userEditedPrice = false;
    renumberItems();
    recomputeEventDays();
    form.querySelectorAll(".field").forEach((f) => setError(f, ""));
  }

  // Start with one empty item block for convenience.
  addItemBlock();
})();
