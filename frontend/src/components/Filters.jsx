import { useState, useRef, useEffect, useMemo } from "react";

export default function Filters({ users, selected, onChange }) {
  const [open, setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef  = useRef();
  const inputRef = useRef();

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus search when dropdown opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const suggestions = useMemo(() =>
    search.trim()
      ? users.filter((u) => u.toLowerCase().includes(search.toLowerCase()))
      : users,
  [search, users]);

  function select(u) {
    onChange(u);
    setSearch("");
    setOpen(false);
  }

  function clear(e) {
    e.stopPropagation();
    onChange("");
    setOpen(false);
  }

  const label = selected || "Todos los usuarios";

  return (
    <div className="filters" ref={wrapRef}>
      {/* Trigger — looks like a select */}
      <button
        className={`filter-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className={`filter-trigger-label ${!selected ? "placeholder" : ""}`}>
          {label}
        </span>
        {selected && (
          <span className="filter-clear-x" onMouseDown={clear}>✕</span>
        )}
        <span className="filter-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="filter-dropdown">
          <div className="filter-search-wrap">
            <input
              ref={inputRef}
              className="filter-search-input"
              type="text"
              placeholder="Buscar usuario…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && suggestions.length === 1) select(suggestions[0]);
              }}
            />
          </div>
          <ul className="filter-suggestions">
            <li
              className={`filter-suggestion-item ${!selected ? "active" : ""}`}
              onMouseDown={() => select("")}
            >
              Todos
            </li>
            {suggestions.slice(0, 30).map((u) => (
              <li
                key={u}
                className={`filter-suggestion-item ${selected === u ? "active" : ""}`}
                onMouseDown={() => select(u)}
              >
                {u}
              </li>
            ))}
            {suggestions.length > 30 && (
              <li className="filter-suggestion-more">
                +{suggestions.length - 30} más — refiná la búsqueda
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
