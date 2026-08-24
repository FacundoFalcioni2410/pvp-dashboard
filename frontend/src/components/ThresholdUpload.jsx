import { useRef, useState } from "react";
import { apiFetch } from "../api";

export default function ThresholdUpload({ thresholdCount, onUploaded }) {
  const inputRef = useRef();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function upload(file) {
    if (!file) return;
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await apiFetch("/upload-thresholds", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail ?? "Error al subir umbrales");
      onUploaded(data.total);
    } catch (e) {
      setError(e.message ?? "Error al subir umbrales");
    } finally {
      setLoading(false);
    }
  }

  async function clear() {
    setConfirmOpen(false);
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/upload-thresholds", { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail ?? "Error al deshabilitar umbrales");
      onUploaded(data.total);
    } catch (e) {
      setError(e.message ?? "Error al deshabilitar umbrales");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="threshold-upload">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => upload(e.target.files[0])}
      />
      <button
        className="threshold-btn"
        onClick={() => inputRef.current.click()}
        disabled={loading}
        title="Subir Excel con umbrales permitidos por SKU"
      >
        {loading ? (
          <span className="spinner" />
        ) : (
          <>
            <span>% Umbrales</span>
            {thresholdCount > 0 && (
              <span className="threshold-count-badge">{thresholdCount.toLocaleString()}</span>
            )}
          </>
        )}
      </button>
      {thresholdCount > 0 && !loading && (
        <button
          className="threshold-clear-btn"
          onClick={() => setConfirmOpen(true)}
          title="Deshabilitar umbrales cargados (volver al valor por defecto)"
        >
          ✕
        </button>
      )}
      {error && <span className="threshold-error">{error}</span>}

      {confirmOpen && (
        <div className="confirm-overlay" onClick={() => setConfirmOpen(false)}>
          <div className="confirm-panel" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-title">¿Deshabilitar umbrales?</p>
            <p className="confirm-body">
              Se borrarán los umbrales cargados y se usará el valor por defecto. Podés volver a
              habilitarlos subiendo el Excel de nuevo.
            </p>
            <div className="confirm-actions">
              <button className="score-config-cancel" onClick={() => setConfirmOpen(false)}>Cancelar</button>
              <button className="confirm-danger" onClick={clear}>Deshabilitar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
