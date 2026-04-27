import { useState } from "react";
import { useDashboard } from "../context/DashboardContext";
import { scoreClass } from "../utils/score";

export default function ScoreConfigPanel({ onClose }) {
  const { scoreConfig, setScoreConfig } = useDashboard();
  const [bands, setBands] = useState(() => [...(scoreConfig?.bands ?? [5, 10, 15, 20, 25, 30])]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  function updateBand(i, raw) {
    if (raw === "") return;
    const min = i === 0 ? 1 : (Number(bands[i - 1]) || 0) + 1;
    const value = Math.max(Number(raw), min);
    const next = [...bands];
    next[i] = value;
    // Cascade: if subsequent bands are now too small, push them up
    for (let j = i + 1; j < next.length; j++) {
      if (Number(next[j]) <= Number(next[j - 1])) next[j] = Number(next[j - 1]) + 1;
      else break;
    }
    setBands(next);
  }

  async function save() {
    const parsed = bands.map((b) => parseFloat(b));
    if (parsed.some(isNaN)) {
      setError("Todos los valores deben ser números");
      return;
    }
    for (let i = 1; i < parsed.length; i++) {
      if (parsed[i] <= parsed[i - 1]) {
        setError(`El umbral del score ${7 - i} (${parsed[i]}%) debe ser mayor al del score ${8 - i} (${parsed[i - 1]}%)`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/score-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bands: parsed }),
      });
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (_) {}
      if (!res.ok) throw new Error(data.detail ?? `Error ${res.status}`);
      setScoreConfig(data);
      setSuccess(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Each row shows its full range; only the upper bound (bands[i]) is editable.
  // The lower bound is derived from the previous band (or 0 for score 7).
  const rows = [
    { score: 8, editable: false, label: "< permitido" },
    { score: 7, editable: true,  idx: 0, prefix: "< ",           band: bands[0], min: 1 },
    ...bands.slice(1).map((b, i) => ({
      score: 6 - i,
      editable: true,
      idx: i + 1,
      prefix: `≥ ${bands[i]}% – < `,
      band: b,
      min: (Number(bands[i]) || 0) + 1,
    })),
    { score: 1, editable: false, label: `≥ ${bands[bands.length - 1]}%` },
  ];

  return (
    <div className="score-config-overlay" onClick={onClose}>
      <div className="score-config-panel" onClick={(e) => e.stopPropagation()}>
        <div className="score-config-header">
          <span className="score-config-title">Configuración de Score</span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <p className="score-config-subtitle">Exceso sobre el % permitido por SKU</p>

        <div className="score-config-table">
          <div className="score-config-thead">
            <span>Score</span>
            <span>Condición</span>
          </div>
          {rows.map(({ score, label, editable, band, idx, prefix, min }) => (
            <div key={score} className="score-config-row">
              <span className={`score-badge ${scoreClass(score)}`}>{score}</span>
              {editable ? (
                <div className="score-config-input-row">
                  <span className="score-config-op">{prefix}</span>
                  <input
                    className="score-config-input"
                    type="number"
                    min={min}
                    step={1}
                    value={band}
                    onChange={(e) => updateBand(idx, e.target.value)}
                  />
                  <span className="score-config-unit">%</span>
                </div>
              ) : (
                <span className="score-config-fixed">{label}</span>
              )}
            </div>
          ))}
        </div>

        {error && <p className="score-config-error">{error}</p>}
        {success && <p className="score-config-success">Guardado correctamente</p>}

        <div className="score-config-actions">
          <button className="score-config-cancel" onClick={onClose}>Cancelar</button>
          <button className="score-config-save" onClick={save} disabled={saving}>
            {saving ? <span className="spinner" /> : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
