import { useState, useRef, useCallback, useMemo } from "react";
import CompareView from "./CompareView";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { scoreColor, fmt, fmtPct, FIELDS } from "../utils/score";
import { getTooltipStyle } from "../utils/theme";

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
  const desc = row[FIELDS.DESCRIPCION];
  const pvp = row[FIELDS.PVP];
  const allowed = row.allowed_pct;

  const msg = buildMessage(desc, pvp, allowed);

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
  { key: FIELDS.FECHA, label: "Fecha", defaultW: 110, sortable: true, resizable: true },
  { key: FIELDS.SKU, label: "SKU", defaultW: 110, sortable: true, resizable: true },
  { key: FIELDS.DESCRIPCION, label: "Descripción", defaultW: 250, sortable: false, resizable: true },
  { key: FIELDS.PRECIO, label: "Precio", defaultW: 100, sortable: true, resizable: true },
  { key: FIELDS.PVP, label: "PVP", defaultW: 90, sortable: true, resizable: true },
  { key: FIELDS.PCT_DIF, label: "% Dif PVP", defaultW: 90, sortable: true, resizable: true },
  { key: "_allowed_pct", label: "Permitido", defaultW: 80, sortable: true, resizable: true },
  { key: "_score", label: "Score", defaultW: 70, sortable: true, resizable: true },
  { key: "_copy", label: "", defaultW: 40, sortable: false, resizable: false },
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

    drag.current = {
      key,
      startX: e.clientX,
      startW: widths[key],
    };

    const onMove = (ev) => {
      if (!drag.current) return;

      if (frame.current) cancelAnimationFrame(frame.current);

      frame.current = requestAnimationFrame(() => {
        const delta = ev.clientX - drag.current.startX;

        setWidths((prev) => ({
          ...prev,
          [drag.current.key]: Math.max(50, drag.current.startW + delta),
        }));
      });
    };

    const onUp = () => {
      drag.current = null;

      if (frame.current) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }

      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [widths]);

  return { widths, onMouseDown };
}

function useRowHeight() {
  const [rowHeight, setRowHeight] = useState(36);

  const drag = useRef(null);
  const frame = useRef(null);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();

    drag.current = {
      startY: e.clientY,
      startH: rowHeight,
    };

    const onMove = (ev) => {
      if (!drag.current) return;

      if (frame.current) cancelAnimationFrame(frame.current);

      frame.current = requestAnimationFrame(() => {
        const delta = ev.clientY - drag.current.startY;
        setRowHeight(Math.max(24, drag.current.startH + delta));
      });
    };

    const onUp = () => {
      drag.current = null;

      if (frame.current) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }

      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [rowHeight]);

  return { rowHeight, onRowResizeMouseDown: onMouseDown };
}

export default function ClientDetail({ client, onClose, pctThreshold = null, onSetFilter, dates = [], selectedDate, onDateChange, onSelectProduct }) {
  const [visibleRows, setVisibleRows] = useState(PAGE_SIZE);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [activeTab, setActiveTab] = useState("activity");
  const { widths, onMouseDown } = useColumnResize();
  const { rowHeight, onRowResizeMouseDown } = useRowHeight();

  const rows = useMemo(() => client?.rows ?? [], [client]);

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => {
      let valA, valB;
      if (sortCol === "_score") {
        valA = a.score ?? 0;
        valB = b.score ?? 0;
      } else if (sortCol === "_allowed_pct") {
        valA = a.allowed_pct ?? -1;
        valB = b.allowed_pct ?? -1;
      } else {
        valA = a[sortCol] ?? "";
        valB = b[sortCol] ?? "";
      }
      if (typeof valA === "number" && typeof valB === "number") {
        return sortDir === "asc" ? valA - valB : valB - valA;
      }
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortDir === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [rows, sortCol, sortDir]);

  const chartData = useMemo(() => {
    const dateCounts = {};
    for (const r of sortedRows) {
      const fecha = r[FIELDS.FECHA];
      const date = fecha ? String(fecha).slice(0, 10) : "Sin fecha";
      dateCounts[date] = (dateCounts[date] || 0) + 1;
    }
    return Object.entries(dateCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-20);
  }, [sortedRows]);

  const priceEvolution = useMemo(() => {
    const bySku = {};
    for (const r of rows) {
      const sku = r[FIELDS.SKU] || "Sin SKU";
      const pct = parseFloat(r.normalized_pct);
      if (!isNaN(pct)) {
        if (!bySku[sku]) bySku[sku] = [];
        bySku[sku].push({ pct, fecha: r[FIELDS.FECHA] });
      }
    }
    const result = [];
    for (const [sku, arr] of Object.entries(bySku)) {
      if (arr.length >= 2) {
        const first = Math.round(arr[0].pct);
        const last = Math.round(arr[arr.length - 1].pct);
        const diff = last - first;
        result.push({ sku, first, last, diff });
      }
    }
    return result.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [rows]);

  const shownRows = useMemo(
    () => sortedRows.slice(0, visibleRows),
    [sortedRows, visibleRows]
  );

  function handleSort(col) {
    if (!col.sortable) return;
    if (sortCol === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col.key);
      setSortDir("asc");
    }
  }

  if (!client) return null;

  const remaining = sortedRows.length - visibleRows;

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <h2>{client.name}</h2>
        <span className="detail-count">{rows.length} registros</span>
        {pctThreshold !== null && (
          <span className="detail-filter-badge">
            Desvío ≥ {pctThreshold}%
            <button className="detail-filter-clear" onClick={() => onSetFilter(null)}>✕</button>
          </span>
        )}
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="detail-tabs">
        <button className={`detail-tab ${activeTab === "activity" ? "active" : ""}`} onClick={() => setActiveTab("activity")}>
          Actividad
        </button>
        <button className={`detail-tab ${activeTab === "evolution" ? "active" : ""}`} onClick={() => setActiveTab("evolution")}>
          Evolución % PVP
        </button>
        <button className={`detail-tab ${activeTab === "compare" ? "active" : ""}`} onClick={() => setActiveTab("compare")}>
          Comparar datasets
        </button>
      </div>

      {activeTab === "activity" && (
      <div className="detail-chart">
        <h3>
          Publicaciones por día ({chartData.length} días)
        </h3>

        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />

            <Tooltip
              {...getTooltipStyle()}
              formatter={(v) => [`${v} publicaciones`, "Cantidad"]}
            />

            <Bar dataKey="count" radius={[3, 3, 0, 0]} fill="#6366f1" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      )}

      {activeTab === "evolution" && priceEvolution.length > 0 && (
        <div className="detail-chart">
          <h3>Evolución de % PVP (primer vs último registro por SKU)</h3>
          <table className="detail-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Primero</th>
                <th>Último</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {priceEvolution.slice(0, 15).map((e, i) => (
                <tr key={i}>
                  <td
                    className="clickable-cell"
                    onClick={() => onSelectProduct && onSelectProduct(e.sku)}
                    title="Ver producto"
                  >
                    {e.sku}
                  </td>
                  <td>{e.first != null ? Math.round(e.first) : "—"}%</td>
                  <td>{e.last != null ? Math.round(e.last) : "—"}%</td>
                  <td style={{ color: e.diff > 0 ? "#22c55e" : e.diff < 0 ? "#ef4444" : "inherit", fontWeight: "bold" }}>
                    {e.diff > 0 ? "+" : ""}{Math.round(e.diff)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "compare" && (
        <CompareView
          client={client.name}
          onSelectItem={(sku) => onSelectProduct && onSelectProduct(sku)}
        />
      )}

      {activeTab === "activity" && (

      <div className="detail-toolbar">
        <div className="detail-deviation-filters">
          <span className="deviation-filter-label">Desvío:</span>
          <button className={`deviation-btn ${pctThreshold === null ? "active" : ""}`} onClick={() => onSetFilter(null)}>Todos</button>
          <button className={`deviation-btn deviation-btn-orange ${pctThreshold === 15 ? "active" : ""}`} onClick={() => onSetFilter(15)}>≥ 15%</button>
          <button className={`deviation-btn deviation-btn-red ${pctThreshold === 40 ? "active" : ""}`} onClick={() => onSetFilter(40)}>≥ 40%</button>
        </div>
        <div className="sort-indicator">
          {sortCol && (
            <span className="sort-info">
              Ordenado: {COLUMNS.find((c) => c.key === sortCol)?.label} ({sortDir === "asc" ? "↑" : "↓"})
            </span>
          )}
        </div>
      </div>
      )}

      {activeTab !== "compare" && <>
      <div className="detail-table-wrap">
        <table
          className="detail-table"
          style={{ tableLayout: "auto", width: "100%" }}
        >
          <colgroup>
            {COLUMNS.map((c) => (
              <col key={c.key} style={{ minWidth: widths[c.key] }} />
            ))}
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
                  {c.resizable && (
                    <span
                      className="col-resize-handle"
                      onMouseDown={(e) => { e.stopPropagation(); onMouseDown(c.key, e); }}
                    />
                  )}
                </th>
              ))}
            </tr>
            <tr className="row-resize-handle-row">
              <td
                colSpan={COLUMNS.length}
                className="row-resize-handle"
                onMouseDown={onRowResizeMouseDown}
              />
            </tr>
          </thead>

          <tbody>
            {shownRows.map((r, i) => (
              <tr key={i} style={{ height: rowHeight }}>
                <td>{fmt(r[FIELDS.FECHA])}</td>
                <td
                  className="clickable-cell"
                  onClick={() => onSelectProduct && onSelectProduct(r[FIELDS.SKU])}
                  title="Ver producto"
                >
                  {fmt(r[FIELDS.SKU])}
                </td>

                <td style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {fmt(r[FIELDS.DESCRIPCION])}
                </td>

                <td>{fmt(r[FIELDS.PRECIO])}</td>
                <td>{fmt(r[FIELDS.PVP])}</td>
                <td>{fmtPct(r, FIELDS.PCT_DIF)}</td>

                <td style={{ color: "var(--text-muted)" }}>
                  {r.allowed_pct != null ? `${r.allowed_pct}%` : "15%"}
                </td>

                <td>
                  <span
                    className="score-badge"
                    style={{ background: scoreColor(r.score) }}
                  >
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
        <button
          className="load-more-btn"
          onClick={() => setVisibleRows((v) => v + PAGE_SIZE)}
        >
          Cargar {Math.min(remaining, PAGE_SIZE)} más ({remaining} restantes)
        </button>
      )}
      </>}
    </div>
  );
}
