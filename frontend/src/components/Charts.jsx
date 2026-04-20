import { useState, useMemo, memo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { scoreColor } from "../utils/score";
import { getTooltipStyle } from "../utils/theme";

const CHART_PAGE = 15;
const CHART_H = CHART_PAGE * 32;

function CollapsibleChart({ title, children, defaultOpen = true }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3>{title}</h3>
        <button className="collapse-btn" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? "▼" : "▶"}
        </button>
      </div>
      {isOpen && children}
    </div>
  );
}

const SummaryStats = memo(function SummaryStats({ rows }) {
  const stats = useMemo(() => {
    const total = rows.length;
    if (total === 0) return null;

    const scores = rows.map((r) => r.score).filter((s) => s != null && s > 0);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    const infractions = rows.filter((r) => {
      const pct = Math.abs(parseFloat(r.normalized_pct) || 0);
      return pct > 15;
    }).length;

    const highDev = rows.filter((r) => {
      const pct = Math.abs(parseFloat(r.normalized_pct) || 0);
      return pct > 40;
    }).length;

    return {
      total,
      avgScore,
      infractions: Math.round((infractions / total) * 100),
      highDev: Math.round((highDev / total) * 100),
    };
  }, [rows]);

  if (!stats) return null;

  return (
    <div className="summary-stats">
      <div className="stat-box">
        <span className="stat-value">{stats.total}</span>
        <span className="stat-label">Publicaciones</span>
      </div>
      <div className="stat-box">
        <span className="stat-value" style={{ color: scoreColor(stats.avgScore) }}>{stats.avgScore}</span>
        <span className="stat-label">Score Promedio</span>
      </div>
      <div className="stat-box">
        <span className="stat-value" style={{ color: stats.infractions > 30 ? "#ef4444" : stats.infractions > 15 ? "#f97316" : "#eab308" }}>
          {stats.infractions}%
        </span>
        <span className="stat-label">En Infracción (&gt;15%)</span>
      </div>
      <div className="stat-box">
        <span className="stat-value" style={{ color: stats.highDev > 10 ? "#ef4444" : stats.highDev > 5 ? "#f97316" : "#eab308" }}>
          {stats.highDev}%
        </span>
        <span className="stat-label">Alto Desvío (&gt;40%)</span>
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

const BarPanel = memo(function BarPanel({ clientData, onSelect }) {
  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <BarChart data={clientData} layout="vertical" margin={{ top: 4, right: 36, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
        <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="displayName" width={140} tick={{ fontSize: 11 }} />
        <Tooltip
          {...getTooltipStyle()}
          formatter={(v, name, payload) => [`Score: ${v}`, payload[0]?.payload?.fullName || payload[0]?.payload?.name || ""]}
        />
        <Bar dataKey="avgScore" radius={[0, 4, 4, 0]} isAnimationActive={false} onClick={(data) => onSelect?.(data)}>
          {clientData.map((entry, i) => (
            <Cell key={i} fill={scoreColor(entry.avgScore)} />
          ))}
          <LabelList dataKey="avgScore" position="insideRight" style={{ fill: "#fff", fontSize: 11, fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});

const InfractionPanel = memo(function InfractionPanel({ data, onSelect }) {
  const [sortBy, setSortBy] = useState("count");
  const sorted = useMemo(() =>
    [...data].sort((a, b) => sortBy === "pct" ? b.pctInfraccion - a.pctInfraccion : b.count - a.count),
    [data, sortBy]
  );
  const maxCount = useMemo(() => Math.max(...data.map((d) => d.count), 1), [data]);
  const maxPct = useMemo(() => Math.max(...data.map((d) => d.pctInfraccion), 1), [data]);
  const byPct = sortBy === "pct";
  const h = Math.max(sorted.length * 32 + 20, 120);
  return (
    <>
      <div className="chart-sort-btns">
        <button className={`chart-sort-btn ${!byPct ? "active" : ""}`} onClick={() => setSortBy("count")}>Cantidad</button>
        <button className={`chart-sort-btn ${byPct ? "active" : ""}`} onClick={() => setSortBy("pct")}>% Desvío</button>
      </div>
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
        <XAxis
          type="number"
          domain={byPct ? [0, maxPct] : [0, maxCount]}
          tick={{ fontSize: 11 }}
          tickFormatter={byPct ? (v) => `${v}%` : undefined}
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
                <p>% Infracción: {d.pctInfraccion}%</p>
                <p>Publicaciones en infracción: {d.count} / {d.total}</p>
              </div>
            );
          }}
        />
        <Bar dataKey={byPct ? "pctInfraccion" : "count"} radius={[0, 4, 4, 0]} isAnimationActive={false} onClick={(d) => onSelect?.(d, 15)} cursor="pointer">
          {sorted.map((entry, i) => (
            <Cell key={i} fill={entry.pctInfraccion >= 50 ? "#ef4444" : entry.pctInfraccion >= 30 ? "#f97316" : "#eab308"} />
          ))}
          <LabelList dataKey={byPct ? "pctInfraccion" : "count"} position="insideRight"
            style={{ fill: "#fff", fontSize: 11, fontWeight: 600 }}
            formatter={byPct ? (v) => `${v}%` : undefined} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </>
  );
});

const HighDeviationPanel = memo(function HighDeviationPanel({ data, onSelect }) {
  const [sortBy, setSortBy] = useState("count");
  const sorted = useMemo(() =>
    [...data].sort((a, b) => sortBy === "pct" ? b.pctHighDeviation - a.pctHighDeviation : b.count - a.count),
    [data, sortBy]
  );
  const maxCount = useMemo(() => Math.max(...data.map((d) => d.count), 1), [data]);
  const maxPct = useMemo(() => Math.max(...data.map((d) => d.pctHighDeviation), 1), [data]);
  const byPct = sortBy === "pct";
  const h = Math.max(sorted.length * 32 + 20, 120);
  return (
    <>
      <div className="chart-sort-btns">
        <button className={`chart-sort-btn ${!byPct ? "active" : ""}`} onClick={() => setSortBy("count")}>Cantidad</button>
        <button className={`chart-sort-btn ${byPct ? "active" : ""}`} onClick={() => setSortBy("pct")}>% Desvío</button>
      </div>
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
        <XAxis
          type="number"
          domain={byPct ? [0, maxPct] : [0, maxCount]}
          tick={{ fontSize: 11 }}
          tickFormatter={byPct ? (v) => `${v}%` : undefined}
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
                <p>% Desvío Alto: {d.pctHighDeviation}%</p>
                <p>Desvíos altos: {d.count} / {d.total}</p>
              </div>
            );
          }}
        />
        <Bar dataKey={byPct ? "pctHighDeviation" : "count"} radius={[0, 4, 4, 0]} isAnimationActive={false} onClick={(d) => onSelect?.(d, 40)} cursor="pointer">
          {sorted.map((entry, i) => (
            <Cell key={i} fill={entry.pctHighDeviation >= 30 ? "#ef4444" : entry.pctHighDeviation >= 15 ? "#f97316" : "#eab308"} />
          ))}
          <LabelList dataKey={byPct ? "pctHighDeviation" : "count"} position="insideRight"
            style={{ fill: "#fff", fontSize: 11, fontWeight: 600 }}
            formatter={byPct ? (v) => `${v}%` : undefined} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </>
  );
});

export default function Charts({ clients, rows, infractionChart, highDeviationChart, onSelect }) {
  const [page, setPage] = useState(0);

  const allClients = useMemo(() =>
    [...clients]
      .map((c) => ({
        ...c,
        displayName: c.name.length > 18 ? c.name.slice(0, 16) + "…" : c.name,
        fullName: c.name,
      }))
      .sort((a, b) => a.avgScore - b.avgScore),
    [clients]
  );

  const totalPages = Math.ceil(allClients.length / CHART_PAGE);
  const clientData = useMemo(
    () => allClients.slice(page * CHART_PAGE, (page + 1) * CHART_PAGE),
    [allClients, page]
  );

  function handleSelect(data, pctThreshold = null) {
    if (!data || !onSelect) return;
    const name = data.fullName || data.displayName || data.name;
    const client = clients.find((c) => c.name === name || name.includes(c.name) || c.name.includes(name));
    if (client) onSelect(client, pctThreshold);
  }

  if (!clients || clients.length === 0) return null;

  return (
    <div className="charts">
      <CollapsibleChart title="Score promedio por cliente" defaultOpen={true}>
        {totalPages > 1 && (
          <div className="chart-pager">
            <button className="pager-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
            <span>{page + 1} / {totalPages}</span>
            <button className="pager-btn" disabled={page === totalPages - 1} onClick={() => setPage((p) => p + 1)}>›</button>
          </div>
        )}
        <BarPanel clientData={clientData} onSelect={handleSelect} />
      </CollapsibleChart>

      <CollapsibleChart title="Resumen del día" defaultOpen={true}>
        <SummaryStats rows={rows} />
      </CollapsibleChart>

      {infractionChart && infractionChart.length > 0 && (
        <CollapsibleChart title="Cuentas con más publicaciones en infracción (>15%)" defaultOpen={true}>
          <InfractionPanel data={infractionChart} onSelect={handleSelect} />
        </CollapsibleChart>
      )}

      {highDeviationChart && highDeviationChart.length > 0 && (
        <CollapsibleChart title="Cuentas con mayores desvíos altos (>40%)" defaultOpen={true}>
          <HighDeviationPanel data={highDeviationChart} onSelect={handleSelect} />
        </CollapsibleChart>
      )}
    </div>
  );
}
