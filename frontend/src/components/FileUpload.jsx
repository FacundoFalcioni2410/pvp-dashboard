import { useState, useRef } from "react";
import axios from "axios";

export default function FileUpload({ onData }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const inputRef = useRef();

  async function upload(file) {
    if (!file) return;
    setLoading(true);
    setError(null);
    setFileName(file.name);
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await axios.post("/upload", form);
      onData(data);
    } catch (e) {
      setError(e.response?.data?.detail ?? "Error al subir el archivo");
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    upload(file);
  }

  return (
    <div
      className={`upload-zone ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current.click()}
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
