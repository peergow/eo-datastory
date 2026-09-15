/* =========================================================================
   analytics.js — orchestrates the "visual essay": loads data, computes all
   aggregates once, then lazily renders each section's chart as it scrolls
   into view (Intersection Observer), and drives the progress rail.
   ========================================================================= */

(async function () {
  const loadingState = document.getElementById("loading-state");
  const emptyState = document.getElementById("empty-state");
  const storyContent = document.getElementById("story-content");
  const progressRail = document.getElementById("progress-rail");

  let events;
  try {
    events = await loadAllEvents();
  } catch (err) {
    console.error(err);
    loadingState.innerHTML = "<p>Gagal memuat data. Periksa koneksi atau konfigurasi API_URL di js/data.js.</p>";
    return;
  }

  loadingState.hidden = true;

  if (events.length === 0) {
    emptyState.hidden = false;
    return;
  }

  storyContent.hidden = false;
  progressRail.hidden = false;

  /* -----------------------------------------------------------------------
     Compute everything up front from the actual dataset. Nothing here is
     hard-coded — every number is derived from `events`.
     ----------------------------------------------------------------------- */
  const priceStats = computePriceStats(events);
  const vendorAgg = aggregateVendors(events).sort((a, b) => b.eventCount - a.eventCount);
  const vendorBySpending = [...vendorAgg].sort((a, b) => b.totalSpending - a.totalSpending);
  const itemAgg = aggregateItems(events).sort((a, b) => b.occurrences - a.occurrences);
  const itemVendorPairs = aggregateItemVendor(events).sort((a, b) => b.frequency - a.frequency).slice(0, 24);
  const peakWeekData = aggregatePeakWeek(events);
  const peakMonthData = aggregatePeakMonth(events);
  const timeline = aggregateMonthlyTimeline(events);
  const lastUpdated = getLastUpdated(events);
  const totalSpending = events.reduce((s, e) => s + e.items.reduce((s2, i) => s2 + (Number(i.totalPrice) || 0), 0), 0);
  const vendorCount = vendorAgg.length;

  /* -----------------------------------------------------------------------
     Hero
     ----------------------------------------------------------------------- */
  if (lastUpdated) {
    const { date, time } = formatDateTimeID(lastUpdated);
    document.getElementById("last-updated-value").textContent = `${date}, ${time}`;
  }
  countUp(document.getElementById("hero-count-events"), events.length);
  countUp(document.getElementById("hero-count-vendors"), vendorCount);
  countUp(document.getElementById("hero-count-spending"), totalSpending, { prefix: "Rp ", formatter: (v) => Math.round(v / 1e6).toLocaleString("id-ID"), suffix: " Jt" });

  const priceHeadlineCount = document.querySelector("#price-headline [data-count]");
  const busiestMonth = [...peakMonthData].sort((a, b) => b.count - a.count)[0];
  const busiestWeek = [...peakWeekData].sort((a, b) => b.count - a.count)[0];
  document.getElementById("peak-insight").textContent =
    busiestMonth.count > 0
      ? `${busiestMonth.label} menjadi bulan paling sibuk, dengan puncak aktivitas di minggu ke-${busiestWeek.week}.`
      : "";

  const spendLeaderByFreq = vendorAgg[0];
  const spendLeaderBySpend = vendorBySpending[0];
  if (spendLeaderByFreq && spendLeaderBySpend) {
    document.getElementById("spend-insight").textContent =
      spendLeaderByFreq.vendor === spendLeaderBySpend.vendor
        ? `${spendLeaderBySpend.vendor} unggul baik dari sisi frekuensi maupun total pengeluaran.`
        : `${spendLeaderByFreq.vendor} paling sering dipakai, tapi ${spendLeaderBySpend.vendor} yang menyerap pengeluaran terbesar.`;
  }

  /* -----------------------------------------------------------------------
     Section renderers — each is called once, the first time its section
     scrolls into view.
     ----------------------------------------------------------------------- */
  const sectionRenderers = {
    "section-price": () => {
      countUp(priceHeadlineCount, events.length, { duration: 1000 });
      const statBox = document.getElementById("price-stats");
      statBox.innerHTML = "";
      const rows = [
        ["Mean", priceStats.mean], ["Median", priceStats.median],
        ["Q1", priceStats.q1], ["Q3", priceStats.q3],
        ["Min", priceStats.min], ["Max", priceStats.max],
      ];
      for (const [label, val] of rows) {
        const div = document.createElement("div");
        div.className = "stat";
        div.innerHTML = `<div class="val">${formatRupiahCompact(val)}</div><div class="lbl">${label}</div>`;
        statBox.appendChild(div);
      }
      renderPriceDistribution(document.getElementById("chart-price"), events, priceStats);
    },
    "section-vendor-freq": () => {
      renderHorizontalBars(document.getElementById("chart-vendor-freq"), vendorAgg, {
        valueKey: "eventCount", labelKey: "vendor", color: ACCENT.vendorFreq,
        valueFormatter: (v) => `${v} event`,
        tooltipFn: (d) => `<strong>${d.vendor}</strong><br>Jumlah event: ${d.eventCount}<br>Jumlah item: ${d.itemOccurrences}<br>Total pengeluaran: ${formatRupiah(d.totalSpending)}`,
      });
    },
    "section-vendor-spend": () => {
      renderHorizontalBars(document.getElementById("chart-vendor-spend"), vendorBySpending, {
        valueKey: "totalSpending", labelKey: "vendor", color: ACCENT.vendorSpend,
        valueFormatter: (v) => formatRupiahCompact(v),
        tooltipFn: (d) => `<strong>${d.vendor}</strong><br>Total pengeluaran: ${formatRupiah(d.totalSpending)}<br>Jumlah event: ${d.eventCount}<br>Rata-rata/event: ${formatRupiah(d.avgSpendingPerEvent)}`,
      });
    },
    "section-items": () => {
      renderHorizontalBars(document.getElementById("chart-items"), itemAgg, {
        valueKey: "occurrences", labelKey: "itemName", color: ACCENT.item,
        valueFormatter: (v) => `${v}×`,
        tooltipFn: (d) => `<strong>${d.itemName}</strong><br>Jumlah event: ${d.eventCount}<br>Total pcs: ${d.totalQty}<br>Total pengeluaran: ${formatRupiah(d.totalSpending)}`,
      });
    },
    "section-item-vendor": () => {
      renderItemVendorBubbles(document.getElementById("chart-item-vendor"), itemVendorPairs);
    },
    "section-time": () => {
      renderVerticalBars(document.getElementById("chart-week"), peakWeekData.map((d) => ({ label: "W" + d.week, count: d.count })), { labelKey: "label", valueKey: "count", color: ACCENT.vendorFreq });
      renderVerticalBars(document.getElementById("chart-month"), peakMonthData, { labelKey: "label", valueKey: "count", color: ACCENT.item });
    },
    "section-trend": () => {
      renderTimeline(document.getElementById("chart-timeline"), timeline);
    },
  };

  const rendered = new Set();
  function renderSectionOnce(id) {
    if (rendered.has(id) || !sectionRenderers[id]) return;
    rendered.add(id);
    sectionRenderers[id]();
  }

  /* -----------------------------------------------------------------------
     Reveal + lazy render on scroll, and progress rail sync
     ----------------------------------------------------------------------- */
  const sections = [...document.querySelectorAll(".story-section")];
  const railButtons = [...progressRail.querySelectorAll("button")];

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        renderSectionOnce(entry.target.id);
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
      rendered.forEach((id) => sectionRenderers[id]());
    }, 250);
  });
})();
