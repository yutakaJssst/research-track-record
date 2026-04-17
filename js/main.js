"use strict";

const STATUS_LABEL = {
  accepted: "採択",
  rejected: "不採択",
  pending: "結果待ち",
};

const TYPE_LABEL = {
  conference: "国際会議",
  workshop: "ワークショップ",
  journal: "論文誌",
  grant: "予算",
};

const ROLE_LABEL = {
  "first-author": "First author",
  "co-author": "Co-author",
  "pi": "代表",
  "co-pi": "分担",
  "unknown": "—",
};

const PAPER_TYPE_LABEL = {
  full: "Full",
  short: "Short",
  poster: "Poster",
  "fast-abstract": "Fast Abstract",
};

const STATUS_COLOR = {
  accepted: "#2f855a",
  rejected: "#c04a4a",
  pending: "#9e7b1c",
};

const state = {
  items: [],
  filtered: [],
  sort: { key: "year", dir: "desc" },
  charts: {},
};

async function init() {
  try {
    const res = await fetch("./data.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.items = data.items || [];

    document.getElementById("owner-name").textContent = data.meta?.owner
      ? `— ${data.meta.owner}`
      : "";
    document.getElementById("last-updated").textContent =
      data.meta?.lastUpdated || "—";

    setupFilters();
    bindEvents();
    applyFilters();
    renderCharts();
  } catch (err) {
    console.error("データ読み込み失敗:", err);
    document.querySelector("main").innerHTML =
      `<p style="padding:20px;color:#c04a4a">データを読み込めませんでした。ブラウザ直接ではなく、静的サーバ経由で表示してください（例: <code>python3 -m http.server</code>）。詳細: ${err.message}</p>`;
  }
}

function setupFilters() {
  const years = [...new Set(state.items.map((i) => i.year))].sort((a, b) => b - a);
  const yearSelect = document.getElementById("filter-year");
  for (const y of years) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }
}

function bindEvents() {
  for (const id of ["filter-year", "filter-kind", "filter-type", "filter-status"]) {
    document.getElementById(id).addEventListener("change", applyFilters);
  }
  document.getElementById("filter-search").addEventListener("input", applyFilters);

  for (const th of document.querySelectorAll("thead th[data-sort]")) {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sort.key === key) {
        state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
      } else {
        state.sort.key = key;
        state.sort.dir = "asc";
      }
      renderTable();
    });
  }
}

function applyFilters() {
  const year = document.getElementById("filter-year").value;
  const kind = document.getElementById("filter-kind").value;
  const type = document.getElementById("filter-type").value;
  const status = document.getElementById("filter-status").value;
  const q = document.getElementById("filter-search").value.trim().toLowerCase();

  state.filtered = state.items.filter((item) => {
    if (year && String(item.year) !== year) return false;
    if (kind && item.kind !== kind) return false;
    if (type && item.type !== type) return false;
    if (status && item.status !== status) return false;
    if (q) {
      const hay = `${item.title} ${item.venue} ${item.venueFull} ${item.notes || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  renderSummary();
  renderTable();
}

function renderSummary() {
  const all = state.filtered;
  const accepted = all.filter((i) => i.status === "accepted").length;
  const rejected = all.filter((i) => i.status === "rejected").length;
  const pending = all.filter((i) => i.status === "pending").length;
  const decided = accepted + rejected;
  const rate = decided > 0 ? Math.round((accepted / decided) * 100) : null;

  document.getElementById("stat-total").textContent = all.length;
  document.getElementById("stat-accepted").textContent = accepted;
  document.getElementById("stat-rejected").textContent = rejected;
  document.getElementById("stat-pending").textContent = pending;
  document.getElementById("stat-rate").textContent =
    rate === null ? "—" : `${rate}%`;
}

function renderTable() {
  const tbody = document.getElementById("items-tbody");
  const { key, dir } = state.sort;
  const sorted = [...state.filtered].sort((a, b) => {
    const av = a[key] ?? "";
    const bv = b[key] ?? "";
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });

  tbody.innerHTML = sorted
    .map((item) => {
      const statusBadge = `<span class="badge badge--${item.status}">${STATUS_LABEL[item.status] || item.status}</span>`;
      const typePill = `<span class="type-pill">${TYPE_LABEL[item.type] || item.type}</span>`;
      const paperType = item.paperType ? (PAPER_TYPE_LABEL[item.paperType] || item.paperType) : "—";
      const role = ROLE_LABEL[item.role] || item.role || "—";
      const categoryLabel = item.category === "international" ? "国際" : (item.category === "domestic" ? "国内" : "—");
      const notes = item.notes || "";
      const venueFull = item.venueFull && item.venueFull !== item.venue
        ? `<br><span style="color:var(--text-muted);font-size:0.8rem">${escapeHtml(item.venueFull)}</span>`
        : "";
      return `<tr>
        <td>${item.year}</td>
        <td>${escapeHtml(item.title)}</td>
        <td>${escapeHtml(item.venue)}${venueFull}</td>
        <td>${typePill}</td>
        <td>${categoryLabel}</td>
        <td>${paperType}</td>
        <td>${role}</td>
        <td>${statusBadge}</td>
        <td>${escapeHtml(notes)}</td>
      </tr>`;
    })
    .join("");

  document.getElementById("visible-count").textContent = sorted.length;
  document.getElementById("total-count").textContent = state.items.length;

  for (const th of document.querySelectorAll("thead th[data-sort]")) {
    th.classList.remove("sorted-asc", "sorted-desc");
    if (th.dataset.sort === key) {
      th.classList.add(dir === "asc" ? "sorted-asc" : "sorted-desc");
    }
  }
}

function renderCharts() {
  renderYearChart();
  renderTypeChart();
  renderRateChart();
  renderCategoryChart();
}

function getMutedColor() {
  return getComputedStyle(document.body).getPropertyValue("--text-muted").trim() || "#6b7280";
}

function chartDefaults() {
  const muted = getMutedColor();
  return {
    plugins: {
      legend: { labels: { color: muted, font: { size: 11 } } },
      tooltip: { bodyFont: { size: 12 } },
    },
    scales: {
      x: { ticks: { color: muted }, grid: { color: "rgba(128,128,128,0.12)" } },
      y: { ticks: { color: muted, precision: 0 }, grid: { color: "rgba(128,128,128,0.12)" } },
    },
  };
}

function renderYearChart() {
  const years = [...new Set(state.items.map((i) => i.year))].sort((a, b) => a - b);
  const accepted = years.map((y) =>
    state.items.filter((i) => i.year === y && i.status === "accepted").length);
  const rejected = years.map((y) =>
    state.items.filter((i) => i.year === y && i.status === "rejected").length);
  const pending = years.map((y) =>
    state.items.filter((i) => i.year === y && i.status === "pending").length);

  const defaults = chartDefaults();
  state.charts.year = new Chart(document.getElementById("chart-year"), {
    type: "bar",
    data: {
      labels: years,
      datasets: [
        { label: "採択", data: accepted, backgroundColor: STATUS_COLOR.accepted, stack: "s" },
        { label: "不採択", data: rejected, backgroundColor: STATUS_COLOR.rejected, stack: "s" },
        { label: "結果待ち", data: pending, backgroundColor: STATUS_COLOR.pending, stack: "s" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...defaults,
      scales: {
        x: { ...defaults.scales.x, stacked: true },
        y: { ...defaults.scales.y, stacked: true },
      },
    },
  });
}

function renderTypeChart() {
  const types = ["conference", "workshop", "journal", "grant"];
  const accepted = types.map((t) =>
    state.items.filter((i) => i.type === t && i.status === "accepted").length);
  const rejected = types.map((t) =>
    state.items.filter((i) => i.type === t && i.status === "rejected").length);
  const pending = types.map((t) =>
    state.items.filter((i) => i.type === t && i.status === "pending").length);

  const defaults = chartDefaults();
  state.charts.type = new Chart(document.getElementById("chart-type"), {
    type: "bar",
    data: {
      labels: types.map((t) => TYPE_LABEL[t]),
      datasets: [
        { label: "採択", data: accepted, backgroundColor: STATUS_COLOR.accepted },
        { label: "不採択", data: rejected, backgroundColor: STATUS_COLOR.rejected },
        { label: "結果待ち", data: pending, backgroundColor: STATUS_COLOR.pending },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      ...defaults,
    },
  });
}

function renderRateChart() {
  const types = ["conference", "workshop", "journal", "grant"];
  const rates = types.map((t) => {
    const accepted = state.items.filter((i) => i.type === t && i.status === "accepted").length;
    const rejected = state.items.filter((i) => i.type === t && i.status === "rejected").length;
    const decided = accepted + rejected;
    return decided > 0 ? Math.round((accepted / decided) * 100) : 0;
  });

  const defaults = chartDefaults();
  state.charts.rate = new Chart(document.getElementById("chart-rate"), {
    type: "bar",
    data: {
      labels: types.map((t) => TYPE_LABEL[t]),
      datasets: [{
        label: "採択率 (%)",
        data: rates,
        backgroundColor: "#1f4f8b",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...defaults,
      scales: {
        x: defaults.scales.x,
        y: { ...defaults.scales.y, max: 100, ticks: { ...defaults.scales.y.ticks, callback: (v) => `${v}%` } },
      },
      plugins: { ...defaults.plugins, legend: { display: false } },
    },
  });
}

function renderCategoryChart() {
  const categories = ["international", "domestic"];
  const counts = categories.map((c) =>
    state.items.filter((i) => i.category === c).length);

  const defaults = chartDefaults();
  state.charts.category = new Chart(document.getElementById("chart-category"), {
    type: "doughnut",
    data: {
      labels: ["国際", "国内"],
      datasets: [{
        data: counts,
        backgroundColor: ["#1f4f8b", "#6ea8e0"],
        borderColor: "transparent",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: defaults.plugins,
    },
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

document.addEventListener("DOMContentLoaded", init);
