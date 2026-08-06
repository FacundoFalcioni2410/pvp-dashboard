import { useMemo } from "react";
import { FIELDS, scoreColor, maxScoreFor } from "../utils/score";
import { useDashboard } from "../context/DashboardContext";

export default function WatchlistSidebar({ rows, selectedSkus, onRemove, onSelectSku }) {
  const { scoreConfig } = useDashboard();
  const maxScore = maxScoreFor(scoreConfig?.bands);

  const items = useMemo(() => {
    const map = {};
    for (const row of rows) {
      const sku = row[FIELDS.SKU];
      if (!sku || !selectedSkus.includes(sku)) continue;
      if (!map[sku]) {
        map[sku] = { sku, description: row[FIELDS.DESCRIPCION] ?? "", scores: [] };
      }
      if (row.score != null) map[sku].scores.push(Number(row.score));
    }
    const found = Object.values(map).map((p) => ({
      ...p,
      avgScore: p.scores.length > 0 ? Math.round(p.scores.reduce((a, b) => a + b, 0) / p.scores.length) : 0,
    }));
    const foundSkus = new Set(found.map((p) => p.sku));
    const missing = selectedSkus.filter((s) => !foundSkus.has(s)).map((s) => ({ sku: s, description: "", avgScore: null }));
    return [...found, ...missing];
  }, [rows, selectedSkus]);

  if (selectedSkus.length === 0) {
    return (
      <p style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>
        Elegí los SKUs a monitorear desde el panel principal.
      </p>
    );
  }

  return (
    <div className="client-list-wrap">
      <p style={{ padding: "8px 16px 0", fontSize: 12, color: "var(--text-muted)" }}>
        {selectedSkus.length} SKU{selectedSkus.length !== 1 ? "s" : ""} en seguimiento
      </p>
      <ul className="client-list">
        {items.map((p) => (
          <li key={p.sku} className="client-item" onClick={() => onSelectSku(p.sku)}>
            <div className="client-info">
              <span className="client-name">{p.sku}</span>
              <span className="client-usuario" title={p.description}>{p.description || "—"}</span>
            </div>
            {p.avgScore != null && (
              <span className="score-badge" style={{ background: scoreColor(p.avgScore, maxScore) }}>{p.avgScore}</span>
            )}
            <span
              style={{ cursor: "pointer", fontWeight: 700, color: "var(--text-muted)", marginLeft: 8 }}
              onClick={(e) => { e.stopPropagation(); onRemove(p.sku); }}
              title="Quitar del seguimiento"
            >
              ✕
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
