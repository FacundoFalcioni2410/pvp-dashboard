import { useState, useMemo, memo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Cell, LabelList, PieChart, Pie, Legend,
} from "recharts";
import GridLayout, { WidthProvider } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { scoreColor } from "../utils/score";
import { getTooltipStyle } from "../utils/theme";

const Grid = WidthProvider(GridLayout);

const CHART_PAGE = 15;

const PIE_COLORS_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const PIE_COLORS_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

function getPieColors() {
  const light = document.documentElement.getAttribute("data-theme") === "light";
  return light ? PIE_COLORS_LIGHT : PIE_COLORS_DARK;
}

function CollapsibleChart({ title, children, defaultOpen = true, className = "", draggable = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`chart-card ${className}`}>
      <div className="chart-header">
        <div className="chart-header-title">
          {draggable && <span className="drag-handle" title="Arrastrar para mover">⠿</span>}
          <h3>{title}</h3>
        </div>
        <button className="collapse-btn" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? "▼" : "▶"}
        </button>
      </div>
      {isOpen && <div className="chart-body">{children}</div>}
    </div>
  );
}

const SummaryStats = memo(function SummaryStats({ monthlySummary }) {
  const stats = monthlySummary;

  if (!stats || !stats.skuCount) return null;

  return (
    <div className="summary-stats">
      <div className="stat-box">
        <span className="stat-value">{stats.skuCount?.toLocaleString()}</span>
        <span className="stat-label">SKUs</span>
      </div>
      <div className="stat-box">
        <span className="stat-value" style={{ color: stats.avgDeviation > 20 ? "#ef4444" : stats.avgDeviation > 10 ? "#f97316" : "#eab308" }}>
          {stats.avgDeviation}%
        </span>
        <span className="stat-label">Desvío Promedio (mes)</span>
      </div>
      <div className="stat-box">
        <span className="stat-value">{stats.totalPubs?.toLocaleString()}</span>
        <span className="stat-label">Publicaciones (mes)</span>
      </div>
    </div>
  );
});

const StackedBarChart = memo(function StackedBarChart({ rows }) {
  const data = useMemo(() => {
    const result = Array.from({ length: 10 }, (_, i) => ({
      name: 10 - i,
      count: 0,
    }));

    for (const row of rows) {
      const score = row.score || 0;
      const idx = 10 - score;

      if (idx >= 0 && idx < 10) {
        result[idx].count++;
      }
    }

    return result;
  }, [rows]);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 40, left: 40, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={30} />
        <Tooltip
          {...getTooltipStyle()}
          formatter={(value) => [`${value} publicaciones`, "Cantidad"]}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="#6366f1" />
      </BarChart>
    </ResponsiveContainer>
  );
});

const BarPanel = memo(function BarPanel({ data, allDatesData, onSelect }) {
  const [view, setView] = useState("day");
  const [page, setPage] = useState(0);

  const raw = view === "day" ? data : allDatesData;
  const allSorted = useMemo(() =>
    [...raw].map((c) => ({
      ...c,
      displayName: c.name.length > 18 ? c.name.slice(0, 16) + "…" : c.name,
      fullName: c.name,
    })).sort((a, b) => a.avgScore - b.avgScore),
    [raw]
  );
  const totalPages = Math.ceil(allSorted.length / CHART_PAGE);
  const pageData = useMemo(
    () => allSorted.slice(page * CHART_PAGE, (page + 1) * CHART_PAGE),
    [allSorted, page]
  );

  return (
    <>
      <div className="chart-sort-btns">
        <button className={`chart-sort-btn ${view === "day" ? "active" : ""}`} onClick={() => { setView("day"); setPage(0); }}>Por día</button>
        <button className={`chart-sort-btn ${view === "month" ? "active" : ""}`} onClick={() => { setView("month"); setPage(0); }}>Por mes</button>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
        {view === "day" ? "Mostrando datos del día seleccionado" : "Mostrando datos de todas las fechas del dataset"}
      </p>
      {totalPages > 1 && (
        <div className="chart-pager">
          <button className="pager-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
          <span>{page + 1} / {totalPages}</span>
          <button className="pager-btn" disabled={page === totalPages - 1} onClick={() => setPage((p) => p + 1)}>›</button>
        </div>
      )}
      <div className="chart-flex-fill">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={pageData} layout="vertical" margin={{ top: 4, right: 36, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
            <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="displayName" width={140} tick={{ fontSize: 11 }} />
            <Tooltip
              {...getTooltipStyle()}
              formatter={(v, name, payload) => [`Score: ${v}`, payload[0]?.payload?.fullName || payload[0]?.payload?.name || ""]}
            />
            <Bar dataKey="avgScore" radius={[0, 4, 4, 0]} isAnimationActive={false} onClick={(d) => onSelect?.(d)}>
              {pageData.map((entry, i) => (
                <Cell key={i} fill={scoreColor(entry.avgScore)} />
              ))}
              <LabelList dataKey="avgScore" position="insideRight" style={{ fill: "#fff", fontSize: 11, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
});

const InfractionPanel = memo(function InfractionPanel({ data, onSelect, threshold }) {
  const sorted = useMemo(() =>
    [...data].sort((a, b) => b.count - a.count),
    [data]
  );
  const maxCount = useMemo(() => Math.max(...data.map((d) => d.count), 1), [data]);
  return (
    <div className="chart-flex-fill">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
          <XAxis
            type="number"
            domain={[0, maxCount]}
            tick={{ fontSize: 11 }}
          />
          <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
          <Tooltip
            {...getTooltipStyle()}
            content={({ payload, label }) => {
              if (!payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div style={getTooltipStyle().contentStyle}>
                  <p style={{ marginBottom: 4, fontWeight: 600 }}>{d.fullName || label}</p>
                  <p>% Infracción (≥{threshold}%): {d.pctInfraccion}%</p>
                  <p>Publicaciones en infracción: {d.count} / {d.total}</p>
                </div>
              );
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false} onClick={(d) => onSelect?.(d, threshold)} cursor="pointer">
            {sorted.map((entry, i) => (
              <Cell key={i} fill={entry.pctInfraccion >= 50 ? "#ef4444" : entry.pctInfraccion >= 30 ? "#f97316" : "#eab308"} />
            ))}
            <LabelList dataKey="count" position="insideRight"
              style={{ fill: "#fff", fontSize: 11, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

const DeviationPanel = memo(function DeviationPanel({ data, allDatesData, onSelect, threshold }) {
  const [view, setView] = useState("day");

  const currentData = view === "day" ? data : allDatesData;

  return (
    <>
      <div className="chart-sort-btns">
        <button className={`chart-sort-btn ${view === "day" ? "active" : ""}`} onClick={() => setView("day")}>Por día</button>
        <button className={`chart-sort-btn ${view === "month" ? "active" : ""}`} onClick={() => setView("month")}>Por mes</button>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
        {view === "day" ? "Mostrando datos del día seleccionado" : "Mostrando datos de todas las fechas del dataset"}
      </p>
      <InfractionPanel data={currentData} onSelect={onSelect} threshold={threshold} />
    </>
  );
});



const RotChart = memo(function RotChart({ data }) {
  const [metric, setMetric] = useState("avgScore");
  const byScore = metric === "avgScore";
  const maxVal = useMemo(() => Math.max(...data.map((d) => d[metric]), 1), [data, metric]);

  return (
    <>
      <div className="chart-sort-btns">
        <button className={`chart-sort-btn ${byScore ? "active" : ""}`} onClick={() => setMetric("avgScore")}>Score promedio</button>
        <button className={`chart-sort-btn ${!byScore ? "active" : ""}`} onClick={() => setMetric("pctInfraccion")}>% desvío</button>
      </div>
      <div className="chart-flex-fill">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
            <XAxis type="number" domain={[0, byScore ? 10 : maxVal]} tick={{ fontSize: 11 }}
              tickFormatter={byScore ? undefined : (v) => `${v}%`} />
            <YAxis type="category" dataKey="name" width={36} tick={{ fontSize: 13, fontWeight: 600 }} />
            <Tooltip
              {...getTooltipStyle()}
              content={({ payload }) => {
                if (!payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={getTooltipStyle().contentStyle}>
                    <p style={{ marginBottom: 4, fontWeight: 700 }}>Rotación {d.rot}</p>
                    <p>Score promedio: {d.avgScore}</p>
                    <p>% desvío: {d.pctInfraccion}%</p>
                    <p>Publicaciones: {d.total}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey={metric} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {data.map((entry, i) => (
                <Cell key={i} fill={byScore ? scoreColor(entry.avgScore) : (entry.pctInfraccion >= 50 ? "#ef4444" : entry.pctInfraccion >= 25 ? "#f97316" : "#eab308")} />
              ))}
              <LabelList dataKey={metric} position="insideRight"
                style={{ fill: "#fff", fontSize: 12, fontWeight: 700 }}
                formatter={byScore ? undefined : (v) => `${v}%`} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
});

const TopRotosPie = memo(function TopRotosPie({ data, onSelectSku }) {
  const top5 = useMemo(
    () => [...data].sort((a, b) => b.count - a.count).slice(0, 5),
    [data]
  );
  const colors = getPieColors();
  const total = useMemo(() => top5.reduce((s, d) => s + d.count, 0), [top5]);

  return (
    <div className="chart-flex-fill">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={top5}
            dataKey="count"
            nameKey="sku"
            cx="50%"
            cy="46%"
            outerRadius="70%"
            isAnimationActive={false}
            onClick={(d) => onSelectSku?.(d.sku)}
            cursor="pointer"
            label={({ count }) => (total ? `${Math.round((100 * count) / total)}%` : "")}
            labelLine={false}
          >
            {top5.map((entry, i) => (
              <Cell key={entry.sku} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            {...getTooltipStyle()}
            content={({ payload }) => {
              if (!payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div style={getTooltipStyle().contentStyle}>
                  <p style={{ marginBottom: 4, fontWeight: 600 }}>{d.sku}</p>
                  {d.descripcion && <p style={{ marginBottom: 4, color: "#aaa", fontSize: 11 }}>{d.descripcion}</p>}
                  <p>Publicaciones en infracción: {d.count} / {d.total}</p>
                </div>
              );
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={48}
            iconType="circle"
            formatter={(_, entry) => entry.payload.sku}
            wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
});

const CHART_LAYOUT_KEY = "pvp-dashboard:chart-layout";
const GRID_COLS = 12;
const ROW_HEIGHT = 30;
const GRID_MARGIN = 16;

const DEFAULT_CHART_LAYOUT = {
  clientScore: { x: 0, y: 0, w: 6, h: 11 },
  topRotos: { x: 6, y: 0, w: 6, h: 11 },
  infractionAccounts: { x: 0, y: 11, w: 6, h: 12 },
  rotChart: { x: 0, y: 23, w: 12, h: 6 },
};

function loadChartLayout() {
  try {
    const raw = localStorage.getItem(CHART_LAYOUT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function layoutsEqual(a, b) {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((l) => [l.i, l]));
  return a.every((l) => {
    const o = byId.get(l.i);
    return o && o.x === l.x && o.y === l.y && o.w === l.w && o.h === l.h;
  });
}

export default function Charts({ clients, allDatesClients, infractionChart, allDatesInfractionChart, deviationThreshold, monthlySummary, skuDeviationChart, rotChart, onSelect, onSelectSku }) {
  const [savedLayout, setSavedLayout] = useState(loadChartLayout);

  function handleSelect(data, pctThreshold = null) {
    if (!data || !onSelect) return;
    const name = data.fullName || data.displayName || data.name;
    const all = [...clients, ...(allDatesClients || [])];
    const client = all.find((c) => c.name === name || name.includes(c.name) || c.name.includes(name)) ?? { name };
    onSelect(client, pctThreshold);
  }

  const chartDefs = [
    {
      id: "clientScore",
      title: "Score promedio por cliente",
      content: <BarPanel data={clients} allDatesData={allDatesClients ?? []} onSelect={handleSelect} />,
    },
    skuDeviationChart && skuDeviationChart.length > 0 && {
      id: "topRotos",
      title: "Top 5 productos más rotos",
      content: <TopRotosPie data={skuDeviationChart} onSelectSku={onSelectSku} />,
    },
    infractionChart && infractionChart.length > 0 && {
      id: "infractionAccounts",
      title: `Top 15 cuentas en infracción (≥${deviationThreshold}%)`,
      content: <DeviationPanel data={infractionChart} allDatesData={allDatesInfractionChart} onSelect={handleSelect} threshold={deviationThreshold} />,
    },
    rotChart && rotChart.length > 0 && {
      id: "rotChart",
      title: "Score e infracciones por rotación",
      content: <RotChart data={rotChart} />,
    },
  ].filter(Boolean);

  const layout = useMemo(() => {
    const byId = new Map(savedLayout.map((l) => [l.i, l]));
    let nextY = 0;
    return chartDefs.map((def) => {
      const stored = byId.get(def.id);
      if (stored) return { minW: 3, minH: 4, ...stored, i: def.id };
      const fallback = DEFAULT_CHART_LAYOUT[def.id] ?? { x: 0, y: nextY, w: 6, h: 11 };
      nextY = fallback.y + fallback.h;
      return { i: def.id, minW: 3, minH: 4, ...fallback };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedLayout, clients, skuDeviationChart, infractionChart, rotChart]);

  function handleLayoutChange(newLayout) {
    setSavedLayout((prev) => {
      if (layoutsEqual(prev, newLayout)) return prev;
      try {
        localStorage.setItem(CHART_LAYOUT_KEY, JSON.stringify(newLayout));
      } catch {
        // ignore write failures (e.g. storage disabled)
      }
      return newLayout;
    });
  }

  if (!clients || clients.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--text-muted)", fontSize: 16 }}>
        No hay datos para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="charts">
      <CollapsibleChart title="Resumen del mes" defaultOpen={true}>
        <SummaryStats monthlySummary={monthlySummary} />
      </CollapsibleChart>

      <Grid
        className="charts-grid"
        layout={layout}
        cols={GRID_COLS}
        rowHeight={ROW_HEIGHT}
        margin={[GRID_MARGIN, GRID_MARGIN]}
        containerPadding={[0, 0]}
        draggableHandle=".drag-handle"
        onLayoutChange={handleLayoutChange}
        useCSSTransforms
      >
        {chartDefs.map((def) => (
          <div key={def.id}>
            <CollapsibleChart title={def.title} draggable>
              {def.content}
            </CollapsibleChart>
          </div>
        ))}
      </Grid>
    </div>
  );
}
