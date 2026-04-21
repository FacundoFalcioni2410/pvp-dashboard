import { useState, useRef, useEffect } from "react";

export default function DateRangePicker({ dates = [], from, to, onFromChange, onToChange }) {
  const [openFrom, setOpenFrom] = useState(false);
  const [openTo, setOpenTo] = useState(false);
  const fromRef = useRef();
  const toRef = useRef();

  useEffect(() => {
    function handler(e) {
      if (!fromRef.current?.contains(e.target)) setOpenFrom(false);
      if (!toRef.current?.contains(e.target)) setOpenTo(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!dates || dates.length === 0) return null;

  const toDates = from ? dates.filter((d) => d >= from) : dates;

  function handleFromChange(d) {
    onFromChange(d);
    if (to && d && to < d) onToChange("");
    setOpenFrom(false);
  }

  return (
    <div className="drp-row">
      <div ref={fromRef} className="drp-wrap">
        <span className="drp-label">Desde:</span>
        <button
          className={`drp-trigger ${openFrom ? "open" : ""}`}
          onClick={() => setOpenFrom((o) => !o)}
          type="button"
        >
          <span>{from || "Cualquiera"}</span>
          <span className="drp-arrow">{openFrom ? "▲" : "▼"}</span>
        </button>
        {openFrom && (
          <div className="drp-dropdown">
            <ul className="drp-list">
              <li className="drp-item" onMouseDown={() => handleFromChange("")}>Cualquiera</li>
              {dates.map((d) => (
                <li key={d} className={`drp-item ${from === d ? "active" : ""}`} onMouseDown={() => handleFromChange(d)}>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div ref={toRef} className="drp-wrap">
        <span className="drp-label">Hasta:</span>
        <button
          className={`drp-trigger ${openTo ? "open" : ""}`}
          onClick={() => setOpenTo((o) => !o)}
          type="button"
        >
          <span>{to || "Cualquiera"}</span>
          <span className="drp-arrow">{openTo ? "▲" : "▼"}</span>
        </button>
        {openTo && (
          <div className="drp-dropdown">
            <ul className="drp-list">
              <li className="drp-item" onMouseDown={() => { onToChange(""); setOpenTo(false); }}>Cualquiera</li>
              {toDates.map((d) => (
                <li key={d} className={`drp-item ${to === d ? "active" : ""}`} onMouseDown={() => { onToChange(d); setOpenTo(false); }}>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <button
        className="drp-clear"
        style={{ visibility: (from || to) ? "visible" : "hidden" }}
        onClick={() => { onFromChange(""); onToChange(""); }}
      >
        Limpiar
      </button>
    </div>
  );
}
