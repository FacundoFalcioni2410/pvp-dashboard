import { useMemo, useState, useDeferredValue, useRef, useEffect } from "react";
import { FIELDS, scoreColor, scoreClass, fmtPct } from "../utils/score";

const PAGE_SIZE = 30;

const SCORE_FILTERS = [
  { label: "Todos",   value: "all" },
  { label: "Crítico", value: "red",    min: 1, max: 3 },
  { label: "Regular", value: "orange", min: 4, max: 5 },
  { label: "Bueno",   value: "yellow", min: 6, max: 7 },
  { label: "Óptimo",  value: "green",  min: 8, max: 10 },
];

const SORT_OPTIONS = [
  { label: "Score ↑", value: "score_asc" },
  { label: "Score ↓", value: "score_desc" },
  { label: "A → Z",   value: "name_asc" },
  { label: "Z → A",   value: "name_desc" },
];

function applySort(products, sortBy) {
  const arr = [...products];
  switch (sortBy) {
    case "score_asc":  return arr.sort((a, b) => a.avgScore - b.avgScore);
    case "score_desc": return arr.sort((a, b) => b.avgScore - a.avgScore);
    case "name_asc":   return arr.sort((a, b) => a.sku.localeCompare(b.sku));
    case "name_desc":  return arr.sort((a, b) => b.sku.localeCompare(a.sku));
    default:           return arr;
  }
}

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
  const [scoreFilter, setScoreFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score_asc");
  const [page, setPage] = useState(0);
  const deferred = useDeferredValue(query);

  const products = useMemo(() => {
    const map = {};
    for (const row of rows) {
      const sku = row[FIELDS.SKU];
      if (!sku || sku === "None" || sku === "nan") continue;
      if (!map[sku]) {
        map[sku] = { sku, description: row[FIELDS.DESCRIPCION] ?? "", scores: [], allowedPct: null, clientList: [] };
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
      avgScore: p.scores.length > 0 ? Math.round(p.scores.reduce((a, b) => a + b, 0) / p.scores.length) : 0,
    }));
  }, [rows]);

  const sorted = useMemo(() => {
    setPage(0);
    const q = deferred.toLowerCase().trim();
    const filtered = products.filter((p) => {
      if (q && !p.sku.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return false;
      if (scoreFilter !== "all") {
        const f = SCORE_FILTERS.find((x) => x.value === scoreFilter);
        if (f && (p.avgScore < f.min || p.avgScore > f.max)) return false;
      }
      return true;
    });
    return applySort(filtered, sortBy);
  }, [products, deferred, scoreFilter, sortBy]);

  const visible = (page + 1) * PAGE_SIZE;
  const shown = sorted.slice(0, visible);
  const remaining = sorted.length - visible;

  return (
    <div className="client-list-wrap">
      <div className="search-wrap">
        <input
          className="search-input"
          placeholder="Buscar SKU o descripción…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(0); }}
        />
        {query && <button className="search-clear" onClick={() => setQuery("")}>✕</button>}
      </div>

      <div className="list-controls">
        <div className="score-filter-btns">
          {SCORE_FILTERS.map((f) => (
            <button
              key={f.value}
              className={`sf-btn sf-${f.value} ${scoreFilter === f.value ? "active" : ""}`}
              onClick={() => setScoreFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="empty">Sin resultados</p>
      ) : (
        <>
          <ul className="client-list">
            {shown.map((p) => (
              <li
                key={p.sku}
                className={`client-item ${p.sku === selectedSku ? "selected" : ""}`}
                onClick={() => onSelect(p)}
              >
                <div className="client-info">
                  <span className="client-name">{p.sku}</span>
                  <span className="client-usuario" title={p.description}>{p.description || "—"}</span>
                  <span className="client-usuario">
                    <ClientDropdown clients={p.clientList} onSelect={(c) => onSelectClient && onSelectClient(c)} />
                    {p.allowedPct != null && (
                      <> · <span className="product-threshold-tag">max {p.allowedPct}%</span></>
                    )}
                  </span>
                </div>
                <span className={`score-badge ${scoreClass(p.avgScore)}`}>{p.avgScore}</span>
              </li>
            ))}
          </ul>
          {remaining > 0 && (
            <button className="load-more-btn" onClick={() => setPage((p) => p + 1)}>
              Cargar {Math.min(remaining, PAGE_SIZE)} más ({remaining} restantes)
            </button>
          )}
        </>
      )}
    </div>
  );
}
