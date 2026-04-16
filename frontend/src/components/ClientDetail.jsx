import { useState, useRef, useCallback, useMemo } from "react";
import DateDropdown from "./DateDropdown";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell,
} from "recharts";
import { scoreColor, fmt, fmtPct, FIELDS } from "../utils/score";

const PAGE_SIZE = 50;

const COLUMNS = [
  { key: FIELDS.FECHA, label: "Fecha", defaultW: 110, sortable: true },
  { key: FIELDS.SKU, label: "SKU", defaultW: 110, sortable: true },
  { key: FIELDS.DESCRIPCION, label: "Descripción", defaultW: 240, sortable: false },
  { key: FIELDS.PRECIO, label: "Precio", defaultW: 110, sortable: true },
  { key: FIELDS.PVP, label: "PVP", defaultW: 100, sortable: true },
  { key: FIELDS.PCT_DIF, label: "% Dif PVP", defaultW: 100, sortable: true },
  { key: "_score", label: "Score", defaultW: 72, sortable: true },
];

const TOOLTIP_STYLE = {
  contentStyle: { background: "#1e1e2e", border: "1px solid #444", color: "#e0e0f0" },
  labelStyle: { color: "#e0e0f0" },
  itemStyle: { color: "#e0e0f0" },
};

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
          [drag.current.key]: Math.max(30, drag.current.startW + delta),
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

export default function ClientDetail({ client, onClose, pctThreshold = null, onSetFilter, dates = [], selectedDate, onDateChange }) {
  const [visibleRows, setVisibleRows] = useState(PAGE_SIZE);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
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

  const chartData = useMemo(() =>
    sortedRows.slice(-60).map((r, i) => ({
      name: r[FIELDS.FECHA]
        ? String(r[FIELDS.FECHA]).slice(0, 10)
        : `#${i + 1}`,
      score: r.score ?? 0,
      sku: r[FIELDS.SKU] ?? "",
    })),
  [sortedRows]);

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
      <DateDropdown dates={dates} selected={selectedDate} onChange={onDateChange} />

      <div className="detail-chart">
        <h3>
          Score por operación {rows.length > 60 ? "(últimas 60)" : ""}
        </h3>

        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />

            <Tooltip
              {...TOOLTIP_STYLE}
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              formatter={(v, _, p) => [`Score: ${v}`, p.payload.sku || "SKU"]}
            />

            <Bar dataKey="score" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={scoreColor(entry.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

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

      <div className="detail-table-wrap" onMouseDown={onRowResizeMouseDown}>
        <table
          className="detail-table"
          style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}
        >
          <colgroup>
            {COLUMNS.map((c) => (
              <col key={c.key} style={{ width: widths[c.key] }} />
            ))}
          </colgroup>

          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={c.sortable ? "sortable" : ""}
                  onClick={() => handleSort(c)}
                >
                  {c.label}
                  {sortCol === c.key && (
                    <span className="sort-arrow">{sortDir === "asc" ? " ↑" : " ↓"}</span>
                  )}
                  <span
                    className="col-resize-handle"
                    onMouseDown={(e) => { e.stopPropagation(); onMouseDown(c.key, e); }}
                  />
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
                <td>{fmt(r[FIELDS.SKU])}</td>

                <td style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {fmt(r[FIELDS.DESCRIPCION])}
                </td>

                <td>{fmt(r[FIELDS.PRECIO])}</td>
                <td>{fmt(r[FIELDS.PVP])}</td>
                <td>{fmtPct(r[FIELDS.PCT_DIF])}</td>

                <td>
                  <span
                    className="score-badge"
                    style={{ background: scoreColor(r.score) }}
                  >
                    {r.score ?? "—"}
                  </span>
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
    </div>
  );
}
