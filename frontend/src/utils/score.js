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
};

export function scoreColor(score) {
  if (score >= 8) return "#22c55e";
  if (score >= 6) return "#eab308";
  if (score >= 4) return "#f97316";
  return "#ef4444";
}

export function scoreClass(score) {
  if (score >= 8) return "score-green";
  if (score >= 6) return "score-yellow";
  if (score >= 4) return "score-orange";
  return "score-red";
}

export function scoreLabel(score) {
  if (score >= 8) return "Óptimo (0-5%)";
  if (score >= 6) return "Bueno (5-15%)";
  if (score >= 4) return "Regular (15-85%)";
  return "Crítico (>85%)";
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
