import { useState, useMemo } from "react";
import { useDashboard } from "../context/DashboardContext";

export default function CompareView({ client, sku, onSelectItem }) {
  const { activeDatasetId, datasets } = useDashboard();
  const [compareDatasetId, setCompareDatasetId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const available = datasets.filter((d) => d.id !== activeDatasetId);

  const handleCompare = async () => {
    if (!compareDatasetId || !activeDatasetId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        dataset1_id: activeDatasetId,
        dataset2_id: Number(compareDatasetId),
      });
      if (client) params.set("client", client);
      if (sku) params.set("sku", sku);
      
      const res = await fetch(`/compare?${params}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const result = await res.json();
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const sortedData = useMemo(() => {
    if (!data?.items) return [];
    return [...data.items].sort((a, b) => {
      if (a.in_both && b.in_both) {
        const diffA = Math.abs(a.delta);
        const diffB = Math.abs(b.delta);
        return diffB - diffA;
      }
      return a.in_both ? -1 : 1;
    });
  }, [data]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <select 
          value={compareDatasetId} 
          onChange={(e) => setCompareDatasetId(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 6, background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)" }}
        >
          <option value="">Seleccionar dataset para comparar</option>
          {available.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <button 
          onClick={handleCompare}
          disabled={!compareDatasetId || loading}
          style={{ padding: "6px 16px", background: "var(--accent)", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          {loading ? "Cargando..." : "Comparar"}
        </button>
      </div>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {data && (
        <div>
          <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>
            {data.dataset1_name} vs {data.dataset2_name} - {sortedData.filter(r => r.in_both).length} items en ambos
          </p>
          <table className="detail-table" style={{ tableLayout: "auto", width: "100%" }}>
            <thead>
              <tr>
                <th>{client ? "SKU" : "Cliente"}</th>
                <th>{data.dataset1_name} %</th>
                <th>{data.dataset2_name} %</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.slice(0, 30).map((row, i) => {
                const displayKey = row.key;
                return (
                  <tr key={i}>
                    <td 
                      className="clickable-cell"
                      onClick={() => onSelectItem && onSelectItem(displayKey)}
                      title={onSelectItem ? (client ? "Ver producto" : "Ver cliente") : undefined}
                    >
                      {displayKey}
                    </td>
                    <td style={{ color: row.avg1 != null && row.avg1 > 0 ? "#22c55e" : row.avg1 != null && row.avg1 < 0 ? "#ef4444" : "inherit" }}>
                      {row.avg1 != null ? `${row.avg1}%` : "—"}
                      {row.count1 > 0 && <span style={{ color: "var(--text-muted)", fontSize: 10 }}> ({row.count1})</span>}
                    </td>
                    <td style={{ color: row.avg2 != null && row.avg2 > 0 ? "#22c55e" : row.avg2 != null && row.avg2 < 0 ? "#ef4444" : "inherit" }}>
                      {row.avg2 != null ? `${row.avg2}%` : "—"}
                      {row.count2 > 0 && <span style={{ color: "var(--text-muted)", fontSize: 10 }}> ({row.count2})</span>}
                    </td>
                    <td style={{ color: row.delta > 0 ? "#22c55e" : row.delta < 0 ? "#ef4444" : "inherit", fontWeight: "bold" }}>
                      {row.delta != null ? `${row.delta > 0 ? "+" : ""}${row.delta}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!data && !loading && !error && available.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>No hay otros datasets disponibles para comparar.</p>
      )}
    </div>
  );
}