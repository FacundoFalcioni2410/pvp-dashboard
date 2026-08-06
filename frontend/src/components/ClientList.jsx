/* eslint-disable react-hooks/set-state-in-render */
import { useState, useEffect, useMemo, useRef, useDeferredValue } from "react";
import { scoreColor, maxScoreFor, buildScoreFilters, FIELDS } from "../utils/score";
import { useDashboard } from "../context/DashboardContext";

const PAGE_SIZE = 25;

function ProductDropdown({ skus, onSelect }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef();

  useEffect(() => {
    function handler(e) { if (!wrapRef.current?.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (skus.length <= 1) {
    return skus[0] ? (
      <span className="client-usuario clickable-product" onClick={() => onSelect(skus[0])}>
        {skus[0]}
      </span>
    ) : null;
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline" }}>
      <span className="client-usuario" style={{ cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        {skus.length} productos ▼
      </span>
      {open && (
        <ul className="filter-dropdown" style={{ position: "absolute", left: 0, top: "100%", zIndex: 10, minWidth: 180 }}>
          {skus.map((s) => (
            <li key={s} className="filter-suggestion-item" onMouseDown={() => { onSelect(s); setOpen(false); }}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TYPE_OPTIONS = [
  { label: "Seller", value: "SELLER" },
  { label: "Cliente", value: "CLIENTE" },
  { label: "Contrabando", value: "CONTRABANDO" },
];

const SORT = {
  SCORE_ASC: "score_asc",
  SCORE_DESC: "score_desc",
  NAME_ASC: "name_asc",
  NAME_DESC: "name_desc",
};

const SORT_OPTIONS = [
  { label: "Score ↑", value: SORT.SCORE_ASC },
  { label: "Score ↓", value: SORT.SCORE_DESC },
  { label: "A → Z", value: SORT.NAME_ASC },
  { label: "Z → A", value: SORT.NAME_DESC },
];

function applySort(clients, sortBy) {
  const arr = [...clients];
  switch (sortBy) {
    case SORT.SCORE_ASC: return arr.sort((a, b) => a.avgScore - b.avgScore);
    case SORT.SCORE_DESC: return arr.sort((a, b) => b.avgScore - a.avgScore);
    case SORT.NAME_ASC: return arr.sort((a, b) => a.name.localeCompare(b.name));
    case SORT.NAME_DESC: return arr.sort((a, b) => b.name.localeCompare(a.name));
    default: return arr;
  }
}

function UserDropdown({ rows, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef();
  const inputRef = useRef();

  useEffect(() => {
    function handler(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const users = useMemo(() => {
    const s = new Set(rows.map((r) => r[FIELDS.USUARIO_ML]).filter(Boolean));
    return [...s].sort();
  }, [rows]);

  const suggestions = useMemo(() =>
    query.trim() ? users.filter((u) => u.toLowerCase().includes(query.toLowerCase())) : users,
    [query, users]);

  function select(u) { onChange(u); setQuery(""); setOpen(false); }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button className={`filter-trigger ${open ? "open" : ""}`} onClick={() => setOpen((o) => !o)} type="button">
        <span className={`filter-trigger-label ${!selected ? "placeholder" : ""}`}>
          {selected || "Todos los usuarios"}
        </span>
        {selected && (
          <span className="filter-clear-x" onMouseDown={(e) => { e.stopPropagation(); onChange(""); setOpen(false); }}>✕</span>
        )}
        <span className="filter-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="filter-dropdown">
          <div className="filter-search-wrap">
            <input ref={inputRef} className="filter-search-input" type="text" placeholder="Buscar usuario…"
              value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && suggestions.length === 1) select(suggestions[0]);
              }}
            />
          </div>
          <ul className="filter-suggestions">
            <li className={`filter-suggestion-item ${!selected ? "active" : ""}`} onMouseDown={() => select("")}>Todos</li>
            {suggestions.slice(0, 30).map((u) => (
              <li key={u} className={`filter-suggestion-item ${selected === u ? "active" : ""}`} onMouseDown={() => select(u)}>{u}</li>
            ))}
            {suggestions.length > 30 && (
              <li className="filter-suggestion-more">+{suggestions.length - 30} más — refiná la búsqueda</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ClientList({ clients, rows, onSelect, selectedName, onSelectProduct }) {
  const { scoreConfig } = useDashboard();
  const maxScore = maxScoreFor(scoreConfig?.bands);
  const SCORE_FILTERS = useMemo(() => buildScoreFilters(maxScore), [maxScore]);
  const [search] = useState("");
  const [mlUser, setMlUser] = useState("");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState(new Set());
  const [sortBy, setSortBy] = useState(SORT.SCORE_ASC);
  const [page, setPage] = useState(0);

  const deferredSearch = useDeferredValue(search);
  const deferredMlUser = useDeferredValue(mlUser);
  const deferredScoreFilter = useDeferredValue(scoreFilter);
  const deferredTypeFilter = useDeferredValue(typeFilter);
  function toggleType(value) {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  }
  const deferredSortBy = useDeferredValue(sortBy);

  const clientSkus = useMemo(() => {
    const map = {};
    for (const row of rows) {
      const client = row[FIELDS.RAZON_SOCIAL] ?? "Sin nombre";
      const sku = row[FIELDS.SKU];
      if (!sku || sku === "None" || sku === "nan") continue;
      if (!map[client]) map[client] = [];
      if (!map[client].includes(sku)) map[client].push(sku);
    }
    for (const client of Object.keys(map)) {
      map[client].sort();
    }
    return map;
  }, [rows]);

  const sorted = useMemo(() => {
    setPage(0);
    const q = deferredSearch.trim().toLowerCase();
    const filtered = clients.filter((c) => {
      if (deferredMlUser && c.usuario !== deferredMlUser) return false;
      if (q) {
        const nameMatch = c.name.toLowerCase().includes(q);
        const usuarioMatch = c.usuario.toLowerCase().includes(q);
        const skuMatch = clientSkus[c.name]
          ? clientSkus[c.name].some((s) => s.toLowerCase().includes(q))
          : false;
        if (!nameMatch && !usuarioMatch && !skuMatch) return false;
      }
      if (deferredScoreFilter !== "all") {
        const f = SCORE_FILTERS.find((x) => x.value === deferredScoreFilter);
        if (f && (c.avgScore < f.min || c.avgScore > f.max)) return false;
      }
      if (deferredTypeFilter.size > 0) {
        if (!deferredTypeFilter.has((c.tipo ?? "").toUpperCase())) return false;
      }
      return true;
    });
    return applySort(filtered, deferredSortBy);
  }, [clients, clientSkus, deferredSearch, deferredMlUser, deferredScoreFilter, deferredTypeFilter, deferredSortBy, SCORE_FILTERS]);

  const visible = (page + 1) * PAGE_SIZE;
  const shown = sorted.slice(0, visible);
  const remaining = sorted.length - visible;

  function handleSelect(client) {
    const clientRows = rows.filter((r) =>
      (r[FIELDS.RAZON_SOCIAL] ?? "Sin nombre") === client.name &&
      (!mlUser || r[FIELDS.USUARIO_ML] === mlUser)
    );
    onSelect({ ...client, rows: clientRows });
  }

  return (
    <div className="client-list-wrap">
      <div className="search-wrap">
        <UserDropdown rows={rows} selected={mlUser} onChange={setMlUser} />
      </div>

      <div className="list-controls">
        <div className="score-filter-btns">
          {SCORE_FILTERS.map((f) => (
            <button key={f.value} className={`sf-btn sf-${f.value} ${scoreFilter === f.value ? "active" : ""}`}
              onClick={() => setScoreFilter(f.value)}>{f.label}</button>
          ))}
        </div>
        <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="list-controls type-filter-row">
        <div className="score-filter-btns">
          <button
            className={`sf-btn ${typeFilter.size === 0 ? "active" : ""}`}
            onClick={() => setTypeFilter(new Set())}
          >Todos</button>
          {TYPE_OPTIONS.map((f) => (
            <button
              key={f.value}
              className={`sf-btn tf-${f.value} ${typeFilter.has(f.value) ? "active" : ""}`}
              onClick={() => toggleType(f.value)}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="empty">Sin resultados.</p>
      ) : (
        <>
          <ul className="client-list">
            {shown.map((c) => {
              const isContrabando = (c.tipo ?? "").toUpperCase() === "CONTRABANDO";
              return (
                <li key={c.name}
                  className={`client-item ${selectedName === c.name ? "selected" : ""} ${isContrabando ? "contrabando-item" : ""}`}
                  onClick={() => handleSelect(c)}
                >
                  <div className="client-info">
                    <span className="client-name">
                      {c.name}
                      {isContrabando && <span className="contrabando-tag">⚠ CONTRABANDO</span>}
                    </span>
                    {c.usuario && <span className="client-usuario">{c.usuario}</span>}
                    {clientSkus[c.name] && clientSkus[c.name].length > 0 && (
                      <span className="client-usuario">
                        <ProductDropdown skus={clientSkus[c.name]} onSelect={(s) => onSelectProduct && onSelectProduct(s)} />
                      </span>
                    )}
                  </div>
                  <span className="score-badge" style={{ background: scoreColor(c.avgScore, maxScore) }}>{c.avgScore}</span>
                </li>
              );
            })}
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
