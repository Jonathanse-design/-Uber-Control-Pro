const starterEntries = [
  { fecha: "2026-05-26", ingresos: 821.62, combustible: 960.4, otros_gastos: 6579, tipo_gasto: "Merienda / Mantenimiento", viajes: 4, km_inicio: 8500, km_final: 8460, notas: "Importado desde hoja Combustible km.xlsx", horas: 6 },
  { fecha: "2026-05-27", ingresos: 2265.58, combustible: 0, otros_gastos: 200, tipo_gasto: "Merienda", viajes: 8, km_inicio: 8456, km_final: 8377, notas: "Importado desde hoja Combustible km.xlsx", horas: 8 },
  { fecha: "2026-05-28", ingresos: 2752.49, combustible: 1898.85, otros_gastos: 1576.86, tipo_gasto: "Merienda / internet", viajes: 12, km_inicio: 8377, km_final: 8251, notas: "Importado desde hoja Combustible km.xlsx", horas: 9 },
  { fecha: "2026-05-29", ingresos: 4269, combustible: 0, otros_gastos: 150, tipo_gasto: "Merienda", viajes: 15, km_inicio: 8251, km_final: 8107, notas: "Importado desde hoja Combustible km.xlsx", horas: 10 },
  { fecha: "2026-05-30", ingresos: 2281, combustible: 1000, otros_gastos: 4200, tipo_gasto: "Merienda y frenos", viajes: 9, km_inicio: 8107, km_final: 7977, notas: "Importado desde hoja Combustible km.xlsx", horas: 8 },
  { fecha: "2026-05-31", ingresos: 3448, combustible: 0, otros_gastos: 0, tipo_gasto: "", viajes: 12, km_inicio: 7977, km_final: 7838, notas: "Importado desde hoja Combustible km.xlsx", horas: 9 },
  { fecha: "2026-06-01", ingresos: 3292, combustible: 1800, otros_gastos: 100, tipo_gasto: "Merienda", viajes: 11, km_inicio: 7838, km_final: 7691, notas: "Importado desde hoja Combustible km.xlsx", horas: 9 },
  { fecha: "2026-06-02", ingresos: 2174, combustible: 0, otros_gastos: 580, tipo_gasto: "Lavado y merienda", viajes: 8, km_inicio: 7691, km_final: 7562, notas: "Importado desde hoja Combustible km.xlsx", horas: 7 },
  { fecha: "2026-06-03", ingresos: 1724, combustible: 1881, otros_gastos: 4767, tipo_gasto: "Merienda y otros", viajes: 8, km_inicio: 7562, km_final: 7438, notas: "Importado desde hoja Combustible km.xlsx", horas: 8 },
  { fecha: "2026-06-04", ingresos: 0, combustible: 0, otros_gastos: 650, tipo_gasto: "Merienda", viajes: 0, km_inicio: 7438, km_final: 7398, notas: "No se trabajo Uber salí con las niñas de paseo", horas: 0 },
  { fecha: "2026-06-05", ingresos: 2147, combustible: 0, otros_gastos: 1100, tipo_gasto: "Mami y merienda", viajes: 7, km_inicio: 7398, km_final: 7296, notas: "Día flojo", horas: 7 }
];

const defaultSettings = {
  reserveRate: 8,
  depreciationRate: 4.5,
  dailyGoal: 3500,
  weeklyGoal: 22000,
  monthlyGoal: 95000,
  annualGoal: 1140000
};

let entries = load("ucp_entries", starterEntries);
let settings = load("ucp_settings", defaultSettings);
let charts = {};

const fmtMoney = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 1 });
const today = new Date("2026-06-05T12:00:00");

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("todayLabel").textContent = today.toLocaleDateString("es-DO", { weekday: "long", day: "numeric", month: "long" });
  hydrateSettings();
  bindEvents();
  renderAll();
  registerServiceWorker();
});

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function save() {
  localStorage.setItem("ucp_entries", JSON.stringify(entries));
  localStorage.setItem("ucp_settings", JSON.stringify(settings));
}

function km(entry) {
  return Math.abs(Number(entry.km_final || 0) - Number(entry.km_inicio || 0));
}

function enrich(entry) {
  const ingresos = Number(entry.ingresos || 0) + Number(entry.propinas || 0) + Number(entry.bonos || 0);
  const gastos = Number(entry.combustible || 0) + Number(entry.comida || 0) + Number(entry.peajes || 0) + Number(entry.otros_gastos || 0);
  const distance = km(entry);
  const reserve = distance * Number(settings.reserveRate || 0);
  const depreciation = distance * Number(settings.depreciationRate || 0);
  const operating = ingresos - gastos;
  const real = operating - reserve - depreciation;
  return { ...entry, ingresos, gastos, km: distance, reserve, depreciation, operating, real };
}

function rangeEntries(period) {
  const enriched = entries.map(enrich).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const latest = enriched.at(-1)?.fecha || "2026-06-05";
  const latestDate = new Date(`${latest}T12:00:00`);
  const days = { day: 1, week: 7, month: 31, year: 366 }[period] || 7;
  const start = new Date(latestDate);
  start.setDate(start.getDate() - days + 1);
  return enriched.filter(entry => new Date(`${entry.fecha}T12:00:00`) >= start);
}

function totals(data) {
  return data.reduce((acc, entry) => {
    ["ingresos", "gastos", "combustible", "otros_gastos", "viajes", "km", "reserve", "depreciation", "operating", "real"].forEach(key => acc[key] += Number(entry[key] || 0));
    acc.horas += Number(entry.horas || 0);
    return acc;
  }, { ingresos: 0, gastos: 0, combustible: 0, otros_gastos: 0, viajes: 0, km: 0, reserve: 0, depreciation: 0, operating: 0, real: 0, horas: 0 });
}

function renderAll() {
  const period = document.getElementById("periodSelect").value;
  const data = rangeEntries(period);
  const all = entries.map(enrich);
  const total = totals(data);
  renderHero(total);
  renderKpis(total);
  renderCharts(data);
  renderGoals(all);
  renderProfitStack(total);
  renderReports(all);
  renderMaintenance(all);
  renderHistory();
  renderLiveResults(new FormData(document.getElementById("entryForm")));
}

function renderHero(total) {
  document.getElementById("heroNet").textContent = fmtMoney.format(total.real);
  document.getElementById("heroOperating").textContent = fmtMoney.format(total.operating);
  document.getElementById("heroCosts").textContent = fmtMoney.format(total.gastos);
  document.getElementById("heroReserve").textContent = fmtMoney.format(total.reserve);
}

function renderKpis(total) {
  const perHour = total.horas ? total.real / total.horas : 0;
  const perKm = total.km ? total.real / total.km : 0;
  const roi = total.gastos ? (total.real / total.gastos) * 100 : 0;
  const items = [
    ["Ingreso Hoy", todayTotal("ingresos"), "cash", "up"],
    ["Ingreso Semana", total.ingresos, "calendar", "up"],
    ["Ingreso Mes", totals(rangeEntries("month")).ingresos, "wallet", "up"],
    ["Ganancia Neta", total.real, "profit", total.real >= 0 ? "up" : "down"],
    ["Combustible", total.combustible, "fuel", "down"],
    ["KM Recorridos", total.km, "route", "up", "km"],
    ["Viajes", total.viajes, "car", "up", "num"],
    ["Ganancia/Hora", perHour, "clock", "up"],
    ["Ganancia/KM", perKm, "gauge", perKm >= 0 ? "up" : "down"],
    ["ROI Vehículo", roi, "roi", roi >= 0 ? "up" : "down", "percent"],
    ["Reserva Mantenimiento", total.reserve, "wrench", "up"]
  ];
  document.getElementById("kpiGrid").innerHTML = items.map(([label, value, icon, trend, kind]) => `
    <article class="kpi-card">
      <div class="kpi-top"><span>${label}</span><span class="kpi-icon">${iconSvg(icon)}</span></div>
      <div>
        <div class="kpi-value">${formatByKind(value, kind)}</div>
        <div class="trend ${trend}">${trend === "up" ? "▲" : "▼"} Comparativo anterior</div>
      </div>
    </article>
  `).join("");
}

function iconSvg(name) {
  const icons = {
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 3v4M16 3v4"/><rect x="4" y="5" width="16" height="17" rx="2"/><path d="M4 10h16M8 14h.01M12 14h.01M16 14h.01"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h13"/><path d="M16 13h.01"/></svg>',
    profit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 18 10 12l4 4 6-9"/><path d="M15 7h5v5"/></svg>',
    fuel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M4 21h13M8 7h5M16 8h1a3 3 0 0 1 3 3v7a2 2 0 0 0 2 2"/></svg>',
    route: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h4a4 4 0 0 0 0-8h-1a4 4 0 0 1 0-8h5"/></svg>',
    car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 13 7 7h10l2 6"/><path d="M4 13h16v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2H9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5Z"/><path d="M7 15h.01M17 15h.01"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 16a8 8 0 0 1 16 0"/><path d="m12 16 4-5"/><path d="M6 16h12"/></svg>',
    roi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-4 3 3 6-8"/></svg>',
    wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 7a4 4 0 0 0 5 5L10 21l-5-5 9-9Z"/><path d="m7 17 3 3"/></svg>'
  };
  return icons[name] || icons.profit;
}

function todayTotal(key) {
  return entries.map(enrich).filter(entry => entry.fecha === "2026-06-05").reduce((sum, entry) => sum + Number(entry[key] || 0), 0);
}

function formatByKind(value, kind) {
  if (kind === "km") return `${fmtNum.format(value)} km`;
  if (kind === "num") return fmtNum.format(value);
  if (kind === "percent") return `${fmtNum.format(value)}%`;
  return fmtMoney.format(value);
}

function renderCharts(data) {
  document.getElementById("rangePill").textContent = document.getElementById("periodSelect").selectedOptions[0].textContent;
  const labels = data.map(entry => entry.fecha.slice(5));
  const css = getComputedStyle(document.body);
  const primary = css.getPropertyValue("--primary").trim();
  const success = css.getPropertyValue("--success").trim();
  const danger = css.getPropertyValue("--danger").trim();
  const muted = css.getPropertyValue("--muted").trim();
  drawChart("profitChart", {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Ingresos", data: data.map(entry => entry.ingresos), borderColor: primary, backgroundColor: "rgba(37,99,235,.14)", tension: .42, fill: true },
        { label: "Gastos", data: data.map(entry => entry.gastos), borderColor: danger, backgroundColor: "rgba(239,68,68,.08)", tension: .42, fill: true },
        { label: "Ganancia real", data: data.map(entry => entry.real), borderColor: success, backgroundColor: "rgba(16,185,129,.16)", tension: .42, fill: true }
      ]
    },
    options: chartOptions(muted)
  });
  const total = totals(data);
  drawChart("expenseChart", {
    type: "doughnut",
    data: {
      labels: ["Combustible", "Comida", "Peajes", "Mantenimiento/Otros"],
      datasets: [{ data: [total.combustible, sumField(data, "comida"), sumField(data, "peajes"), total.otros_gastos], backgroundColor: [primary, "#10b981", "#f59e0b", "#ef4444"], borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { color: muted, usePointStyle: true } } }, cutout: "68%" }
  });
}

function drawChart(id, config) {
  charts[id]?.destroy();
  charts[id] = new Chart(document.getElementById(id), config);
}

function chartOptions(color) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { labels: { color, usePointStyle: true } } },
    scales: {
      x: { ticks: { color }, grid: { display: false } },
      y: { ticks: { color }, grid: { color: "rgba(148,163,184,.18)" } }
    }
  };
}

function sumField(data, key) {
  return data.reduce((sum, item) => sum + Number(item[key] || 0), 0);
}

function renderGoals(all) {
  const month = all.filter(entry => entry.fecha.startsWith("2026-06"));
  const monthTotal = totals(month);
  const percent = Math.max(0, Math.min(100, Math.round((monthTotal.real / settings.monthlyGoal) * 100)));
  const missing = Math.max(0, settings.monthlyGoal - monthTotal.real);
  document.getElementById("monthlyRing").style.setProperty("--value", `${percent}%`);
  document.getElementById("monthlyRing").querySelector("span").textContent = `${percent}%`;
  document.getElementById("goalMissing").textContent = fmtMoney.format(missing);
  document.getElementById("goalEta").textContent = estimateEta(monthTotal.real);
  document.getElementById("annualGoal").textContent = fmtMoney.format(settings.annualGoal);

  const goals = [
    ["Diaria", todayTotal("real"), settings.dailyGoal],
    ["Semanal", totals(rangeEntries("week")).real, settings.weeklyGoal],
    ["Mensual", monthTotal.real, settings.monthlyGoal],
    ["Anual", totals(all).real, settings.annualGoal]
  ];
  document.getElementById("goalsGrid").innerHTML = goals.map(([name, current, goal]) => {
    const value = Math.max(0, Math.min(100, Math.round((current / goal) * 100)));
    return `<article class="panel goal-card">
      <h3>Meta ${name}</h3>
      <div class="kpi-value">${fmtMoney.format(current)}</div>
      <p>de ${fmtMoney.format(goal)}</p>
      <div class="progress-bar" style="--value:${value}%"><span></span></div>
      <div class="profit-row"><span>Progreso</span><strong>${value}%</strong></div>
      <div class="profit-row"><span>Faltante</span><strong>${fmtMoney.format(Math.max(0, goal - current))}</strong></div>
    </article>`;
  }).join("");
}

function estimateEta(current) {
  const juneDays = entries.filter(entry => entry.fecha.startsWith("2026-06")).length || 1;
  const dailyAvg = current / juneDays;
  if (dailyAvg <= 0) return "Sin proyección";
  const remainingDays = Math.ceil(Math.max(0, settings.monthlyGoal - current) / dailyAvg);
  const eta = new Date(today);
  eta.setDate(eta.getDate() + remainingDays);
  return eta.toLocaleDateString("es-DO", { day: "numeric", month: "short" });
}

function renderProfitStack(total) {
  const rows = [
    ["Ingresos", total.ingresos],
    ["Gastos diarios", -total.gastos],
    ["Ganancia operativa", total.operating],
    ["Reserva mantenimiento", -total.reserve],
    ["Depreciación vehículo", -total.depreciation],
    ["Ganancia real", total.real]
  ];
  document.getElementById("profitStack").innerHTML = rows.map(([label, value]) => `<div class="profit-row"><span>${label}</span><strong>${fmtMoney.format(value)}</strong></div>`).join("");
}

function renderReports(all) {
  const reportData = [
    ["Semanal", rangeEntries("week")],
    ["Mensual", rangeEntries("month")],
    ["Anual", all]
  ];
  document.getElementById("reportGrid").innerHTML = reportData.map(([label, data]) => {
    const total = totals(data);
    const best = [...data].sort((a, b) => b.real - a.real)[0];
    const worst = [...data].sort((a, b) => a.real - b.real)[0];
    return `<article class="panel report-card">
      <h3>${label}</h3>
      ${reportRow("Ingresos", fmtMoney.format(total.ingresos))}
      ${reportRow("Gastos", fmtMoney.format(total.gastos))}
      ${reportRow("Combustible", fmtMoney.format(total.combustible))}
      ${reportRow("Horas", fmtNum.format(total.horas))}
      ${reportRow("KM", `${fmtNum.format(total.km)} km`)}
      ${reportRow("Viajes", fmtNum.format(total.viajes))}
      ${reportRow("Ganancia operativa", fmtMoney.format(total.operating))}
      ${reportRow("Ganancia real", fmtMoney.format(total.real))}
      ${reportRow("Mejor día", best ? `${best.fecha} · ${fmtMoney.format(best.real)}` : "-")}
      ${reportRow("Peor día", worst ? `${worst.fecha} · ${fmtMoney.format(worst.real)}` : "-")}
    </article>`;
  }).join("");
}

function reportRow(label, value) {
  return `<div class="report-row"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderMaintenance(all) {
  const currentKm = Math.min(...all.map(entry => Math.min(Number(entry.km_inicio), Number(entry.km_final))).filter(Boolean));
  const items = [
    ["Aceite", 7200, 2500],
    ["Filtro aire motor", 6500, 1800],
    ["Filtro cabina", 6000, 1200],
    ["Pastillas de freno", 5300, 6500],
    ["Batería", 4200, 7800],
    ["Neumáticos", 10000, 24000],
    ["Transmisión", 18000, 9000],
    ["Alineación", 7600, 1600],
    ["Balanceo", 7500, 1400]
  ].map(([name, dueKm, cost]) => ({ name, remaining: Math.max(0, currentKm - dueKm), cost }));
  const health = Math.round(items.reduce((sum, item) => sum + Math.min(100, (item.remaining / 3000) * 100), 0) / items.length);
  const next = [...items].sort((a, b) => a.remaining - b.remaining)[0];
  document.getElementById("vehicleHealth").textContent = `${health}%`;
  document.getElementById("vehicleHealthBar").style.width = `${health}%`;
  document.getElementById("nextMaintenance").textContent = `Próximo: ${next.name}, ${fmtNum.format(next.remaining)} km restantes, costo estimado ${fmtMoney.format(next.cost)}.`;
  document.getElementById("maintenanceGrid").innerHTML = items.map(item => `
    <article class="panel maintenance-card">
      <strong>${item.name}</strong>
      <p>${fmtNum.format(item.remaining)} km restantes</p>
      <div class="progress-bar" style="--value:${Math.max(6, Math.min(100, item.remaining / 30))}%"><span></span></div>
      <div class="profit-row"><span>Costo estimado</span><strong>${fmtMoney.format(item.cost)}</strong></div>
    </article>
  `).join("");
}

function renderHistory() {
  const query = (document.getElementById("historySearch")?.value || "").trim().toLowerCase();
  const rows = entries
    .map(enrich)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .filter(entry => {
      const searchable = [entry.fecha, entry.tipo_gasto, entry.notas, entry.ingresos, entry.combustible, entry.otros_gastos].join(" ").toLowerCase();
      return !query || searchable.includes(query);
    });
  const total = totals(rows);
  document.getElementById("historyCount").textContent = `${rows.length} registro${rows.length === 1 ? "" : "s"}`;
  document.getElementById("historySummary").innerHTML = [
    ["Ingresos totales", fmtMoney.format(total.ingresos)],
    ["Gastos totales", fmtMoney.format(total.gastos)],
    ["KM recorridos", `${fmtNum.format(total.km)} km`],
    ["Ganancia real", fmtMoney.format(total.real)]
  ].map(([label, value]) => `<article class="panel summary-card"><span>${label}</span><strong>${value}</strong></article>`).join("");
  document.getElementById("historyTable").innerHTML = rows.length ? rows.map(entry => `
    <tr>
      <td><strong>${escapeHtml(formatDate(entry.fecha))}</strong></td>
      <td>${fmtMoney.format(entry.ingresos)}</td>
      <td>${fmtMoney.format(entry.combustible)}</td>
      <td>${fmtMoney.format(Number(entry.otros_gastos || 0))}</td>
      <td>${escapeHtml(entry.tipo_gasto || "-")}</td>
      <td>${fmtNum.format(Number(entry.viajes || 0))}</td>
      <td>${fmtNum.format(Number(entry.km_inicio || 0))}</td>
      <td>${fmtNum.format(Number(entry.km_final || 0))}</td>
      <td>${fmtNum.format(entry.km)}</td>
      <td class="${entry.operating >= 0 ? "money-positive" : "money-negative"}">${fmtMoney.format(entry.operating)}</td>
      <td class="${entry.real >= 0 ? "money-positive" : "money-negative"}">${fmtMoney.format(entry.real)}</td>
      <td class="note-cell">${escapeHtml(entry.notas || "-")}</td>
    </tr>
  `).join("") : `<tr class="empty-row"><td colspan="12">No hay registros con ese filtro.</td></tr>`;
}

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));
  document.getElementById("periodSelect").addEventListener("change", renderAll);
  document.getElementById("themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("ucp_theme", document.body.classList.contains("dark") ? "dark" : "light");
    renderAll();
  });
  if (localStorage.getItem("ucp_theme") === "dark") document.body.classList.add("dark");
  document.getElementById("menuToggle").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
  document.getElementById("entryForm").addEventListener("input", event => renderLiveResults(new FormData(event.currentTarget)));
  document.getElementById("entryForm").addEventListener("submit", saveEntry);
  document.getElementById("exportCsv").addEventListener("click", () => exportCsv(entries));
  document.getElementById("backupCsv").addEventListener("click", () => exportCsv(entries));
  document.getElementById("exportXls").addEventListener("click", exportExcel);
  document.getElementById("backupXls").addEventListener("click", exportExcel);
  document.getElementById("backupJson").addEventListener("click", exportJson);
  document.getElementById("importFile").addEventListener("change", importFile);
  document.getElementById("saveSettings").addEventListener("click", saveSettings);
  document.getElementById("historySearch").addEventListener("input", renderHistory);
  document.getElementById("historyExport").addEventListener("click", () => exportCsv(entries));
}

function switchView(id) {
  document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === id));
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === id));
  document.getElementById("sidebar").classList.remove("open");
}

function renderLiveResults(formData) {
  const values = Object.fromEntries(formData.entries());
  const result = enrich(values);
  const rows = [
    ["Ganancia neta", result.real],
    ["Ganancia por hora", result.horas ? result.real / result.horas : 0],
    ["Ganancia por viaje", result.viajes ? result.real / result.viajes : 0],
    ["Costo por KM", result.km ? result.gastos / result.km : 0],
    ["ROI diario", result.gastos ? (result.real / result.gastos) * 100 : 0, "percent"]
  ];
  document.getElementById("liveResults").innerHTML = rows.map(([label, value, kind]) => `<div class="profit-row"><span>${label}</span><strong>${kind === "percent" ? `${fmtNum.format(value)}%` : fmtMoney.format(value)}</strong></div>`).join("");
}

function saveEntry(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  entries.push({ ...data, fecha: new Date().toISOString().slice(0, 10), tipo_gasto: "Registro manual" });
  save();
  event.currentTarget.reset();
  renderAll();
  switchView("dashboard");
}

function hydrateSettings() {
  document.getElementById("reserveRate").value = settings.reserveRate;
  document.getElementById("depreciationRate").value = settings.depreciationRate;
  document.getElementById("dailyGoalInput").value = settings.dailyGoal;
  document.getElementById("monthlyGoalInput").value = settings.monthlyGoal;
}

function saveSettings() {
  settings = {
    ...settings,
    reserveRate: Number(document.getElementById("reserveRate").value),
    depreciationRate: Number(document.getElementById("depreciationRate").value),
    dailyGoal: Number(document.getElementById("dailyGoalInput").value),
    monthlyGoal: Number(document.getElementById("monthlyGoalInput").value)
  };
  settings.weeklyGoal = settings.dailyGoal * 6;
  settings.annualGoal = settings.monthlyGoal * 12;
  save();
  renderAll();
}

function exportCsv(data) {
  const headers = ["fecha", "ingresos", "combustible", "otros_gastos", "tipo_gasto", "viajes", "km_inicio", "km_final", "notas", "horas"];
  const csv = [headers.join(","), ...data.map(row => headers.map(key => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
  download("uber-control-pro.csv", "text/csv", csv);
}

function exportJson() {
  download("uber-control-pro-backup.json", "application/json", JSON.stringify({ entries, settings }, null, 2));
}

function exportExcel() {
  const rows = entries.map(enrich);
  const table = `<table><tr>${Object.keys(rows[0]).map(key => `<th>${key}</th>`).join("")}</tr>${rows.map(row => `<tr>${Object.values(row).map(value => `<td>${value}</td>`).join("")}</tr>`).join("")}</table>`;
  download("uber-control-pro.xls", "application/vnd.ms-excel", table);
}

function download(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function importFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    if (file.name.endsWith(".json")) {
      const backup = JSON.parse(text);
      entries = backup.entries || entries;
      settings = backup.settings || settings;
    } else {
      entries = parseCsv(text);
    }
    save();
    hydrateSettings();
    renderAll();
  };
  reader.readAsText(file);
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(headerLine).map(item => item.replaceAll('"', ""));
  return lines.filter(Boolean).map(line => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((key, index) => [key, (cells[index] || "").replace(/^"|"$/g, "").replaceAll('""', '"')]));
  });
}

function splitCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
      cell += char;
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
  }
}
