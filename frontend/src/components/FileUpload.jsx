import { useState, useRef } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import { apiFetch, API_BASE_URL } from "../api";

// Vercel serverless functions reject request bodies over ~4.5MB before the
// backend ever runs. Files above this go straight to Vercel Blob from the
// browser instead, and the backend only receives the resulting URL.
const DIRECT_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

export default function FileUpload({ onData }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const inputRef = useRef();

  async function uploadDirect(file) {
    const form = new FormData();
    form.append("file", file);
    return apiFetch("/upload", { method: "POST", body: form });
  }

  async function uploadViaBlob(file) {
    const blob = await blobUpload(file.name, file, {
      access: "public",
      handleUploadUrl: `${API_BASE_URL}/blob/upload`,
    });
    return apiFetch("/upload-from-blob", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blob_url: blob.url, filename: file.name }),
    });
  }

  async function upload(file) {
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    setFileName(file.name);
    const t0 = performance.now();
    console.log(`[upload] "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)} MB) — inicio`);
    try {
      const response = file.size > DIRECT_UPLOAD_MAX_BYTES
        ? await uploadViaBlob(file)
        : await uploadDirect(file);
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
