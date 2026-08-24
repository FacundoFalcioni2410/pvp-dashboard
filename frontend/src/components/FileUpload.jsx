import { useState, useRef } from "react";
import { apiFetch } from "../api";

export default function FileUpload({ onData }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const inputRef = useRef();

  async function upload(file) {
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    setFileName(file.name);
    const form = new FormData();
    form.append("file", file);
    const t0 = performance.now();
    console.log(`[upload] "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)} MB) — inicio`);
    try {
      const response = await apiFetch("/upload", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail ?? "Error al subir el archivo");
      const seconds = ((performance.now() - t0) / 1000).toFixed(2);
      console.log(`[upload] "${file.name}" — listo en ${seconds}s`);
      onData(data);
    } catch (e) {
      const seconds = ((performance.now() - t0) / 1000).toFixed(2);
      console.log(`[upload] "${file.name}" — error a los ${seconds}s`);
      setError(e.message ?? "Error al subir el archivo");
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (loading) return;
    const file = e.dataTransfer.files[0];
    upload(file);
  }

  return (
    <div
      className={`upload-zone ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => { e.preventDefault(); if (!loading) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !loading && inputRef.current.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => upload(e.target.files[0])}
      />
      {loading ? (
        <p className="upload-hint">Procesando <span className="spinner" /></p>
      ) : (
        <>
          <span className="upload-icon">📂</span>
          <p className="upload-hint">
            {fileName
              ? `Archivo cargado: ${fileName}`
              : "Arrastrá o hacé clic para subir el Excel"}
          </p>
        </>
      )}
      {error && <p className="upload-error">{error}</p>}
    </div>
  );
}
