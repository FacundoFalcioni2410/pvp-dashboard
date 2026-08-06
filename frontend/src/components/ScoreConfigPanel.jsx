import { useState } from "react";
import { useDashboard } from "../context/DashboardContext";
import { scoreColor } from "../utils/score";

const MIN_BANDS = 1;
const MAX_BANDS = 12;

export default function ScoreConfigPanel({ onClose }) {
  const { scoreConfig, setScoreConfig } = useDashboard();
  const [bands, setBands] = useState(() => [...(scoreConfig?.bands ?? [5, 10, 15, 20, 25, 30])]);
  const [defaultThreshold, setDefaultThreshold] = useState(() => scoreConfig?.defaultThreshold ?? 15);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const topScore = bands.length + 2;
  // Bands are stored as excess-over-permitido (so per-SKU custom thresholds reuse
  // the same tier structure), but shown/edited as absolute % for clarity.
  const parsedDefaultThreshold = Number(defaultThreshold) || 0;
  const absBands = bands.map((b) => parsedDefaultThreshold + (Number(b) || 0));

  // While a field is focused we let the user type freely (even values that are
  // momentarily below the min, e.g. typing "3" before "30") and only clamp/cascade
  // on blur — clamping on every keystroke made it impossible to type past the min.
  const [editing, setEditing] = useState(null); // { idx, value } | null

  function handleBandChange(i, raw) {
    setEditing({ idx: i, value: raw });
  }

  function commitBand(i) {
    setEditing((current) => {
      if (!current || current.idx !== i) return null;
      const raw = current.value;
      if (raw !== "") {
        const min = i === 0 ? parsedDefaultThreshold + 1 : absBands[i - 1] + 1;
        const value = Math.max(Number(raw) || min, min);
        const nextAbs = [...absBands];
        nextAbs[i] = value;
        // Cascade: if subsequent bands are now too small, push them up
        for (let j = i + 1; j < nextAbs.length; j++) {
          if (nextAbs[j] <= nextAbs[j - 1]) nextAbs[j] = nextAbs[j - 1] + 1;
          else break;
        }
        setBands(nextAbs.map((v) => v - parsedDefaultThreshold));
      }
      return null;
    });
  }

  function addLevel() {
    if (bands.length >= MAX_BANDS) return;
    setEditing(null);
    const lastAbs = absBands.length > 0 ? absBands[absBands.length - 1] : parsedDefaultThreshold;
    setBands([...bands, lastAbs + 5 - parsedDefaultThreshold]);
  }

  function removeLevel(i) {
    if (bands.length <= MIN_BANDS) return;
    setEditing(null);
    setBands(bands.filter((_, j) => j !== i));
  }

  async function save() {
    const parsed = bands.map((b) => parseFloat(b));
    if (parsed.some(isNaN)) {
      setError("Todos los valores deben ser números");
      return;
    }
    for (let i = 1; i < parsed.length; i++) {
      if (parsed[i] <= parsed[i - 1]) {
        setError(`El nivel ${i + 1} debe tener un % mayor al del nivel ${i}`);
        return;
      }
    }
    const parsedThreshold = parseFloat(defaultThreshold);
    if (isNaN(parsedThreshold) || parsedThreshold <= 0) {
      setError("El % permitido por defecto debe ser un número mayor a 0");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/score-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bands: parsed, defaultThreshold: parsedThreshold }),
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

  // Each row shows its full absolute % range; only the upper bound is editable
  // (internally stored as excess-over-permitido so per-SKU thresholds reuse it).
  const rows = [
    { score: topScore, editable: false, label: `< ${parsedDefaultThreshold}% (permitido)` },
    ...bands.map((b, i) => ({
      score: topScore - 1 - i,
      editable: true,
      idx: i,
      prefix: i === 0 ? `≥ ${parsedDefaultThreshold}% – < ` : `≥ ${absBands[i - 1]}% – < `,
      band: absBands[i],
      min: i === 0 ? parsedDefaultThreshold + 1 : absBands[i - 1] + 1,
    })),
    { score: 1, editable: false, label: `≥ ${absBands[absBands.length - 1]}%` },
  ];

  return (
    <div className="score-config-overlay" onClick={onClose}>
      <div className="score-config-panel" onClick={(e) => e.stopPropagation()}>
        <div className="score-config-header">
          <span className="score-config-title">Configuración de Score</span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <p className="score-config-subtitle">
          % de desvío absoluto. Si un SKU tiene un umbral propio cargado, estos rangos se corren
          igual cantidad de puntos respecto a su permitido.
        </p>

        <div className="score-config-row score-config-default-threshold">
          <span className="score-config-op">% permitido por defecto (sin umbrales cargados)</span>
          <div className="score-config-input-row">
            <input
              className="score-config-input"
              type="number"
              min={0.1}
              step={0.5}
              value={defaultThreshold}
              onChange={(e) => setDefaultThreshold(e.target.value)}
            />
            <span className="score-config-unit">%</span>
          </div>
        </div>

        <div className="score-config-table">
          <div className="score-config-thead">
            <span>Score</span>
            <span>Condición</span>
          </div>
          {rows.map(({ score, label, editable, band, idx, prefix, min }) => (
            <div key={score} className="score-config-row">
              <span className="score-badge" style={{ background: scoreColor(score, topScore) }}>{score}</span>
              {editable ? (
                <div className="score-config-input-row">
                  <span className="score-config-op">{prefix}</span>
                  <input
                    className="score-config-input"
                    type="number"
                    min={min}
                    step={1}
                    value={editing?.idx === idx ? editing.value : band}
                    onChange={(e) => handleBandChange(idx, e.target.value)}
                    onBlur={() => commitBand(idx)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  />
                  <span className="score-config-unit">%</span>
                  <button
                    type="button"
                    className="score-config-remove-btn"
                    onClick={() => removeLevel(idx)}
                    disabled={bands.length <= MIN_BANDS}
                    title="Quitar nivel"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <span className="score-config-fixed">{label}</span>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          className="score-config-add-btn"
          onClick={addLevel}
          disabled={bands.length >= MAX_BANDS}
        >
          + Agregar nivel
        </button>

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
