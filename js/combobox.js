/* =========================================================================
   combobox.js — a small, dependency-free searchable dropdown ("combobox").

   Turns a plain <input type="text"> into:
   - a dropdown you can click to browse the full option list, and
   - a search box that filters the list as you type.

   It does NOT force the user to pick from the list — whatever text is in
   the input when the form is submitted is still what gets saved. Picking
   an option just fills the input (and lets you react via onSelect, e.g. to
   auto-fill other fields).

   Usage:
     initCombobox(inputEl, {
       getOptions: (query) => [...],       // return matching options for the current query
       renderLabel: (option) => "string",  // text shown in the dropdown row
       getValue: (option) => "string",     // text written into the input on pick
       onSelect: (option, inputEl) => {},  // optional side-effect, e.g. autofill
     });
   ========================================================================= */

function initCombobox(inputEl, { getOptions, renderLabel, getValue, onSelect }) {
  const wrapper = document.createElement("div");
  wrapper.className = "combo-wrapper";
  inputEl.parentNode.insertBefore(wrapper, inputEl);
  wrapper.appendChild(inputEl);

  inputEl.classList.add("combo-input");
  inputEl.setAttribute("autocomplete", "off");
  inputEl.setAttribute("role", "combobox");
  inputEl.setAttribute("aria-expanded", "false");
  inputEl.setAttribute("aria-autocomplete", "list");

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "combo-toggle";
  toggleBtn.setAttribute("aria-label", "Tampilkan daftar");
  toggleBtn.tabIndex = -1;
  wrapper.appendChild(toggleBtn);

  const list = document.createElement("ul");
  list.className = "combo-list";
  list.hidden = true;
  wrapper.appendChild(list);

  let options = [];
  let activeIndex = -1;

  function open(showAll) {
    options = getOptions(showAll ? "" : inputEl.value);
    activeIndex = -1;
    renderList();
    list.hidden = options.length === 0;
    inputEl.setAttribute("aria-expanded", String(!list.hidden));
  }

  function close() {
    list.hidden = true;
    inputEl.setAttribute("aria-expanded", "false");
    activeIndex = -1;
  }

  function renderList() {
    list.innerHTML = "";
    if (options.length === 0) {
      const li = document.createElement("li");
      li.className = "combo-option combo-empty";
      li.textContent = "Tidak ditemukan — data akan disimpan sebagai teks bebas.";
      list.appendChild(li);
      return;
    }
    options.forEach((opt, i) => {
      const li = document.createElement("li");
      li.className = "combo-option" + (i === activeIndex ? " active" : "");
      li.textContent = renderLabel(opt);
      li.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep focus on input, avoid blur-before-click
        pick(opt);
      });
      list.appendChild(li);
    });
  }

  function pick(opt) {
    inputEl.value = getValue(opt);
    if (typeof onSelect === "function") onSelect(opt, inputEl);
    close();
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
  }

  inputEl.addEventListener("input", () => open(false));
  inputEl.addEventListener("focus", () => open(inputEl.value === ""));
  inputEl.addEventListener("blur", () => setTimeout(close, 120));
  toggleBtn.addEventListener("click", () => {
    if (list.hidden) {
      inputEl.focus();
      open(true);
    } else {
      close();
    }
  });

  inputEl.addEventListener("keydown", (e) => {
    if (list.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      open(true);
      return;
    }
    if (list.hidden || options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, options.length - 1);
      renderList();
      scrollActiveIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderList();
      scrollActiveIntoView();
    } else if (e.key === "Enter") {
      if (activeIndex >= 0) {
        e.preventDefault();
        pick(options[activeIndex]);
      }
    } else if (e.key === "Escape") {
      close();
    }
  });

  function scrollActiveIntoView() {
    const el = list.querySelector(".combo-option.active");
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  return {
    refresh: () => open(inputEl.value === ""),
    destroy: () => wrapper.replaceWith(inputEl),
  };
}
