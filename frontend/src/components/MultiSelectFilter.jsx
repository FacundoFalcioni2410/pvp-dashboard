import { useState, useEffect, useRef } from "react";

export default function MultiSelectFilter({ label, options, values = [], onChange, exclusiveOptions = [], showSelectAll = true, labelMap = {} }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tempValues, setTempValues] = useState(values);
  const wrapRef = useRef();
  const inputRef = useRef();

  useEffect(() => {
    function handler(e) { if (!wrapRef.current?.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { setTempValues(values); }, [values]);

  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()) || (labelMap[o] ?? "").toLowerCase().includes(query.toLowerCase()))
    : options;

  function toggle(v) {
    setTempValues((prev) => {
      if (exclusiveOptions.includes(v)) {
        return [v];
      }
      const next = prev.includes(v)
        ? prev.filter((x) => x !== v)
        : [...prev, v];
      if (exclusiveOptions.some((e) => next.includes(e))) {
        return next.filter((x) => !exclusiveOptions.includes(x) || x === v);
      }
      return next;
    });
  }

  function selectAll() {
    setTempValues(options.filter((o) => !exclusiveOptions.includes(o)));
  }

  function clearAll() {
    setTempValues([]);
  }

  function apply() {
    onChange(tempValues);
    setOpen(false);
  }

  const displayValue = tempValues.length === 0
    ? "Todos"
    : tempValues.length === options.length
    ? "Todos"
    : tempValues.map((v) => labelMap[v] ?? v).join(", ");

  const hasChanges = JSON.stringify(tempValues.sort()) !== JSON.stringify(values.sort());

  return (
    <div ref={wrapRef} className="gf-wrap">
      <button
        className={`gf-trigger ${open ? "open" : ""} ${tempValues.length > 0 ? "gf-active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className="gf-label">{label}</span>
        <span className={`gf-value ${tempValues.length === 0 ? "placeholder" : ""}`}>{displayValue}</span>
        {values.length > 0 && (
          <span className="gf-clear" onMouseDown={(e) => { e.stopPropagation(); onChange([]); setTempValues([]); setOpen(false); }}>✕</span>
        )}
        <span className="gf-arrow">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="gf-dropdown">
          <div className="filter-search-wrap">
            <input ref={inputRef} className="filter-search-input" type="text" placeholder={`Buscar…`}
              value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            />
          </div>
          <ul className="filter-suggestions">
            {showSelectAll && options.length > 0 && (
              <li className={`filter-suggestion-item ${tempValues.length === 0 ? "active" : ""}`} onMouseDown={(e) => { e.stopPropagation(); tempValues.length === options.length ? clearAll() : selectAll(); }}>
                {tempValues.length === options.length ? "Deseleccionar todos" : "Seleccionar todos"}
              </li>
            )}
            {filtered.map((o) => (
              <li key={o} className={`filter-suggestion-item ${tempValues.includes(o) ? "active" : ""}`} onMouseDown={(e) => { e.stopPropagation(); toggle(o); }}>
                {tempValues.includes(o) ? "✓ " : ""}{labelMap[o] ?? o}
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="filter-suggestion-more">Sin resultados</li>
            )}
          </ul>
          <div className="gf-dropdown-actions">
            <button className="gf-apply-btn" onClick={(e) => { e.stopPropagation(); apply(); }} disabled={!hasChanges}>
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
