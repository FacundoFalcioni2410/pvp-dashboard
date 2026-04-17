import { useRef, useState } from "react";
import axios from "axios";

export default function ThresholdUpload({ thresholdCount, onUploaded }) {
  const inputRef = useRef();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function upload(file) {
    if (!file) return;
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await axios.post("/upload-thresholds", form);
      onUploaded(data.total);
    } catch (e) {
      setError(e.response?.data?.detail ?? "Error al subir umbrales");
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
      {error && <span className="threshold-error">{error}</span>}
    </div>
  );
}
