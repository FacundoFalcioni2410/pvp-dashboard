import { useState, useRef, useEffect } from "react";
import { scoreColor } from "../utils/score";
import { useDashboard } from "../context/DashboardContext";

export default function ScoreLegend({ onEdit }) {
  const { scoreConfig } = useDashboard();
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const bands = scoreConfig?.bands ?? [5, 10, 15, 20, 25, 30];
  const defaultThreshold = scoreConfig?.defaultThreshold ?? 15;
  const topScore = bands.length + 2;
  // Bands are stored as excess-over-permitido; show the absolute % equivalent.
  const absBands = bands.map((b) => defaultThreshold + (Number(b) || 0));

  const rows = [
    { range: `< ${defaultThreshold}% (permitido)`, score: topScore },
    ...absBands.map((b, i) => ({
      range: i === 0 ? `≥ ${defaultThreshold}% – < ${b}%` : `≥ ${absBands[i - 1]}% – < ${b}%`,
      score: topScore - 1 - i,
    })),
    { range: `≥ ${absBands[absBands.length - 1]}%`, score: 1 },
  ];

  return (
    <div className="score-picker" ref={ref}>
      <button
        className={`threshold-btn ${open ? "open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={`Referencia de score · Permitido por defecto: ${defaultThreshold}%`}
      >
        📊 Score
        <span className="threshold-count-badge">{defaultThreshold}%</span>
        <span className="filter-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="score-legend-dropdown">
          <p className="legend-title">Referencia de score</p>
          <p className="legend-subtitle">
            % de desvío absoluto — permitido por defecto <strong>{defaultThreshold}%</strong>
          </p>
          <div className="legend-rows">
            {rows.map(({ range, score }) => (
              <div key={score} className="legend-row">
                <span className="legend-range">{range}</span>
                <div className="legend-bar-wrap">
                  <div
                    className="legend-bar"
                    style={{
                      width: `${(score / topScore) * 100}%`,
                      background: scoreColor(score, topScore),
                    }}
                  />
                </div>
                <span className="score-badge" style={{ background: scoreColor(score, topScore) }}>{score}</span>
              </div>
            ))}
          </div>
          <button
            className="legend-edit-btn"
            onClick={() => {
              setOpen(false);
              onEdit?.();
            }}
          >
            ✎ Editar
          </button>
        </div>
      )}
    </div>
  );
}
