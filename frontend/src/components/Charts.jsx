import { useState, useMemo, memo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Cell, LabelList, PieChart, Pie, Legend,
} from "recharts";
import GridLayout, { WidthProvider } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { scoreColor, maxScoreFor } from "../utils/score";
import { getTooltipStyle } from "../utils/theme";
import { useDashboard } from "../context/DashboardContext";

const Grid = WidthProvider(GridLayout);

const CHART_PAGE = 15;

// Muted, desaturated palette (not pastel) shared by every pie/donut chart —
// each slice gets its own tone without any of them reading as bright/loud.
const PIE_COLORS_LIGHT = ["#4c6b8a", "#8a6a45", "#5c8a72", "#8a7a45", "#7a5c7f", "#6b7480", "#8a5a4c", "#45838a", "#8a4c68", "#5c5c8a"];
const PIE_COLORS_DARK = ["#7d9cbd", "#bd9968", "#82b399", "#bdab68", "#a988ae", "#98a3ad", "#ba8a7c", "#75b3ba", "#ba7c98", "#8c8cba"];

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
        <span className="stat-value">{stats.clientCount?.toLocaleString()}</span>
        <span className="stat-label">Clientes</span>
      </div>
      <div className="stat-box">
        <span className="stat-value" style={{ color: stats.avgDeviation > 20 ? "#ef4444" : stats.avgDeviation > 10 ? "#f97316" : "#eab308" }}>
          {stats.avgDeviation}%
        </span>
        <span className="stat-label">Desvío Promedio (mes)</span>
      </div>
    </div>
  );
});

// Bands are stored as excess-over-permitido; convert to the absolute % boundary they represent.
function levelRangeLabel(level, bands, defaultThreshold, topScore) {
  const absBands = bands.map((b) => defaultThreshold + (Number(b) || 0));
  if (level === topScore || absBands.length === 0) return `> -${defaultThreshold}%`;
  if (level === 1) return `> -${absBands[absBands.length - 1]}%`;
  const i = topScore - 1 - level;
  const lower = i === 0 ? defaultThreshold : absBands[i - 1];
  const upper = absBands[i];
  return `-${lower} a -${upper}%`;
}

const LevelDistributionChart = memo(function LevelDistributionChart({ levelDistribution, scoreConfig, maxScore }) {
  if (!levelDistribution || levelDistribution.length === 0) return null;
  const bands = scoreConfig?.bands ?? [5, 10, 15, 20, 25, 30];
  const defaultThreshold = scoreConfig?.defaultThreshold ?? 15;
  const topScore = bands.length + 2;
  const data = levelDistribution
    .filter((d) => d.pct > 0)
    .map((d) => ({ ...d, name: levelRangeLabel(d.level, bands, defaultThreshold, topScore) }))
    .sort((a, b) => b.level - a.level); // best level first (left) → worst last (right)

  if (data.length === 0) return null;

  // Rounded per-level percentages rarely add up to exactly 100 — scale them
  // so the bar always fills the full width, while still showing the
  // original rounded % in the labels.
  const pctTotal = data.reduce((s, d) => s + d.pct, 0) || 1;

  // Each label centers on its own segment's true position — no horizontal
  // clamping, so it always lines up with the segment it describes. Labels
  // alternate above/below the bar so two narrow neighbors never fight for
  // the same line. The container reserves fixed side margins so a label
  // near the left/right edge has room to overflow without being clipped.
  const segments = data.reduce((acc, d) => {
    const width = (d.pct / pctTotal) * 100;
    const start = acc.length > 0 ? acc[acc.length - 1].cursorEnd : 0;
    const center = start + width / 2;
    acc.push({ ...d, width, start, center, cursorEnd: start + width });
    return acc;
  }, []);
  const aboveLabels = segments.filter((_, i) => i % 2 === 1);
  const belowLabels = segments.filter((_, i) => i % 2 === 0);

  return (
    <div className="chart-flex-fill" style={{ display: "flex", flexDirection: "column", padding: "0 32px" }}>
      <div style={{ position: "relative", flex: "none", minHeight: 30, marginBottom: 4 }}>
        {aboveLabels.map((s) => (
          <div key={s.level} style={{ position: "absolute", bottom: 0, left: `${s.center}%`, transform: "translateX(-50%)", whiteSpace: "nowrap", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{s.pct}% · {s.count} SKUs</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "center" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: scoreColor(s.level, maxScore), flex: "none" }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{s.name}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", width: "100%", height: 40, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)", flex: "none" }}>
        {segments.map((s, i) => (
          <div
            key={s.level}
            title={`${s.name} · ${s.pct}% · ${s.count} SKUs`}
            style={{
              flex: `0 0 ${s.width}%`,
              background: scoreColor(s.level, maxScore),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRight: i < segments.length - 1 ? "1px solid rgba(255,255,255,0.4)" : "none",
            }}
          >
            {s.width >= 6 && (
              <span style={{ color: "#fff", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{s.pct}%</span>
            )}
          </div>
        ))}
      </div>
      <div style={{ position: "relative", flex: 1, marginTop: 8, minHeight: 30 }}>
        {belowLabels.map((s) => (
          <div key={s.level} style={{ position: "absolute", top: 0, left: `${s.center}%`, transform: "translateX(-50%)", whiteSpace: "nowrap", textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "center" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: scoreColor(s.level, maxScore), flex: "none" }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{s.name}</span>
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{s.pct}% · {s.count} SKUs</div>
          </div>
        ))}
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

const BarPanel = memo(function BarPanel({ data, allDatesData, onSelect, maxScore }) {
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
            <XAxis type="number" domain={[0, maxScore]} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="displayName" width={140} tick={{ fontSize: 11 }} />
            <Tooltip
              {...getTooltipStyle()}
              formatter={(v, name, payload) => [`Score: ${v}`, payload[0]?.payload?.fullName || payload[0]?.payload?.name || ""]}
            />
            <Bar dataKey="avgScore" radius={[0, 4, 4, 0]} isAnimationActive={false} onClick={(d) => onSelect?.(d)}>
              {pageData.map((entry, i) => (
                <Cell key={i} fill={scoreColor(entry.avgScore, maxScore)} />
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

const RotInfractionDonut = memo(function RotInfractionDonut({ data }) {
  const colors = getPieColors();
  return (
    <div className="chart-flex-fill">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="pctInfraccion"
            nameKey="rot"
            cx="50%"
            cy="46%"
            innerRadius="45%"
            outerRadius="70%"
            isAnimationActive={false}
            label={({ rot, pctInfraccion }) => `${rot} · ${pctInfraccion}%`}
            labelLine={false}
          >
            {data.map((entry, i) => (
              <Cell key={entry.rot} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            {...getTooltipStyle()}
            content={({ payload }) => {
              if (!payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div style={getTooltipStyle().contentStyle}>
                  <p style={{ marginBottom: 4, fontWeight: 700 }}>Rotación {d.rot}</p>
                  <p>% desvío: {d.pctInfraccion}%</p>
                  <p>Publicaciones: {d.total}</p>
                </div>
              );
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={40}
            iconType="circle"
            formatter={(_, entry) => `${entry.payload.rot} · ${entry.payload.pctInfraccion}%`}
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
  levelDistribution: { x: 0, y: 0, w: 12, h: 4 },
  clientScore: { x: 0, y: 4, w: 6, h: 11 },
  topRotos: { x: 6, y: 4, w: 6, h: 11 },
  infractionAccounts: { x: 0, y: 15, w: 6, h: 12 },
  rotDonut: { x: 0, y: 27, w: 6, h: 10 },
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
  const { scoreConfig } = useDashboard();
  const maxScore = maxScoreFor(scoreConfig?.bands);
  const [savedLayout, setSavedLayout] = useState(loadChartLayout);

  function handleSelect(data, pctThreshold = null) {
    if (!data || !onSelect) return;
    const name = data.fullName || data.displayName || data.name;
    const all = [...clients, ...(allDatesClients || [])];
    const client = all.find((c) => c.name === name || name.includes(c.name) || c.name.includes(name)) ?? { name };
    onSelect(client, pctThreshold);
  }

  const chartDefs = [
    monthlySummary?.levelDistribution && monthlySummary.levelDistribution.some((d) => d.pct > 0) && {
      id: "levelDistribution",
      title: "% de SKUs por nivel",
      content: <LevelDistributionChart levelDistribution={monthlySummary.levelDistribution} scoreConfig={scoreConfig} maxScore={maxScore} />,
    },
    {
      id: "clientScore",
      title: "Score promedio por cliente",
      content: <BarPanel data={clients} allDatesData={allDatesClients ?? []} onSelect={handleSelect} maxScore={maxScore} />,
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
      id: "rotDonut",
      title: "% de quiebre por rotación",
      content: <RotInfractionDonut data={rotChart} />,
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
  }, [savedLayout, clients, skuDeviationChart, infractionChart, rotChart, monthlySummary]);

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
