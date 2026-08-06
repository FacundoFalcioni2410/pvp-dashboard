export const UNKNOWN = "Sin nombre";

export const FIELDS = {
  RAZON_SOCIAL: "RAZON SOCIAL",
  USUARIO_ML: "USUARIO ML",
  PCT_DIF: "% Dif con PVP",
  FECHA: "FECHA",
  TIPO_DE_CLIENTE: "TIPO DE CLIENTE",
  SKU: "SKU",
  DESCRIPCION: "DESCRIPCION",
  PRECIO: "Precio",
  PVP: "PVP",
  CANAL: "CANAL",
  ROT: "ROT",
};

// Number of distinct score levels for a given band configuration:
// 1 compliant level + 1 level per band + 1 catch-all level beyond the last band.
export function maxScoreFor(bands) {
  return (bands?.length ?? 6) + 2;
}

// Gradient from red (lowest score) to green (highest score), scaled to
// however many levels are currently configured.
export function scoreColor(score, maxScore = 8) {
  const s = Number(score) || 0;
  const max = Math.max(2, Number(maxScore) || 8);
  const t = Math.max(0, Math.min(1, (s - 1) / (max - 1)));
  const hue = t * 120;
  return `hsl(${hue}, 72%, 42%)`;
}

// Quartile-style buckets over whatever score range is currently configured
// (1..maxScore), used for the "Crítico/Regular/Bueno/Óptimo" filter buttons.
export function buildScoreFilters(maxScore) {
  const labels = ["Crítico", "Regular", "Bueno", "Óptimo"];
  const colorKeys = ["red", "orange", "yellow", "green"];
  const n = Math.min(4, Math.max(1, maxScore));
  const filters = [{ label: "Todos", value: "all" }];
  for (let i = 0; i < n; i++) {
    const min = Math.floor((i * maxScore) / n) + 1;
    const max = i === n - 1 ? maxScore : Math.floor(((i + 1) * maxScore) / n);
    filters.push({ label: labels[i] ?? `Nivel ${i + 1}`, value: colorKeys[i] ?? `lvl${i}`, min, max });
  }
  return filters;
}

export function fmtPct(row, field) {
  const val = row?.normalized_pct ?? row?.[field];
  if (val == null) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return `${Math.sign(n) * Math.round(Math.abs(n))}%`;
}

export function fmt(val) {
  if (val == null) return "—";
  if (typeof val === "number") return val.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const s = String(val).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return s;
}

export function aggregateClients(rows) {
  const map = {};
  for (const row of rows) {
    if (row[FIELDS.TIPO_DE_CLIENTE] === "CONTRABANDO") continue; // skip contraband for client aggregation
    const key = row[FIELDS.RAZON_SOCIAL] ?? UNKNOWN;
    const usuario = row[FIELDS.USUARIO_ML] ?? "";
    if (!map[key]) map[key] = { name: key, scores: [], usuario };
    if (row.score != null) map[key].scores.push(row.score);
  }
  return Object.values(map).map((c) => ({
    ...c,
    avgScore:
      c.scores.length > 0
        ? Math.round(c.scores.reduce((a, b) => a + b, 0) / c.scores.length)
        : 0,
  }));
}
