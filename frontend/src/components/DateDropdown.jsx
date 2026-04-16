import { useState, useRef, useEffect } from "react";

export default function DateDropdown({ dates, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef();

  useEffect(() => {
    function handler(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!dates || dates.length <= 1) return null;

  return (
    <div ref={wrapRef} className="date-dropdown-wrap">
      <button
        className={`filter-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className="filter-trigger-label">{selected ?? "Seleccionar fecha"}</span>
        <span className="filter-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="filter-dropdown date-dropdown-list">
          <ul className="filter-suggestions">
            {dates.map((d) => (
              <li
                key={d}
                className={`filter-suggestion-item ${selected === d ? "active" : ""}`}
                onMouseDown={() => { onChange(d); setOpen(false); }}
              >
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
