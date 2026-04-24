import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { FIELDS, scoreColor, fmt, fmtPct } from "../utils/score";
import { useDashboard } from "../context/DashboardContext";
import CompareView from "./CompareView";
import { getTooltipStyle } from "../utils/theme";
import DateRangePicker from "./DateRangePicker";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell,
} from "recharts";

const PAGE_SIZE = 50;

function buildMessage(descripcion, pvp, allowedPct) {
  const pct = allowedPct ?? 15;
  const desc = descripcion || "el producto";
  const pvpNum = parseFloat(pvp);
  const calculated = !isNaN(pvpNum) ? Math.round(pvpNum * (1 - pct / 100)) : "—";
  return `Buenas días! Como están? Les envío esta publicación por ${desc}. Les pido si me ayudan subiéndolo a partir de ${calculated}`;
}

function CopyButton({ row }) {
  const [copied, setCopied] = useState(false);
  const msg = buildMessage(row[FIELDS.DESCRIPCION], row[FIELDS.PVP], row.allowed_pct);

  const handleCopy = async (e) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(msg);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button className="copy-msg-btn" onClick={handleCopy} title="Copiar mensaje">
      {copied ? "✓" : "📋"}
    </button>
  );
}

const COLUMNS = [
  { key: FIELDS.FECHA, label: "Fecha", defaultW: 110, sortable: true },
  { key: FIELDS.RAZON_SOCIAL, label: "Cliente", defaultW: 200, sortable: true },
  { key: FIELDS.PRECIO, label: "Precio", defaultW: 100, sortable: true },
  { key: FIELDS.PVP, label: "PVP", defaultW: 90, sortable: true },
  { key: FIELDS.PCT_DIF, label: "% Dif PVP", defaultW: 90, sortable: true },
  { key: "_allowed_pct", label: "Permitido", defaultW: 80, sortable: true },
  { key: "_score", label: "Score", defaultW: 70, sortable: true },
  { key: "_copy", label: "", defaultW: 40, sortable: false },
];


function useColumnResize() {
  const [widths, setWidths] = useState(
    () => Object.fromEntries(COLUMNS.map((c) => [c.key, c.defaultW]))
  );
  const drag = useRef(null);
  const frame = useRef(null);

  const onMouseDown = useCallback((key, e) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { key, startX: e.clientX, startW: widths[key] };

    const onMove = (ev) => {
      if (!drag.current) return;
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const delta = ev.clientX - drag.current.startX;
        setWidths((prev) => ({
          ...prev,
          [drag.current.key]: Math.max(30, drag.current.startW + delta),
        }));
      });
    };
    const onUp = () => {
      drag.current = null;
      if (frame.current) { cancelAnimationFrame(frame.current); frame.current = null; }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [widths]);

  return { widths, onMouseDown };
}

export default function ProductDetail({ sku, rows: allRows, dates = [], onClose, onSelectClient }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [tab, setTab] = useState("rows");
  const [evoFrom, setEvoFrom] = useState("");
  const [evoTo, setEvoTo] = useState("");
  const [allSkuRows, setAllSkuRows] = useState(null);
  const { widths, onMouseDown } = useColumnResize();
  const { activeDatasetId } = useDashboard();

  useEffect(() => { setAllSkuRows(null); }, [sku, activeDatasetId]);

  useEffect(() => {
    if (tab !== "evolution") return;
    if (allSkuRows !== null) return;
    const params = new URLSearchParams({ all_dates: "true" });
    if (activeDatasetId != null) params.set("dataset_id", activeDatasetId);
    fetch(`/data?${params}`)
      .then((r) => r.json())
      .then((data) => {
        const skuRows = (data.rows ?? []).filter((r) => r[FIELDS.SKU] === sku);
        setAllSkuRows(skuRows);
      })
      .catch(() => setAllSkuRows([]));
  }, [tab, sku, activeDatasetId]);

  const rows = useMemo(
    () => allRows.filter((r) => r[FIELDS.SKU] === sku),
    [allRows, sku]
  );

  const evoRows = allSkuRows ?? rows;

  const description = rows[0]?.[FIELDS.DESCRIPCION] ?? "";
  const allowedPct = rows[0]?.allowed_pct ?? null;

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => {
      let valA, valB;
      if (sortCol === "_score") {
        valA = Number(a.score ?? 0); valB = Number(b.score ?? 0);
      } else if (sortCol === "_allowed_pct") {
        valA = a.allowed_pct ?? -1; valB = b.allowed_pct ?? -1;
      } else {
        valA = a[sortCol] ?? ""; valB = b[sortCol] ?? "";
      }
      if (typeof valA === "number" && typeof valB === "number") {
        return sortDir === "asc" ? valA - valB : valB - valA;
      }
      return sortDir === "asc"
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [rows, sortCol, sortDir]);

  const scoreChartData = useMemo(() =>
    sortedRows.slice(-60).map((r, i) => ({
      name: r[FIELDS.FECHA] ? String(r[FIELDS.FECHA]).slice(0, 10) : `#${i + 1}`,
      score: Number(r.score ?? 0),
      client: r[FIELDS.RAZON_SOCIAL] ?? "",
    })),
  [sortedRows]);

  const evolutionData = useMemo(() => {
    const byClient = {};
    const filtered = evoRows.filter((r) => {
      const f = String(r[FIELDS.FECHA] ?? "").slice(0, 10);
      if (!f) return false;
      if (evoFrom && f < evoFrom) return false;
      if (evoTo && f > evoTo) return false;
      return true;
    });

    for (const r of filtered) {
      const client = r[FIELDS.RAZON_SOCIAL] || "Sin nombre";
      const pct = parseFloat(r.normalized_pct ?? r[FIELDS.PCT_DIF]);
      const fecha = r[FIELDS.FECHA];
      if (!isNaN(pct)) {
        if (!byClient[client]) byClient[client] = [];
        byClient[client].push({ pct, fecha });
      }
    }

    return Object.entries(byClient)
      .filter(([, arr]) => (evoFrom || evoTo) ? arr.length >= 1 : arr.length >= 2)
      .map(([client, arr]) => {
        const sorted = [...arr].sort((a, b) => a.fecha.localeCompare(b.fecha));
        const firstEntry = sorted[0];
        const lastEntry = sorted[sorted.length - 1];
        const first = Math.round(firstEntry.pct);
        const last = Math.round(lastEntry.pct);
        const diff = last - first;
        return { client, first, last, diff, firstDate: firstEntry.fecha, lastDate: lastEntry.fecha };
      })
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [evoRows, evoFrom, evoTo]);

  const availableDates = useMemo(() => {
    const dates = rows.map((r) => r[FIELDS.FECHA]).filter(Boolean);
    return [...new Set(dates)].sort();
  }, [rows]);

  const avgScore = useMemo(() => {
    const valid = rows.map((r) => Number(r.score)).filter((s) => s > 0);
    return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
  }, [rows]);

  function handleSort(col) {
    if (!col.sortable) return;
    if (sortCol === col.key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col.key); setSortDir("asc"); }
  }

  const shownRows = sortedRows.slice(0, visible);
  const remaining = sortedRows.length - visible;

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <h2>{sku}</h2>
          {description && (
            <span className="detail-count" style={{ fontSize: 13 }}>{description}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 8 }}>
          <span className="detail-count">{rows.length} registros</span>
          <span
            className="score-badge"
            style={{ background: scoreColor(avgScore) }}
            title="Score promedio"
          >
            {avgScore}
          </span>
          {allowedPct != null && (
            <span className="product-threshold-tag product-threshold-tag--lg">
              max {allowedPct}%
            </span>
          )}
        </div>
        <button className="close-btn" style={{ marginLeft: "auto" }} onClick={onClose}>✕</button>
      </div>

      <div style={{ display: "flex", gap: 8, padding: "8px 16px 0" }}>
        <button
          className={`detail-tab ${tab === "rows" ? "active" : ""}`}
          onClick={() => setTab("rows")}
        >
          Publicaciones
        </button>
        <button
          className={`detail-tab ${tab === "evolution" ? "active" : ""}`}
          onClick={() => setTab("evolution")}
        >
          Evolución % PVP
        </button>
        <button
          className={`detail-tab ${tab === "compare" ? "active" : ""}`}
          onClick={() => setTab("compare")}
        >
          Comparar datasets
        </button>
      </div>

      {tab === "rows" && (
        <>
          {scoreChartData.length > 0 && (
            <div className="detail-chart">
              <h3>Score por operación {rows.length > 60 ? "(últimas 60)" : ""}</h3>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={scoreChartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                  <Tooltip
                    {...getTooltipStyle()}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    formatter={(v, _, p) => [`Score: ${v}`, p.payload.client || "Cliente"]}
                  />
                  <Bar dataKey="score" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    {scoreChartData.map((entry, i) => (
                      <Cell key={i} fill={scoreColor(entry.score)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="detail-table-wrap">
            <table
              className="detail-table"
              style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}
            >
              <colgroup>
                {COLUMNS.map((c) => <col key={c.key} style={{ width: widths[c.key] }} />)}
              </colgroup>
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className={c.sortable ? "sortable" : ""}
                      onClick={() => c.sortable && handleSort(c)}
                    >
                      {c.label}
                      {sortCol === c.key && c.sortable && (
                        <span className="sort-arrow">{sortDir === "asc" ? " ↑" : " ↓"}</span>
                      )}
                      {c.sortable && (
                        <span
                          className="col-resize-handle"
                          onMouseDown={(e) => { e.stopPropagation(); onMouseDown(c.key, e); }}
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownRows.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length} style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                      No hay datos para el día seleccionado
                    </td>
                  </tr>
                )}
                {shownRows.map((r, i) => (
                  <tr key={i}>
                    <td>{fmt(r[FIELDS.FECHA])}</td>
                    <td
                      className="clickable-cell"
                      onClick={() => onSelectClient && onSelectClient(r[FIELDS.RAZON_SOCIAL])}
                      title="Ver cliente"
                    >
                      {fmt(r[FIELDS.RAZON_SOCIAL])}
                    </td>
                    <td>{fmt(r[FIELDS.PRECIO])}</td>
                    <td>{fmt(r[FIELDS.PVP])}</td>
                    <td>{fmtPct(r, FIELDS.PCT_DIF)}</td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {r.allowed_pct != null ? `${r.allowed_pct}%` : "15%"}
                    </td>
                    <td>
                      <span className="score-badge" style={{ background: scoreColor(r.score) }}>
                        {r.score ?? "—"}
                      </span>
                    </td>
                    <td>
                      <CopyButton row={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {remaining > 0 && (
            <button className="load-more-btn" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
              Cargar {Math.min(remaining, PAGE_SIZE)} más ({remaining} restantes)
            </button>
          )}
        </>
      )}

      {tab === "evolution" && (
        <div style={{ padding: "16px" }}>
          <div className="evo-header">
            <h3>Evolución % PVP</h3>
            {dates.length > 0 && (
              <DateRangePicker
                dates={dates}
                from={evoFrom}
                to={evoTo}
                onFromChange={setEvoFrom}
                onToChange={setEvoTo}
              />
            )}
          </div>
          {evolutionData.length > 0 ? (
            <table className="detail-table" style={{ tableLayout: "auto", width: "100%" }}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Primero</th>
                  <th>Último</th>
                  <th>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {evolutionData.map((e, i) => (
                  <tr key={i}>
                    <td
                      className="clickable-cell"
                      onClick={() => onSelectClient && onSelectClient(e.client)}
                      title="Ver cliente"
                    >
                      {e.client}
                    </td>
                    <td>
                      <span>{e.first}%</span>
                      <span style={{ display: "block", fontSize: 10, color: "var(--text-muted)" }}>{e.firstDate}</span>
                    </td>
                    <td>
                      <span>{e.last}%</span>
                      <span style={{ display: "block", fontSize: 10, color: "var(--text-muted)" }}>{e.lastDate}</span>
                    </td>
                    <td style={{ color: e.diff > 0 ? "#22c55e" : e.diff < 0 ? "#ef4444" : "inherit", fontWeight: "bold" }}>
                      {e.diff > 0 ? "+" : ""}{e.diff}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="evo-empty">
              <p>No hay datos para el rango seleccionado</p>
              <span>Probá ampliando el rango de fechas</span>
            </div>
          )}
        </div>
      )}

      {tab === "compare" && (
        <CompareView
          sku={sku}
          onSelectItem={(clientName) => onSelectClient && onSelectClient(clientName)}
        />
      )}
    </div>
  );
}
