/* =========================================================================
   analytics.js — orchestrates the "visual essay": loads data, lets the
   person filter by date range (global control at the top of the page),
   recomputes every aggregate from the filtered dataset, then lazily
   renders each section's chart as it scrolls into view (Intersection
   Observer), and drives the progress rail.

   Everything that depends on the dataset (hero numbers, every chart, the
   payment-status donut, the outstanding list, the "needs attention" list)
   is rebuilt from scratch by applyFilter() whenever the date range or the
   "compare with previous period" checkbox changes — there is exactly one
   place (computeView) that turns a list of events into every number this
   page shows, so a new filter never needs a second copy of the formulas.
   ========================================================================= */

(async function () {
  const loadingState = document.getElementById("loading-state");
  const storyContent = document.getElementById("story-content");
  const progressRail = document.getElementById("progress-rail");
  const filterBar = document.getElementById("filter-bar");

  let rawEvents;
  try {
    rawEvents = ensurePaymentFields(await loadAllEvents());
  } catch (err) {
    console.error(err);
    loadingState.innerHTML = "<p>Gagal memuat data. Periksa koneksi atau konfigurasi API_URL di js/data.js.</p>";
    return;
  }

  loadingState.hidden = true;
  storyContent.hidden = false;
  progressRail.hidden = false;
  filterBar.hidden = false;

  const lastUpdated = getLastUpdated(rawEvents);
  if (lastUpdated) {
    const { date, time } = formatDateTimeID(lastUpdated);
    document.getElementById("last-updated-value").textContent = `${date}, ${time}`;
  }

  /* -----------------------------------------------------------------------
     Filter bar — presets, custom range, and the "compare" checkbox.
     ----------------------------------------------------------------------- */
  const fromInput = document.getElementById("filter-from");
  const toInput = document.getElementById("filter-to");
  const applyBtn = document.getElementById("btn-apply-filter");
  const presetButtons = [...document.querySelectorAll("#filter-presets button")];
  const compareCheckbox = document.getElementById("filter-compare");
  const rangeLabelEl = document.getElementById("filter-range-label");

  let activeFrom = null;
  let activeTo = null;

  function setPresetActive(key) {
    presetButtons.forEach((b) => b.classList.toggle("active", b.dataset.preset === key));
  }

  presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setPresetActive(btn.dataset.preset);
      if (btn.dataset.preset === "all") {
        activeFrom = null;
        activeTo = null;
        fromInput.value = "";
        toInput.value = "";
      } else {
        const r = presetRange(btn.dataset.preset);
        activeFrom = r.from;
        activeTo = r.to;
        fromInput.value = r.from || "";
        toInput.value = r.to || "";
      }
      applyFilter();
    });
  });

  applyBtn.addEventListener("click", () => {
    setPresetActive(null);
    activeFrom = fromInput.value || null;
    activeTo = toInput.value || null;
    applyFilter();
  });

  compareCheckbox.addEventListener("change", applyFilter);

  /* -----------------------------------------------------------------------
     computeView — the single place that turns a list of events into every
     aggregate this page shows.
     ----------------------------------------------------------------------- */
  function computeView(events) {
    const priceStats = computePriceStats(events);
    const vendorAgg = aggregateVendors(events).sort((a, b) => b.eventCount - a.eventCount);
    const vendorBySpending = [...vendorAgg].sort((a, b) => b.totalSpending - a.totalSpending);
    const itemAgg = aggregateItems(events).sort((a, b) => b.occurrences - a.occurrences);
    const itemVendorPairs = aggregateItemVendor(events).sort((a, b) => b.frequency - a.frequency).slice(0, 24);
    const peakWeekData = aggregatePeakWeek(events);
    const peakMonthData = aggregatePeakMonth(events);
    const timeline = aggregateMonthlyTimeline(events);
    const paymentSummary = computePaymentSummary(events);
    const outstandingRows = aggregateOutstandingList(events, 8);
    const attention = aggregateNeedsAttention(events);
    return {
      events, priceStats, vendorAgg, vendorBySpending, itemAgg, itemVendorPairs,
      peakWeekData, peakMonthData, timeline, paymentSummary, outstandingRows, attention,
      totalSpending: paymentSummary.committed,
      vendorCount: vendorAgg.length,
    };
  }

  const compactRupiah = (v) => "Rp " + Math.round(v / 1e6).toLocaleString("id-ID") + " Jt";

  /* -----------------------------------------------------------------------
     Hero — 5 angka ringkasan + kalimat otomatis + (opsional) perbandingan
     dengan periode sebelumnya.
     ----------------------------------------------------------------------- */
  function renderHero(view, compareView) {
    countUp(document.getElementById("hero-count-events"), view.events.length);
    countUp(document.getElementById("hero-count-vendors"), view.vendorCount);
    countUp(document.getElementById("hero-count-spending"), view.totalSpending, { prefix: "Rp ", formatter: (v) => Math.round(v / 1e6).toLocaleString("id-ID"), suffix: " Jt" });
    countUp(document.getElementById("hero-count-paid"), view.paymentSummary.paid, { prefix: "Rp ", formatter: (v) => Math.round(v / 1e6).toLocaleString("id-ID"), suffix: " Jt" });
    countUp(document.getElementById("hero-count-outstanding"), view.paymentSummary.outstanding, { prefix: "Rp ", formatter: (v) => Math.round(v / 1e6).toLocaleString("id-ID"), suffix: " Jt" });

    const topVendor = view.vendorBySpending[0];
    const topItem = view.itemAgg[0];
    const sentenceEl = document.getElementById("hero-summary-sentence");
    if (view.events.length === 0) {
      sentenceEl.textContent = "Tidak ada data pada periode yang dipilih.";
    } else {
      sentenceEl.textContent =
        `Procurement mencapai ${formatRupiah(view.totalSpending)}, dengan ${formatRupiah(view.paymentSummary.paid)} sudah dibayar (Lunas/DP) dan ${formatRupiah(view.paymentSummary.outstanding)} masih outstanding.` +
        (topVendor ? ` Vendor terbesar: ${topVendor.vendor}.` : "") +
        (topItem ? ` Item terbesar: ${topItem.itemName}.` : "");
    }

    const compareBox = document.getElementById("hero-compare");
    if (compareView) {
      compareBox.hidden = false;
      compareBox.innerHTML = "";
      const rows = [
        ["Total Procurement", view.totalSpending, compareView.totalSpending],
        ["Sudah Dibayar", view.paymentSummary.paid, compareView.paymentSummary.paid],
        ["Outstanding", view.paymentSummary.outstanding, compareView.paymentSummary.outstanding],
      ];
      rows.forEach(([label, curr, prev]) => {
        const div = document.createElement("div");
        div.className = "compare-row";
        if (prev > 0) {
          const pct = ((curr - prev) / prev) * 100;
          const arrow = pct >= 0 ? "▲" : "▼";
          div.innerHTML = `<span>${label}</span><span class="${pct >= 0 ? "up" : "down"}">${arrow} ${Math.abs(pct).toFixed(1)}% vs periode sebelumnya</span>`;
        } else {
          div.innerHTML = `<span>${label}</span><span class="muted">tidak ada pembanding (periode lalu = 0)</span>`;
        }
        compareBox.appendChild(div);
      });
    } else {
      compareBox.hidden = true;
    }
  }

  /* -----------------------------------------------------------------------
     Payment legend + outstanding list + "perlu diperhatikan" — DOM lists,
     tidak lewat D3 karena bukan grafik.
     ----------------------------------------------------------------------- */
  function renderPaymentLegend(summary) {
    const box = document.getElementById("payment-legend");
    const rows = [
      ["Lunas", summary.lunasTotal, ACCENT.lunas],
      ["DP", summary.dpTotal, ACCENT.dp],
      ["Belum Bayar", summary.belumTotal, ACCENT.belum],
    ];
    box.innerHTML = rows.map(([label, val, color]) =>
      `<span class="lg-item"><span class="lg-dot" style="background:${color}"></span>${label} <span class="lg-val">${formatRupiahCompact(val)}</span></span>`
    ).join("");

    const noteEl = document.getElementById("payment-unknown-note");
    if (summary.unknownTotal > 0) {
      noteEl.hidden = false;
      noteEl.textContent = `${formatRupiahCompact(summary.unknownTotal)} dari ${summary.unknownCount} item belum mencantumkan status pembayaran (menunggu pembaruan backend ke skema sheet baru) — tidak dihitung sebagai Lunas, DP, maupun Belum Bayar di atas.`;
    } else {
      noteEl.hidden = true;
    }
  }

  function renderOutstandingList(rows) {
    const list = document.getElementById("list-outstanding");
    if (!rows.length) {
      list.innerHTML = '<li class="empty">Tidak ada outstanding pada periode ini.</li>';
      return;
    }
    list.innerHTML = rows.map((r, i) =>
      `<li><span><span class="rank">${i + 1}</span>${r.itemName} — ${r.event}<span class="meta">${r.vendor} · ${formatDateID(r.eventDate)}</span></span><span class="amount">${formatRupiah(r.outstanding)}</span></li>`
    ).join("");
  }

  function renderAttentionList(attention) {
    const list = document.getElementById("list-attention");
    if (!attention.overdue.length) {
      list.innerHTML = '<li class="empty">Tidak ada event yang perlu ditindaklanjuti. 🎉</li>';
      return;
    }
    list.innerHTML = attention.overdue.map((r) =>
      `<li><span>⚠ ${r.event}<span class="meta">Selesai ${formatDateID(r.eventDateEnd)} · ${r.daysPast} hari lalu${r.stale ? " · DP lama belum diupdate" : ""}</span></span><span class="amount">${formatRupiah(r.outstanding)}</span></li>`
    ).join("");
  }

  /* -----------------------------------------------------------------------
     Section renderers — dibangun ulang setiap applyFilter() dari `view`
     yang baru, supaya setiap chart selalu membaca data hasil filter
     terbaru.
     ----------------------------------------------------------------------- */
  function buildSectionRenderers(view) {
    return {
      "section-price": () => {
        countUp(document.querySelector("#price-headline [data-count]"), view.events.length, { duration: 1000 });
        const statBox = document.getElementById("price-stats");
        statBox.innerHTML = "";
        const rows = [
          ["Mean", view.priceStats.mean], ["Median", view.priceStats.median],
          ["Q1", view.priceStats.q1], ["Q3", view.priceStats.q3],
          ["Min", view.priceStats.min], ["Max", view.priceStats.max],
        ];
        for (const [label, val] of rows) {
          const div = document.createElement("div");
          div.className = "stat";
          div.innerHTML = `<div class="val">${formatRupiahCompact(val)}</div><div class="lbl">${label}</div>`;
          statBox.appendChild(div);
        }
        renderPriceDistribution(document.getElementById("chart-price"), view.events, view.priceStats);
      },
      "section-vendor-freq": () => {
        renderHorizontalBars(document.getElementById("chart-vendor-freq"), view.vendorAgg, {
          valueKey: "eventCount", labelKey: "vendor", color: ACCENT.vendorFreq,
          valueFormatter: (v) => `${v} event`,
          tooltipFn: (d) => `<strong>${d.vendor}</strong><br>Jumlah event: ${d.eventCount}<br>Jumlah item: ${d.itemOccurrences}<br>Total pengeluaran: ${formatRupiah(d.totalSpending)}`,
        });
      },
      "section-vendor-spend": () => {
        const spendLeaderByFreq = view.vendorAgg[0];
        const spendLeaderBySpend = view.vendorBySpending[0];
        const insightEl = document.getElementById("spend-insight");
        if (spendLeaderByFreq && spendLeaderBySpend) {
          insightEl.textContent = spendLeaderByFreq.vendor === spendLeaderBySpend.vendor
            ? `${spendLeaderBySpend.vendor} unggul baik dari sisi frekuensi maupun total pengeluaran.`
            : `${spendLeaderByFreq.vendor} paling sering dipakai, tapi ${spendLeaderBySpend.vendor} yang menyerap pengeluaran terbesar.`;
        } else {
          insightEl.textContent = "Tidak ada data pada periode ini.";
        }
        renderHorizontalBars(document.getElementById("chart-vendor-spend"), view.vendorBySpending, {
          valueKey: "totalSpending", labelKey: "vendor", color: ACCENT.vendorSpend,
          valueFormatter: (v) => formatRupiahCompact(v),
          tooltipFn: (d) => `<strong>${d.vendor}</strong><br>Total pengeluaran: ${formatRupiah(d.totalSpending)}<br>Jumlah event: ${d.eventCount}<br>Rata-rata/event: ${formatRupiah(d.avgSpendingPerEvent)}`,
        });
      },
      "section-items": () => {
        renderHorizontalBars(document.getElementById("chart-items"), view.itemAgg, {
          valueKey: "occurrences", labelKey: "itemName", color: ACCENT.item,
          valueFormatter: (v) => `${v}×`,
          tooltipFn: (d) => `<strong>${d.itemName}</strong><br>Jumlah event: ${d.eventCount}<br>Total pcs: ${d.totalQty}<br>Total pengeluaran: ${formatRupiah(d.totalSpending)}`,
        });
      },
      "section-item-vendor": () => {
        renderItemVendorBubbles(document.getElementById("chart-item-vendor"), view.itemVendorPairs);
      },
      "section-payment": () => {
        renderPaymentDonut(document.getElementById("chart-payment"), view.paymentSummary);
        renderPaymentLegend(view.paymentSummary);
        renderOutstandingList(view.outstandingRows);
      },
      "section-time": () => {
        const busiestMonth = [...view.peakMonthData].sort((a, b) => b.count - a.count)[0];
        const busiestWeek = [...view.peakWeekData].sort((a, b) => b.count - a.count)[0];
        document.getElementById("peak-insight").textContent =
          busiestMonth && busiestMonth.count > 0
            ? `${busiestMonth.label} menjadi bulan paling sibuk, dengan puncak aktivitas di minggu ke-${busiestWeek.week}.`
            : "Tidak ada data pada periode ini.";
        renderVerticalBars(document.getElementById("chart-week"), view.peakWeekData.map((d) => ({ label: "W" + d.week, count: d.count })), { labelKey: "label", valueKey: "count", color: ACCENT.vendorFreq });
        renderVerticalBars(document.getElementById("chart-month"), view.peakMonthData, { labelKey: "label", valueKey: "count", color: ACCENT.item });
      },
      "section-trend": () => {
        renderTimeline(document.getElementById("chart-timeline"), view.timeline);
      },
      "section-attention": () => {
        renderAttentionList(view.attention);
      },
    };
  }

  /* -----------------------------------------------------------------------
     applyFilter — dipanggil setiap kali preset dipilih, tombol "Terapkan"
     ditekan, atau checkbox "Bandingkan" diubah. Ini satu-satunya tempat
     yang menyaring rawEvents dan memicu render ulang semua bagian.
     ----------------------------------------------------------------------- */
  let currentRenderers = {};
  const everRendered = new Set();

  function runSectionRenderer(id) {
    if (!currentRenderers[id]) return;
    everRendered.add(id);
    currentRenderers[id]();
  }

  function applyFilter() {
    const events = filterEventsByDateRange(rawEvents, activeFrom, activeTo);
    const view = computeView(events);

    let compareView = null;
    if (compareCheckbox.checked && activeFrom && activeTo) {
      const fromD = new Date(activeFrom + "T00:00:00");
      const toD = new Date(activeTo + "T00:00:00");
      const spanDays = Math.round((toD - fromD) / 86400000) + 1;
      const prevTo = new Date(fromD); prevTo.setDate(prevTo.getDate() - 1);
      const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - spanDays + 1);
      const prevEvents = filterEventsByDateRange(rawEvents, prevFrom.toISOString().slice(0, 10), prevTo.toISOString().slice(0, 10));
      compareView = computeView(prevEvents);
    }

    renderHero(view, compareView);
    currentRenderers = buildSectionRenderers(view);
    everRendered.forEach((id) => currentRenderers[id] && currentRenderers[id]());

    rangeLabelEl.textContent = (activeFrom || activeTo)
      ? `Menampilkan ${activeFrom ? formatDateID(activeFrom) : "awal data"} – ${activeTo ? formatDateID(activeTo) : "sekarang"} (${view.events.length} event).`
      : `Menampilkan seluruh data (${view.events.length} event).`;
  }

  applyFilter(); // render awal: "Semua Data"

  /* -----------------------------------------------------------------------
     Reveal + lazy render on scroll, and progress rail sync. Re-plays the
     reveal transition and re-draws the chart every time a section enters
     the viewport — scrolling down into it or scrolling back up into it —
     rather than only the first time it is ever seen.
     ----------------------------------------------------------------------- */
  const sections = [...document.querySelectorAll(".story-section")];
  const railButtons = [...progressRail.querySelectorAll("button")];
  const prefersReducedMotionForReveal = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const REVEAL_ANIM_DELAY = prefersReducedMotionForReveal ? 0 : 150;
  let revealTimers = {};

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const id = entry.target.id;
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        clearTimeout(revealTimers[id]);
        revealTimers[id] = setTimeout(() => runSectionRenderer(id), REVEAL_ANIM_DELAY);
      } else {
        entry.target.classList.remove("revealed");
        clearTimeout(revealTimers[id]);
      }
    });
  }, { threshold: 0.15 });
  sections.forEach((s) => revealObserver.observe(s));

  const railObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        railButtons.forEach((b) => b.classList.toggle("active", b.dataset.target === entry.target.id));
      }
    });
  }, { threshold: 0.5 });
  sections.forEach((s) => railObserver.observe(s));

  railButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById(btn.dataset.target)?.scrollIntoView({ behavior: "smooth" });
    });
  });

  // Re-render visible charts on resize so they stay crisp at new widths
  // (debounced, and only for sections already rendered).
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      everRendered.forEach((id) => runSectionRenderer(id));
    }, 250);
  });

  // Charts read their text/line colors from CSS variables at draw time
  // (see themeTokens() in charts.js) so that dark mode stays legible.
  // Re-render every chart that's already been drawn as soon as the theme
  // toggle fires, instead of leaving them on the old palette until the
  // section happens to scroll back into view.
  document.addEventListener("maximum-theme-change", () => {
    everRendered.forEach((id) => runSectionRenderer(id));
  });
})();
