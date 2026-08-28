import { useRef, useState } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import { apiFetch, API_BASE_URL } from "../api";

const DIRECT_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
const FORCE_DIRECT_UPLOAD = import.meta.env.DEV;

// Header control for the "Comparación" section's source workbook
// (Cambios TOTAL / DYLLU / OSBURK). Mirrors ThresholdUpload: upload replaces the
// whole set, ✕ clears it.
export default function CatalogChangesUpload({ count, onChanged }) {
  const inputRef = useRef();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function uploadDirect(file) {
    const form = new FormData();
    form.append("file", file);
    return apiFetch("/upload-catalog-changes", { method: "POST", body: form });
  }

  async function uploadViaBlob(file) {
    const blob = await blobUpload(file.name, file, {
      access: "private",
      handleUploadUrl: `${API_BASE_URL}/blob/upload`,
    });
    return apiFetch("/upload-catalog-changes-from-blob", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blob_url: blob.url, filename: file.name }),
    });
  }

  async function upload(file) {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const response = (!FORCE_DIRECT_UPLOAD && file.size > DIRECT_UPLOAD_MAX_BYTES)
        ? await uploadViaBlob(file)
        : await uploadDirect(file);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail ?? "Error al subir el Excel de cambios");
      await onChanged();
    } catch (e) {
      setError(e.message ?? "Error al subir el Excel de cambios");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function clear() {
    setConfirmOpen(false);
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/upload-catalog-changes", { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail ?? "Error al borrar los cambios");
      await onChanged();
    } catch (e) {
      setError(e.message ?? "Error al borrar los cambios");
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
        title="Subir Excel de Cambios (Novedades / Reemplazos / Discontinuos)"
      >
        {loading ? (
          <span className="spinner" />
        ) : (
          <>
            <span>Cambios</span>
            {count > 0 && <span className="threshold-count-badge">{count.toLocaleString()}</span>}
          </>
        )}
      </button>
      {count > 0 && !loading && (
        <button
          className="threshold-clear-btn"
          onClick={() => setConfirmOpen(true)}
          title="Borrar los cambios de catálogo cargados"
        >
          ✕
        </button>
      )}
      {error && <span className="threshold-error">{error}</span>}

      {confirmOpen && (
        <div className="confirm-overlay" onClick={() => setConfirmOpen(false)}>
          <div className="confirm-panel" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-title">¿Borrar los cambios de catálogo?</p>
            <p className="confirm-body">
              Se eliminarán las novedades, reemplazos y discontinuos cargados. Podés volver a
              subir el Excel cuando quieras.
            </p>
            <div className="confirm-actions">
              <button className="score-config-cancel" onClick={() => setConfirmOpen(false)}>Cancelar</button>
              <button className="confirm-danger" onClick={clear}>Borrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
