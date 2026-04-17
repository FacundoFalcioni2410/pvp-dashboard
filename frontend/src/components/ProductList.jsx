import { useMemo, useState, useDeferredValue, useRef, useEffect } from "react";
import { FIELDS, scoreColor, fmtPct } from "../utils/score";

const PAGE_SIZE = 30;

function ClientDropdown({ clients, onSelect }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef();

  useEffect(() => {
    function handler(e) { if (!wrapRef.current?.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (clients.length <= 1) {
    return clients[0] ? <span className="client-usuario">{clients[0]}</span> : null;
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline" }}>
      <span className="client-usuario" style={{ cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        {clients.length} clientes ▼
      </span>
      {open && (
        <ul className="filter-dropdown" style={{ position: "absolute", left: 0, top: "100%", zIndex: 10, minWidth: 180 }}>
          {clients.map((c) => (
            <li key={c} className="filter-suggestion-item" onMouseDown={() => { onSelect(c); setOpen(false); }}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ProductList({ rows, onSelect, selectedSku, onSelectClient }) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const products = useMemo(() => {
    const map = {};
    for (const row of rows) {
      const sku = row[FIELDS.SKU];
      if (!sku || sku === "None" || sku === "nan") continue;
      if (!map[sku]) {
        map[sku] = {
          sku,
          description: row[FIELDS.DESCRIPCION] ?? "",
          scores: [],
          allowedPct: row.allowed_pct ?? null,
          clientList: [],
        };
      }
      if (row.score != null) map[sku].scores.push(Number(row.score));
      if (row[FIELDS.RAZON_SOCIAL] && !map[sku].clientList.includes(row[FIELDS.RAZON_SOCIAL])) {
        map[sku].clientList.push(row[FIELDS.RAZON_SOCIAL]);
      }
      if (row.allowed_pct != null && map[sku].allowedPct == null) {
        map[sku].allowedPct = row.allowed_pct;
      }
    }
    return Object.values(map).map((p) => ({
      ...p,
      clients: p.clientList.length,
      avgScore: p.scores.length > 0
        ? Math.round(p.scores.reduce((a, b) => a + b, 0) / p.scores.length)
        : 0,
    }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = deferred.toLowerCase().trim();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }, [products, deferred]);

  const shown = filtered.slice(0, visible);
  const remaining = filtered.length - visible;

  return (
    <div className="client-list-wrap">
      <div className="search-wrap">
        <input
          className="search-input"
          placeholder="Buscar SKU o descripción…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setVisible(PAGE_SIZE); }}
        />
        {query && (
          <button className="search-clear" onClick={() => setQuery("")}>✕</button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="empty">Sin resultados</p>
      ) : (
        <ul className="client-list">
          {shown.map((p) => (
            <li
              key={p.sku}
              className={`client-item ${p.sku === selectedSku ? "selected" : ""}`}
              onClick={() => onSelect(p)}
            >
              <div className="client-info">
                <span className="client-name">{p.sku}</span>
                <span className="client-usuario" title={p.description}>
                  {p.description || "—"}
                </span>
                <span className="client-usuario">
                  <ClientDropdown
                    clients={p.clientList}
                    onSelect={(c) => onSelectClient && onSelectClient(c)}
                  />
                  {p.allowedPct != null && (
                    <> · <span className="product-threshold-tag">max {p.allowedPct}%</span></>
                  )}
                </span>
              </div>
              <span
                className="score-badge"
                style={{ background: scoreColor(p.avgScore) }}
              >
                {p.avgScore}
              </span>
            </li>
          ))}
          {remaining > 0 && (
            <button
              className="load-more-btn"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
            >
              {remaining} más
            </button>
          )}
        </ul>
      )}
    </div>
  );
}
