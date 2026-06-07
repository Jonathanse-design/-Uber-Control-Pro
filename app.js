const starterEntries = Array.isArray(window.HISTORICAL_UBER_CONTROL_2026) ? window.HISTORICAL_UBER_CONTROL_2026 : [];

const defaultSettings = {
  reserveRate: 8,
  depreciationRate: 4.5,
  dailyGoal: 3500,
  weeklyGoal: 22000,
  monthlyGoal: 95000,
  annualGoal: 1140000,
  profileName: "",
  vehicle: {
    type: "Automóvil",
    brand: "",
    model: "",
    year: "",
    fuel: "Gasolina",
    currentKm: 0
  }
};

const demoSettings = {
  reserveRate: 8,
  depreciationRate: 4.5,
  dailyGoal: 4200,
  weeklyGoal: 25200,
  monthlyGoal: 108000,
  annualGoal: 1296000,
  profileName: "Conductor Demo",
  vehicle: {
    type: "Automóvil",
    brand: "Vehículo",
    model: "Demo",
    year: "2026",
    fuel: "Gasolina",
    currentKm: 42180
  }
};

let entries = initializeEntries();
let settings = loadSettings();
let charts = {};

const fmtMoney = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 1 });
const today = new Date("2026-06-05T12:00:00");

document.addEventListener("DOMContentLoaded", () => {
  renderGreeting();
  setDefaultEntryDate();
  hydrateSettings();
  bindEvents();
  renderAll();
  document.body.classList.add("app-ready");
  maybeShowWelcome();
  registerServiceWorker();
});

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function loadSettings() {
  return normalizeSettings(load("ucp_settings", defaultSettings));
}

function normalizeSettings(value = {}) {
  return {
    ...defaultSettings,
    ...value,
    vehicle: {
      ...defaultSettings.vehicle,
      ...(value.vehicle || {})
    }
  };
}

function save() {
  entries = mergeEntries(entries);
  settings = normalizeSettings(settings);
  localStorage.setItem("ucp_entries", JSON.stringify(entries));
  localStorage.setItem("ucp_settings", JSON.stringify(settings));
}

function renderGreeting() {
  const hour = new Date().getHours();
  const salutation = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const title = document.getElementById("greetingTitle");
  if (title) title.textContent = `${salutation}, conductor`;
  document.getElementById("todayLabel").textContent = new Date().toLocaleDateString("es-DO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function initializeEntries() {
  const saved = load("ucp_entries", null);
  return Array.isArray(saved) ? mergeEntries(saved) : [];
}

function sourcePriority(source) {
  return ({ manual: 6, combustible_km: 5, imported_excel: 3, imported_csv: 3, demo: 2, existing_local: 2, uber_ingresos_2026: 1 })[source] || 2;
}

function entryMergeKey(entry) {
  if (entry.source === "manual" && entry.allowDuplicate && entry.id) return `manual:${entry.fecha}:${entry.id}`;
  return entry.fecha;
}

function mergeEntries(...groups) {
  const byDate = new Map();
  groups.flat().filter(Boolean).map(normalizeEntry).filter(entry => entry.fecha).forEach(entry => {
    const key = entryMergeKey(entry);
    const current = byDate.get(key);
    if (!current || sourcePriority(entry.source) >= sourcePriority(current.source)) byDate.set(key, entry);
  });
  return [...byDate.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function buildDemoEntries() {
  const expenseTypes = ["Merienda", "Lavado", "Peajes", "Parqueo", "Mantenimiento menor", ""];
  const records = [];
  const todayDate = new Date();
  let odometer = 42180;

  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = new Date(todayDate);
    date.setDate(todayDate.getDate() - offset);
    const day = 29 - offset;
    const isLightDay = day % 11 === 4;
    const trips = isLightDay ? 7 + (day % 3) : 12 + (day % 8);
    const hours = isLightDay ? 4.5 + (day % 2) : 7 + (day % 4) * 0.5;
    const totalKm = isLightDay ? 68 + (day % 18) : 108 + ((day * 13) % 64);
    const kmStart = odometer;
    const kmEnd = kmStart + totalKm;
    odometer = kmEnd;
    const income = Math.round((isLightDay ? 2400 : 3600) + ((day * 277) % 1850) + trips * 62);
    const fuel = Math.round((isLightDay ? 720 : 1120) + ((day * 131) % 760));
    const expenses = Math.round(180 + ((day * 79) % 620));
    const netProfit = income - fuel - expenses;

    records.push({
      fecha: localDateValue(date),
      fuel,
      income,
      expenses,
      expenseType: expenseTypes[day % expenseTypes.length],
      trips,
      kmStart,
      kmEnd,
      totalKm,
      pricePerKm: totalKm ? income / totalKm : 0,
      netProfit,
      source: "demo",
      notes: "Datos demo ficticios · Vehículo Demo · Conductor Demo",
      hours
    });
  }

  return records.map(entry => normalizeEntry(entry, "demo"));
}

function normalizeEntry(entry, source = entry?.source || "existing_local") {
  const income = readNumber(entry.income, entry.INGRESOS, entry.ingresos);
  const fuel = readNumber(entry.fuel, entry.GAS, entry.combustible);
  const expenses = readNumber(entry.expenses, entry.GASTO, entry.GASTOS, entry.gasto, entry.gastos, entry.otros_gastos);
  const kmStart = readNumber(entry.kmStart, entry["KM INICIO"], entry.km_inicio);
  const kmEnd = readNumber(entry.kmEnd, entry["KM FINAL"], entry.km_final);
  const providedKm = readNumber(entry.totalKm, entry["TOTAL KM"], entry[" TOTAL KM"]);
  const totalKm = providedKm || (hasValue(kmStart) && hasValue(kmEnd) ? Math.abs(kmEnd - kmStart) : 0);
  const providedProfit = firstValue(entry.netProfit, entry.GANANCIAS, entry["GANANCIAS "], entry.ganancias);
  const netProfit = hasValue(providedProfit) ? readNumber(providedProfit) : income - fuel - expenses;
  const hours = readHours(
    fieldValue(entry, "hours", "horas", "HORAS", "HORAS TRABAJADAS", "TIEMPO", "TIEMPO TRABAJADO", "HORAS UBER", "DURACIÓN", "DURACION", "HOURS", "WORKED HOURS")
  );
  const normalizedSource = source || entry.source || "existing_local";
  return {
    fecha: normalizeDate(entry.fecha || entry.FECHA || entry.date),
    id: cleanText(entry.id),
    allowDuplicate: Boolean(entry.allowDuplicate),
    fuel,
    income,
    expenses,
    expenseType: cleanText(entry.expenseType ?? entry["TIPO GASTO"] ?? entry.tipo_gasto),
    trips: readNumber(entry.trips, entry.VIAJES, entry.viajes),
    kmStart,
    kmEnd,
    totalKm,
    pricePerKm: readNumber(entry.pricePerKm, entry["PRECIO KM"], totalKm ? income / totalKm : 0),
    netProfit,
    source: normalizedSource,
    notes: cleanText(entry.notes ?? entry.notas),
    hours
  };
}

function firstValue(...values) {
  return values.find(hasValue);
}

function fieldValue(entry, ...aliases) {
  if (!entry) return undefined;
  const normalized = Object.fromEntries(Object.entries(entry).map(([key, value]) => [cleanHeader(key), value]));
  return aliases.map(cleanHeader).map(key => normalized[key]).find(hasValue);
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "" && !Number.isNaN(value);
}

function readNumber(...values) {
  const value = firstValue(...values);
  if (!hasValue(value)) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function readHours(...values) {
  const value = firstValue(...values);
  if (!hasValue(value)) return 0;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return Math.max(0, value.getHours() + value.getMinutes() / 60);
  if (typeof value === "number") return Math.max(0, Number.isFinite(value) ? value : 0);
  const text = String(value).trim().toLowerCase().replace(",", ".");
  const timeMatch = text.match(/^(-?\d+(?:\.\d+)?):(\d{1,2})$/);
  if (timeMatch) {
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    return Math.max(0, hours + minutes / 60);
  }
  const humanMatch = text.match(/(-?\d+(?:\.\d+)?)\s*h(?:oras?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:utos?)?)?)?/);
  if (humanMatch) {
    const hours = Number(humanMatch[1]);
    const minutes = Number(humanMatch[2] || 0);
    return Math.max(0, hours + minutes / 60);
  }
  return Math.max(0, readNumber(text));
}

function cleanText(value) {
  if (!hasValue(value)) return "";
  const text = String(value).trim();
  return text.toLowerCase() === "none" ? "" : text;
}

function normalizeDate(value) {
  if (!hasValue(value)) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + value);
    return excelEpoch.toISOString().slice(0, 10);
  }
  const raw = String(value).trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const withoutDay = raw.includes(",") ? raw.split(",").slice(1).join(",").trim() : raw;
  const months = { ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2, abr: 3, abril: 3, may: 4, mayo: 4, jun: 5, junio: 5, jul: 6, julio: 6, ago: 7, agosto: 7, sep: 8, sept: 8, septiembre: 8, oct: 9, octubre: 9, nov: 10, noviembre: 10, dic: 11, diciembre: 11 };
  const parts = withoutDay.split(" ");
  if (parts.length >= 3) {
    const day = Number(parts[0]);
    const month = months[parts[1]] ?? months[parts[1]?.slice(0, 3)];
    const year = Number(parts[2]);
    if (day && month !== undefined && year) return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function km(entry) {
  return Number(entry.totalKm || 0) || (hasValue(entry.kmStart) && hasValue(entry.kmEnd) ? Math.abs(Number(entry.kmEnd) - Number(entry.kmStart)) : 0);
}

function enrich(entry) {
  const normalized = normalizeEntry(entry);
  const ingresos = Number(normalized.income || 0) + Number(entry.propinas || 0) + Number(entry.bonos || 0);
  const combustible = Number(normalized.fuel || 0);
  const otrosGastos = Number(normalized.expenses || 0) + Number(entry.comida || 0) + Number(entry.peajes || 0);
  const gastos = combustible + otrosGastos;
  const distance = km(normalized);
  const reserve = distance * Number(settings.reserveRate || 0);
  const depreciation = distance * Number(settings.depreciationRate || 0);
  const operating = hasValue(normalized.netProfit) ? Number(normalized.netProfit) : ingresos - gastos;
  const real = operating - reserve - depreciation;
  return {
    ...normalized,
    ingresos,
    income: ingresos,
    combustible,
    fuel: combustible,
    otros_gastos: otrosGastos,
    expenses: otrosGastos,
    gastos,
    viajes: Number(normalized.trips || 0),
    trips: Number(normalized.trips || 0),
    horas: Number(normalized.hours || 0),
    hours: Number(normalized.hours || 0),
    tipo_gasto: normalized.expenseType,
    notas: normalized.notes,
    km_inicio: normalized.kmStart,
    km_final: normalized.kmEnd,
    km: distance,
    totalKm: distance,
    reserve,
    depreciation,
    operating,
    netProfit: operating,
    real
  };
}

function rangeEntries(period) {
  const enriched = entries.map(enrich).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (period === "all") return enriched;
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
  const period = getSelectedPeriod();
  const data = rangeEntries(period);
  const all = entries.map(enrich);
  const total = totals(data);
  renderHero(total);
  renderKpis(total);
  renderCharts(data);
  renderGoals(all);
  renderReports(all);
  const vehicle = renderMaintenance(all);
  renderDashboardVehicle(vehicle, total);
  renderHistory();
  renderLiveResults(new FormData(document.getElementById("entryForm")));
}

function renderHero(total) {
  document.getElementById("heroNet").textContent = fmtMoney.format(total.real);
  document.getElementById("heroInsight").textContent = total.real >= 0
    ? "Tu operación está creando utilidad real después del vehículo."
    : "La operación necesita ajuste: el costo real del vehículo supera la utilidad.";
  const rows = [
    ["Ingresos", total.ingresos, "plus"],
    ["Gastos operativos", -total.gastos, "minus"],
    ["Reserva mantenimiento", -total.reserve, "minus"],
    ["Depreciación vehículo", -total.depreciation, "minus"]
  ];
  document.getElementById("heroBreakdown").innerHTML = rows.map(([label, value, tone]) => `
    <div class="breakdown-row ${tone}">
      <span>${label}</span>
      <strong>${fmtMoney.format(value)}</strong>
    </div>
  `).join("");
}

function renderKpis(total) {
  const profitPerHour = total.horas ? total.operating / total.horas : null;
  const incomePerHour = total.horas ? total.ingresos / total.horas : null;
  const costPerHour = total.horas ? (total.gastos + total.reserve + total.depreciation) / total.horas : null;
  const perKm = total.km ? total.real / total.km : 0;
  const roi = total.gastos ? (total.real / total.gastos) * 100 : 0;
  const primary = [
    ["Ganancia Real", total.real, "profit", total.real >= 0 ? "up" : "down"],
    ["Ingreso Semanal", total.ingresos, "calendar", "up"],
    ["Combustible", total.combustible, "fuel", "down"],
    ["ROI", roi, "roi", roi >= 0 ? "up" : "down", "percent"]
  ];
  const secondary = [
    ["Horas trabajadas", total.horas, "timer", "up", "hours"],
    ["Ganancia/Hora", profitPerHour, "clock", profitPerHour === null || profitPerHour >= 0 ? "up" : "down", "hourly"],
    ["Ingreso/Hora", incomePerHour, "wallet", "up", "hourly"],
    ["Costo/Hora", costPerHour, "cash", "down", "hourly"],
    ["Viajes", total.viajes, "car", "up", "num"],
    ["KM recorridos", total.km, "route", "up", "km"],
    ["Ganancia/KM", perKm, "gauge", perKm >= 0 ? "up" : "down"],
    ["Reserva", total.reserve, "wrench", "up"]
  ];
  document.getElementById("primaryKpis").innerHTML = primary.map(([label, value, icon, trend, kind]) => `
    <article class="kpi-card primary-kpi ${trend} ${icon}">
      <div class="kpi-top"><span>${label}</span><span class="kpi-icon">${iconSvg(icon)}</span></div>
      <div>
        <div class="kpi-value">${formatByKind(value, kind)}</div>
        <div class="trend ${trend}">${trend === "up" ? "▲" : "▼"} Período actual</div>
      </div>
    </article>
  `).join("");
  document.getElementById("secondaryKpis").innerHTML = secondary.map(([label, value, icon, trend, kind]) => `
    <article class="mini-kpi ${icon}">
      <span class="kpi-icon">${iconSvg(icon)}</span>
      <div><span>${label}</span><strong>${formatByKind(value, kind)}</strong></div>
    </article>
  `).join("");
}

function iconSvg(name) {
  const icons = {
    cash: "payments",
    calendar: "calendar_month",
    wallet: "account_balance_wallet",
    profit: "monitoring",
    fuel: "local_gas_station",
    route: "route",
    car: "directions_car",
    timer: "timer",
    clock: "schedule",
    gauge: "speed",
    roi: "trending_up",
    wrench: "build"
  };
  return `<span class="material-symbols-rounded">${icons[name] || icons.profit}</span>`;
}

function todayTotal(key) {
  const currentDate = localDateValue();
  return entries.map(enrich).filter(entry => entry.fecha === currentDate).reduce((sum, entry) => sum + Number(entry[key] || 0), 0);
}

function formatByKind(value, kind) {
  if (kind === "km") return `${fmtNum.format(value)} km`;
  if (kind === "num") return fmtNum.format(value);
  if (kind === "hours") return value ? `${fmtNum.format(value)} h` : "Sin horas registradas";
  if (kind === "hourly") return value === null || value === undefined ? "Sin horas registradas" : `${fmtMoney.format(value)}/h`;
  if (kind === "percent") return `${fmtNum.format(value)}%`;
  return fmtMoney.format(value);
}

function renderCharts(data) {
  document.getElementById("rangePill").textContent = getSelectedPeriodLabel();
  const labels = data.map(entry => entry.fecha.slice(5));
  const css = getComputedStyle(document.body);
  const success = css.getPropertyValue("--accent-emerald").trim();
  const danger = css.getPropertyValue("--accent-coral").trim();
  const warning = css.getPropertyValue("--accent-amber").trim();
  const muted = css.getPropertyValue("--muted").trim();
  drawChart("profitChart", {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Ganancia real", data: data.map(entry => entry.real), borderColor: success, backgroundColor: withAlpha(success, .14), tension: .45, fill: true, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: success }
      ]
    },
    options: chartOptions(muted)
  });
  drawChart("expenseChart", {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Ingresos", data: data.map(entry => entry.ingresos), backgroundColor: withAlpha(success, .78), borderRadius: 10 },
        { label: "Gastos", data: data.map(entry => entry.otros_gastos), backgroundColor: withAlpha(danger, .76), borderRadius: 10 },
        { label: "Combustible", data: data.map(entry => entry.combustible), backgroundColor: withAlpha(warning, .78), borderRadius: 10 }
      ]
    },
    options: chartOptions(muted)
  });
}

function withAlpha(hex, alpha) {
  const value = String(hex || "#2563EB").trim();
  if (!value.startsWith("#")) return value;
  const short = value.length === 4;
  const r = parseInt(short ? value[1] + value[1] : value.slice(1, 3), 16);
  const g = parseInt(short ? value[2] + value[2] : value.slice(3, 5), 16);
  const b = parseInt(short ? value[3] + value[3] : value.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  const goals = [
    ["Diaria", todayTotal("real"), settings.dailyGoal],
    ["Semanal", totals(rangeEntries("week")).real, settings.weeklyGoal],
    ["Mensual", monthTotal.real, settings.monthlyGoal],
    ["Anual", totals(all).real, settings.annualGoal]
  ];
  const html = goals.map(([name, current, goal]) => goalRing(name, current, goal)).join("");
  document.getElementById("goalsGrid").innerHTML = html;
  document.getElementById("dashboardGoalRings").innerHTML = html;
}

function goalRing(name, current, goal) {
  const value = Math.max(0, Math.min(100, Math.round((current / goal) * 100)));
  const missing = Math.max(0, goal - current);
  const projection = value >= 100 ? "Meta alcanzada" : `Proyección: ${estimateGoalProjection(name, current, goal)}`;
  const hours = goalHours(name);
  const actualHourly = hours ? current / hours : null;
  const neededHourly = hours ? goal / hours : null;
  const hourlyPace = hours
    ? `${formatByKind(actualHourly, "hourly")} · Necesario ${formatByKind(neededHourly, "hourly")}`
    : "Sin horas registradas";
  const paceState = hours ? (actualHourly >= neededHourly ? "Sobre ritmo" : "Bajo ritmo") : "Ritmo pendiente";
  const ringTone = current >= goal ? "positive" : current >= 0 ? "warning" : "negative";
  return `<article class="goal-ring-card ${ringTone}">
    <div class="fitness-ring" style="--value:${value}%"><span>${value}%</span></div>
    <div>
      <h3>${name}</h3>
      <strong>${fmtMoney.format(current)}</strong>
      <p>${projection}</p>
      <p>${hourlyPace}</p>
      <p>${paceState}</p>
      <p>Faltante ${fmtMoney.format(missing)}</p>
    </div>
  </article>`;
}

function goalHours(name) {
  if (name === "Diaria") return todayTotal("horas");
  if (name === "Semanal") return totals(rangeEntries("week")).horas;
  if (name === "Mensual") return totals(entries.map(enrich).filter(entry => entry.fecha.startsWith("2026-06"))).horas;
  return totals(entries.map(enrich)).horas;
}

function estimateGoalProjection(name, current, goal) {
  if (current >= goal) return "superada";
  const periodDays = { Diaria: 1, Semanal: 7, Mensual: 30, Anual: 365 }[name] || 30;
  const sampleDays = Math.max(1, Math.min(periodDays, entries.length));
  const dailyPace = current / sampleDays;
  if (dailyPace <= 0) return "requiere ajuste";
  return fmtMoney.format(dailyPace * periodDays);
}

function renderReports(all) {
  const vehicle = getVehicleSummary();
  const reportData = [
    ["Semanal", rangeEntries("week")],
    ["Mensual", rangeEntries("month")],
    ["Anual", all]
  ];
  document.getElementById("reportGrid").innerHTML = reportData.map(([label, data]) => {
    const total = totals(data);
    const best = [...data].sort((a, b) => b.real - a.real)[0];
    const worst = [...data].sort((a, b) => a.real - b.real)[0];
    const daysWithData = Math.max(1, new Set(data.map(entry => entry.fecha)).size);
    const averageHours = total.horas / daysWithData;
    const hourlyDays = data.filter(entry => Number(entry.horas || 0) > 0);
    const bestHourly = [...hourlyDays].sort((a, b) => hourlyProfit(b) - hourlyProfit(a))[0];
    const worstHourly = [...hourlyDays].sort((a, b) => hourlyProfit(a) - hourlyProfit(b))[0];
    return `<article class="panel report-card">
      <h3>${label}</h3>
      <div class="report-highlight ${total.real >= 0 ? "positive" : "negative"}">
        <span>Ganancia real</span>
        <strong>${fmtMoney.format(total.real)}</strong>
      </div>
      ${reportRow("Ingresos", fmtMoney.format(total.ingresos))}
      ${reportRow("Gastos", fmtMoney.format(total.gastos))}
      ${reportRow("Combustible", fmtMoney.format(total.combustible))}
      ${reportRow("Horas trabajadas", total.horas ? `${fmtNum.format(total.horas)} h` : "Sin horas registradas")}
      ${reportRow("Promedio horas/día", total.horas ? `${fmtNum.format(averageHours)} h` : "Sin horas registradas")}
      ${reportRow("Ganancia promedio/hora", formatByKind(total.horas ? total.operating / total.horas : null, "hourly"))}
      ${reportRow("KM", `${fmtNum.format(total.km)} km`)}
      ${reportRow("Viajes", fmtNum.format(total.viajes))}
      ${reportRow("Ganancia operativa", fmtMoney.format(total.operating))}
      ${reportRow("Vehículo", vehicle)}
      ${reportRow("Mejor día", best ? `${best.fecha} · ${fmtMoney.format(best.real)}` : "-")}
      ${reportRow("Peor día", worst ? `${worst.fecha} · ${fmtMoney.format(worst.real)}` : "-")}
      ${reportRow("Mejor día por hora", bestHourly ? `${bestHourly.fecha} · ${formatByKind(hourlyProfit(bestHourly), "hourly")}` : "Sin horas registradas")}
      ${reportRow("Peor día por hora", worstHourly ? `${worstHourly.fecha} · ${formatByKind(hourlyProfit(worstHourly), "hourly")}` : "Sin horas registradas")}
    </article>`;
  }).join("");
}

function reportRow(label, value) {
  return `<div class="report-row"><span>${label}</span><strong>${value}</strong></div>`;
}

function hourlyProfit(entry) {
  return Number(entry.horas || 0) ? Number(entry.operating || 0) / Number(entry.horas || 1) : 0;
}

function renderMaintenance(all) {
  const knownOdometers = all
    .flatMap(entry => [Number(entry.kmStart || entry.km_inicio || 0), Number(entry.kmEnd || entry.km_final || 0)])
    .filter(value => value > 0);
  const configuredKm = Number(settings.vehicle?.currentKm || 0);
  const currentKm = configuredKm || (knownOdometers.length ? Math.max(...knownOdometers) : 0);
  const items = maintenanceCatalog(settings.vehicle?.type).map(({ name, interval, cost }) => {
    const progress = interval ? currentKm % interval : 0;
    const remaining = interval ? Math.max(0, interval - progress) : 0;
    return { name, interval, remaining, cost };
  });
  const health = items.length ? Math.round(items.reduce((sum, item) => sum + Math.min(100, (item.remaining / Math.max(item.interval, 1)) * 100), 0) / items.length) : 0;
  const next = [...items].sort((a, b) => a.remaining - b.remaining)[0];
  const futureCost = items.filter(item => item.remaining <= 3000).reduce((sum, item) => sum + item.cost, 0);
  const critical = items.filter(item => item.remaining <= 500).length;
  const risk = critical > 1 ? "Alto" : critical === 1 ? "Medio" : "Bajo";
  const riskClass = risk.toLowerCase();
  document.getElementById("vehicleHealth").textContent = `${health}%`;
  document.getElementById("vehicleHealthBar").style.width = `${health}%`;
  document.getElementById("vehicleSystemSummary").innerHTML = `
    <div class="vehicle-summary-row"><span>Vehículo</span><strong>${escapeHtml(getVehicleSummary())}</strong></div>
    <div class="vehicle-summary-row"><span>Kilometraje actual</span><strong>${fmtNum.format(currentKm)} km</strong></div>
    <div class="vehicle-summary-row"><span>Próximo mantenimiento</span><strong>${next.name}</strong></div>
    <div class="vehicle-summary-row"><span>Riesgo mecánico</span><strong class="risk-${riskClass}">${risk}</strong></div>
    <div class="vehicle-summary-row"><span>Costos futuros</span><strong>${fmtMoney.format(futureCost)}</strong></div>
  `;
  document.getElementById("maintenanceGrid").innerHTML = items.map(item => `
    <article class="panel maintenance-card ${item.remaining <= 500 ? "critical" : item.remaining <= 1800 ? "warning" : "ok"}">
      <strong>${item.name}</strong>
      <p>${fmtNum.format(item.remaining)} km restantes</p>
      <div class="progress-bar" style="--value:${Math.max(6, Math.min(100, item.remaining / 30))}%"><span></span></div>
      <div class="profit-row"><span>Costo estimado</span><strong>${fmtMoney.format(item.cost)}</strong></div>
    </article>
  `).join("");
  return { health, next, futureCost, risk, items, currentKm };
}

function renderDashboardVehicle(vehicle, total) {
  document.getElementById("dashboardVehicleSystem").innerHTML = `
    <div class="vehicle-score">
      <div class="fitness-ring vehicle-ring" style="--value:${vehicle.health}%"><span>${vehicle.health}%</span></div>
      <div>
        <span>Salud general</span>
        <strong class="risk-${vehicle.risk.toLowerCase()}">${vehicle.risk}</strong>
        <p>Riesgo mecánico actual</p>
      </div>
    </div>
    <div class="vehicle-summary-row"><span>Fondo mantenimiento</span><strong>${fmtMoney.format(total.reserve)}</strong></div>
    <div class="vehicle-summary-row"><span>Vehículo</span><strong>${escapeHtml(getVehicleSummary())}</strong></div>
    <div class="vehicle-summary-row"><span>Próximo mantenimiento</span><strong>${vehicle.next.name}</strong></div>
    <div class="vehicle-summary-row"><span>KM restantes</span><strong>${fmtNum.format(vehicle.next.remaining)} km</strong></div>
    <div class="vehicle-summary-row"><span>Costos futuros estimados</span><strong>${fmtMoney.format(vehicle.futureCost)}</strong></div>
  `;
}

function maintenanceCatalog(type) {
  if (String(type || "").toLowerCase() === "motocicleta") {
    return [
      { name: "Aceite", interval: 3000, cost: 1200 },
      { name: "Filtro", interval: 6000, cost: 700 },
      { name: "Cadena", interval: 8000, cost: 2200 },
      { name: "Neumáticos", interval: 12000, cost: 6500 },
      { name: "Frenos", interval: 7000, cost: 1800 },
      { name: "Batería", interval: 18000, cost: 3200 },
      { name: "Suspensión", interval: 16000, cost: 4200 }
    ];
  }
  return [
    { name: "Aceite", interval: 7000, cost: 2500 },
    { name: "Filtro de aceite", interval: 7000, cost: 900 },
    { name: "Filtro de aire", interval: 10000, cost: 1800 },
    { name: "Filtro de cabina", interval: 12000, cost: 1200 },
    { name: "Frenos", interval: 18000, cost: 6500 },
    { name: "Neumáticos", interval: 35000, cost: 24000 },
    { name: "Batería", interval: 30000, cost: 7800 },
    { name: "Transmisión", interval: 50000, cost: 9000 },
    { name: "Alineación", interval: 10000, cost: 1600 },
    { name: "Balanceo", interval: 10000, cost: 1400 }
  ];
}

function getVehicleSummary() {
  const vehicle = settings.vehicle || defaultSettings.vehicle;
  const name = [vehicle.brand, vehicle.model, vehicle.year].map(cleanText).filter(Boolean).join(" ");
  return name || vehicle.type || "Vehículo";
}

function renderHistory() {
  const query = (document.getElementById("historySearch")?.value || "").trim().toLowerCase();
  const rows = rangeEntries(getSelectedPeriod())
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
      <td>${fmtMoney.format(entry.gastos)}</td>
      <td>${fmtNum.format(Number(entry.viajes || 0))}</td>
      <td>${entry.horas ? `${fmtNum.format(Number(entry.horas || 0))} h` : "Sin horas"}</td>
      <td>${fmtNum.format(entry.km)}</td>
      <td class="${entry.operating >= 0 ? "money-positive" : "money-negative"}">${fmtMoney.format(entry.operating)}</td>
      <td class="${entry.real >= 0 ? "money-positive" : "money-negative"}">${fmtMoney.format(entry.real)}</td>
    </tr>
  `).join("") : `<tr class="empty-row"><td colspan="8">No hay registros con ese filtro.</td></tr>`;
}

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" });
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setDefaultEntryDate() {
  const input = document.getElementById("entryDate");
  if (input && !input.value) input.value = localDateValue();
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
  document.querySelectorAll("#periodTabs button").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll("#periodTabs button").forEach(item => item.classList.toggle("active", item === button));
      renderAll();
    });
  });
  document.getElementById("themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("ucp_theme", document.body.classList.contains("dark") ? "dark" : "light");
    renderAll();
  });
  if (localStorage.getItem("ucp_theme") === "dark") document.body.classList.add("dark");
  document.getElementById("menuToggle").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
  document.getElementById("entryForm").addEventListener("input", event => renderLiveResults(new FormData(event.currentTarget)));
  document.getElementById("entryForm").addEventListener("submit", saveEntry);
  bindClick("topExport", () => exportCsv(entries));
  bindClick("topBackup", exportJson);
  bindClick("backupCsv", () => exportCsv(entries));
  bindClick("backupXls", exportExcel);
  bindClick("backupJson", exportJson);
  document.getElementById("importFile").addEventListener("change", importFile);
  document.getElementById("saveSettings").addEventListener("click", saveSettings);
  bindClick("saveVehicleSettings", saveSettings);
  document.getElementById("historySearch").addEventListener("input", renderHistory);
  document.getElementById("historyExport").addEventListener("click", () => exportCsv(entries));
  bindClick("loadDemoWelcome", () => loadDemoData({ skipConfirm: true }));
  bindClick("startEmptyWelcome", () => startEmptyDashboard({ skipConfirm: true }));
  bindClick("skipSetupWelcome", () => startEmptyDashboard({ skipConfirm: true, skipSetup: true }));
  bindClick("loadDemoData", () => loadDemoData());
  bindClick("resetDashboard", resetDashboard);
}

function bindClick(id, handler) {
  const element = document.getElementById(id);
  if (element) element.addEventListener("click", handler);
}

function getSelectedPeriod() {
  return document.querySelector("#periodTabs button.active")?.dataset.period || "week";
}

function getSelectedPeriodLabel() {
  return document.querySelector("#periodTabs button.active")?.textContent.trim() || "Semana";
}

function switchView(id) {
  document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === id));
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === id));
  document.getElementById("sidebar").classList.remove("open");
}

function renderLiveResults(formData) {
  const values = Object.fromEntries(formData.entries());
  const result = enrich(values);
  const profitPerHour = result.horas ? result.operating / result.horas : null;
  const incomePerHour = result.horas ? result.ingresos / result.horas : null;
  const costPerHour = result.horas ? (result.gastos + result.reserve + result.depreciation) / result.horas : null;
  const rows = [
    ["Ganancia neta", result.real],
    ["Ganancia por hora", profitPerHour, "hourly"],
    ["Ingreso por hora", incomePerHour, "hourly"],
    ["Costo por hora", costPerHour, "hourly"],
    ["Ganancia por viaje", result.viajes ? result.real / result.viajes : 0],
    ["Costo por KM", result.km ? result.gastos / result.km : 0],
    ["ROI diario", result.gastos ? (result.real / result.gastos) * 100 : 0, "percent"]
  ];
  document.getElementById("liveResults").innerHTML = rows.map(([label, value, kind]) => `<div class="profit-row"><span>${label}</span><strong>${formatLiveValue(value, kind)}</strong></div>`).join("");
}

function formatLiveValue(value, kind) {
  if (kind === "percent") return `${fmtNum.format(value)}%`;
  if (kind === "hourly") return formatByKind(value, "hourly");
  return fmtMoney.format(value);
}

function saveEntry(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const selectedDate = normalizeDate(data.fecha) || localDateValue();
  const existingIndex = entries.findIndex(entry => normalizeDate(entry.fecha) === selectedDate);
  const manualEntry = normalizeEntry({
    ...data,
    fecha: selectedDate,
    tipo_gasto: "Registro manual",
    source: "manual",
    id: `manual-${selectedDate}-${Date.now()}`,
    allowDuplicate: false
  }, "manual");
  if (manualEntry.hours > 24 && !window.confirm("Las horas trabajadas superan 24 en una sola jornada. ¿Deseas guardar el registro para revisarlo manualmente?")) {
    return;
  }
  if (existingIndex >= 0) {
    const updateExisting = window.confirm("Ya existe un registro para esta fecha. ¿Deseas actualizarlo o crear uno nuevo?\n\nAceptar: actualizarlo.\nCancelar: crear uno nuevo.");
    if (updateExisting) {
      entries[existingIndex] = { ...manualEntry, id: entries[existingIndex].id || manualEntry.id, allowDuplicate: false };
    } else {
      entries.push({ ...manualEntry, allowDuplicate: true });
    }
  } else {
    entries.push(manualEntry);
  }
  save();
  event.currentTarget.reset();
  setDefaultEntryDate();
  renderAll();
  switchView("dashboard");
}

function hydrateSettings() {
  settings = normalizeSettings(settings);
  document.getElementById("reserveRate").value = settings.reserveRate;
  document.getElementById("depreciationRate").value = settings.depreciationRate;
  document.getElementById("dailyGoalInput").value = settings.dailyGoal;
  document.getElementById("monthlyGoalInput").value = settings.monthlyGoal;
  document.getElementById("vehicleType").value = settings.vehicle.type;
  document.getElementById("vehicleBrand").value = settings.vehicle.brand;
  document.getElementById("vehicleModel").value = settings.vehicle.model;
  document.getElementById("vehicleYear").value = settings.vehicle.year;
  document.getElementById("vehicleFuel").value = settings.vehicle.fuel;
  document.getElementById("vehicleCurrentKm").value = settings.vehicle.currentKm || "";
}

function saveSettings() {
  settings = {
    ...settings,
    reserveRate: Number(document.getElementById("reserveRate").value),
    depreciationRate: Number(document.getElementById("depreciationRate").value),
    dailyGoal: Number(document.getElementById("dailyGoalInput").value),
    monthlyGoal: Number(document.getElementById("monthlyGoalInput").value),
    vehicle: readVehicleForm()
  };
  settings.weeklyGoal = settings.dailyGoal * 6;
  settings.annualGoal = settings.monthlyGoal * 12;
  save();
  renderAll();
}

function readVehicleForm() {
  return {
    type: cleanText(document.getElementById("vehicleType").value) || defaultSettings.vehicle.type,
    brand: cleanText(document.getElementById("vehicleBrand").value),
    model: cleanText(document.getElementById("vehicleModel").value),
    year: cleanText(document.getElementById("vehicleYear").value),
    fuel: cleanText(document.getElementById("vehicleFuel").value) || defaultSettings.vehicle.fuel,
    currentKm: readNumber(document.getElementById("vehicleCurrentKm").value)
  };
}

function readSetupSettings() {
  const monthlyGoal = readNumber(document.getElementById("setupMonthlyGoal")?.value);
  const nextSettings = normalizeSettings({
    ...defaultSettings,
    profileName: cleanText(document.getElementById("setupName")?.value),
    vehicle: {
      ...defaultSettings.vehicle,
      type: cleanText(document.getElementById("setupVehicleType")?.value) || defaultSettings.vehicle.type,
      brand: cleanText(document.getElementById("setupVehicleBrand")?.value),
      model: cleanText(document.getElementById("setupVehicleModel")?.value),
      year: cleanText(document.getElementById("setupVehicleYear")?.value)
    }
  });
  if (monthlyGoal > 0) {
    nextSettings.monthlyGoal = monthlyGoal;
    nextSettings.annualGoal = monthlyGoal * 12;
  }
  nextSettings.weeklyGoal = nextSettings.dailyGoal * 6;
  return nextSettings;
}

function maybeShowWelcome() {
  if (!localStorage.getItem("ucp_onboarding_choice") && !localStorage.getItem("ucp_entries")) {
    showWelcome();
  }
}

function showWelcome() {
  document.getElementById("welcomeModal")?.classList.add("open");
}

function hideWelcome() {
  document.getElementById("welcomeModal")?.classList.remove("open");
}

function loadDemoData(options = {}) {
  if (!options.skipConfirm && !confirmResetAction()) return;
  entries = mergeEntries(buildDemoEntries());
  settings = normalizeSettings(demoSettings);
  localStorage.setItem("ucp_onboarding_choice", "demo");
  save();
  hydrateSettings();
  setDefaultEntryDate();
  renderAll();
  hideWelcome();
  switchView("dashboard");
}

function startEmptyDashboard(options = {}) {
  if (!options.skipConfirm && !confirmResetAction()) return;
  entries = [];
  settings = options.skipSetup ? normalizeSettings(defaultSettings) : readSetupSettings();
  localStorage.setItem("ucp_onboarding_choice", "empty");
  save();
  hydrateSettings();
  setDefaultEntryDate();
  renderAll();
  hideWelcome();
  switchView("dashboard");
}

function resetDashboard() {
  if (!confirmResetAction()) return;
  localStorage.removeItem("ucp_entries");
  localStorage.removeItem("ucp_settings");
  localStorage.removeItem("ucp_onboarding_choice");
  entries = [];
  settings = normalizeSettings(defaultSettings);
  hydrateSettings();
  setDefaultEntryDate();
  renderAll();
  showWelcome();
  switchView("dashboard");
}

function confirmResetAction() {
  return window.confirm("¿Estás seguro?\n\nEsta acción no puede deshacerse.");
}

function exportCsv(data) {
  const rows = data.map(enrich).map(toExportRow);
  const headers = ["fecha", "fuel", "income", "expenses", "expenseType", "trips", "kmStart", "kmEnd", "totalKm", "pricePerKm", "netProfit", "source", "notes", "hours"];
  const csv = [headers.join(","), ...rows.map(row => headers.map(key => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
  download("uber-control-pro.csv", "text/csv", csv);
}

function exportJson() {
  download("uber-control-pro-backup.json", "application/json", JSON.stringify({ entries: entries.map(normalizeEntry), settings }, null, 2));
}

function exportExcel() {
  const rows = entries.map(enrich).map(toExportRow);
  const headers = ["fecha", "fuel", "income", "expenses", "expenseType", "trips", "kmStart", "kmEnd", "totalKm", "pricePerKm", "netProfit", "source", "id", "allowDuplicate", "notes", "hours"];
  const table = `<table><tr>${headers.map(key => `<th>${key}</th>`).join("")}</tr>${rows.map(row => `<tr>${headers.map(key => `<td>${row[key] ?? ""}</td>`).join("")}</tr>`).join("")}</table>`;
  download("uber-control-pro.xls", "application/vnd.ms-excel", table);
}

function toExportRow(entry) {
  return {
    fecha: entry.fecha,
    fuel: entry.fuel,
    income: entry.income,
    expenses: entry.expenses,
    expenseType: entry.expenseType,
    trips: entry.trips,
    kmStart: entry.kmStart,
    kmEnd: entry.kmEnd,
    totalKm: entry.totalKm,
    pricePerKm: entry.pricePerKm,
    netProfit: entry.netProfit,
    source: entry.source,
    id: entry.id,
    allowDuplicate: entry.allowDuplicate,
    notes: entry.notes,
    hours: entry.hours
  };
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
    const extension = file.name.split(".").pop().toLowerCase();
    if (extension === "json") {
      const text = reader.result;
      const backup = JSON.parse(text);
      const imported = (backup.entries || []).map(entry => normalizeEntry(entry));
      warnLongHourEntries(imported);
      entries = mergeEntries(entries, imported);
      settings = normalizeSettings(backup.settings || settings);
    } else if (extension === "xlsx" || extension === "xls") {
      const imported = parseWorkbook(reader.result);
      warnLongHourEntries(imported);
      entries = mergeEntries(entries, imported);
    } else {
      const imported = parseCsv(reader.result);
      warnLongHourEntries(imported);
      entries = mergeEntries(entries, imported);
    }
    save();
    hydrateSettings();
    renderAll();
    event.target.value = "";
  };
  if (file.name.match(/\.(xlsx|xls)$/i)) reader.readAsArrayBuffer(file);
  else reader.readAsText(file);
}

function warnLongHourEntries(imported) {
  const longDays = imported.filter(entry => Number(entry.hours || 0) > 24);
  if (longDays.length) {
    alert(`${longDays.length} registro${longDays.length === 1 ? "" : "s"} tienen más de 24 horas trabajadas. Se importaron para revisión manual.`);
  }
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(headerLine).map(item => item.replaceAll('"', ""));
  return lines.filter(Boolean).map(line => {
    const cells = splitCsvLine(line);
    const raw = Object.fromEntries(headers.map((key, index) => [key, (cells[index] || "").replace(/^"|"$/g, "").replaceAll('""', '"')]));
    return normalizeEntry(raw, "imported_csv");
  }).filter(entry => entry.fecha);
}

function parseWorkbook(buffer) {
  if (!window.XLSX) {
    alert("La librería de Excel no está disponible todavía. Abre la app con conexión una vez para activar importación XLSX offline.");
    return [];
  }
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  return workbook.SheetNames.flatMap(sheetName => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
    const headerIndex = rows.findIndex(row => row.map(cleanHeader).includes("FECHA"));
    if (headerIndex < 0) return [];
    const headers = rows[headerIndex].map(cleanHeader);
    return rows.slice(headerIndex + 1).map(row => {
      const raw = Object.fromEntries(headers.map((header, index) => [header, row[index]]));
      return normalizeEntry(raw, "imported_excel");
    }).filter(entry => entry.fecha);
  });
}

function cleanHeader(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
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
