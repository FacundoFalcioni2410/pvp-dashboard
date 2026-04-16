import { useState, useMemo, memo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { scoreColor } from "../utils/score";

const CHART_PAGE = 15;
const CHART_H = CHART_PAGE * 32;

const TOOLTIP_STYLE = {
  contentStyle: { background: "#1e1e2e", border: "1px solid #444", color: "#e0e0f0" },
  labelStyle: { color: "#e0e0f0" },
  itemStyle: { color: "#e0e0f0" },
};

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
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={30} />
        <Tooltip
          {...TOOLTIP_STYLE}
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
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
        <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="displayName" width={140} tick={{ fontSize: 11 }} />
        <Tooltip
          {...TOOLTIP_STYLE}
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
  const [sortBy, setSortBy] = useState("pct");
  const sorted = useMemo(() =>
    [...data].sort((a, b) => sortBy === "pct" ? b.pctInfraccion - a.pctInfraccion : b.count - a.count),
    [data, sortBy]
  );
  const maxCount = useMemo(() => Math.max(...data.map((d) => d.count), 1), [data]);
  const byPct = sortBy === "pct";
  const h = Math.max(sorted.length * 32 + 20, 120);
  return (
    <>
      <div className="chart-sort-btns">
        <button className={`chart-sort-btn ${byPct ? "active" : ""}`} onClick={() => setSortBy("pct")}>% Desvío</button>
        <button className={`chart-sort-btn ${!byPct ? "active" : ""}`} onClick={() => setSortBy("count")}>Cantidad</button>
      </div>
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
        <XAxis
          type="number"
          domain={byPct ? [0, 100] : [0, maxCount]}
          tick={{ fontSize: 11 }}
          tickFormatter={byPct ? (v) => `${v}%` : undefined}
        />
        <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
        <Tooltip
          {...TOOLTIP_STYLE}
          content={({ payload, label }) => {
            if (!payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div style={{ background: "#1e1e2e", border: "1px solid #444", padding: "8px 12px", fontSize: 12, color: "#e0e0f0", borderRadius: 6 }}>
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
  const [sortBy, setSortBy] = useState("pct");
  const sorted = useMemo(() =>
    [...data].sort((a, b) => sortBy === "pct" ? b.pctHighDeviation - a.pctHighDeviation : b.count - a.count),
    [data, sortBy]
  );
  const maxCount = useMemo(() => Math.max(...data.map((d) => d.count), 1), [data]);
  const byPct = sortBy === "pct";
  const h = Math.max(sorted.length * 32 + 20, 120);
  return (
    <>
      <div className="chart-sort-btns">
        <button className={`chart-sort-btn ${byPct ? "active" : ""}`} onClick={() => setSortBy("pct")}>% Desvío</button>
        <button className={`chart-sort-btn ${!byPct ? "active" : ""}`} onClick={() => setSortBy("count")}>Cantidad</button>
      </div>
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
        <XAxis
          type="number"
          domain={byPct ? [0, 100] : [0, maxCount]}
          tick={{ fontSize: 11 }}
          tickFormatter={byPct ? (v) => `${v}%` : undefined}
        />
        <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
        <Tooltip
          {...TOOLTIP_STYLE}
          content={({ payload, label }) => {
            if (!payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div style={{ background: "#1e1e2e", border: "1px solid #444", padding: "8px 12px", fontSize: 12, color: "#e0e0f0", borderRadius: 6 }}>
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

      <CollapsibleChart title="Distribución por score y rango de desvío" defaultOpen={true}>
        <StackedBarChart rows={rows} />
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
