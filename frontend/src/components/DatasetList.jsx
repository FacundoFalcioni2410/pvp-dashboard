import { useState, useRef, useEffect } from "react";
import { useDashboard } from "../context/DashboardContext";

function formatDate(iso) {
  if (!iso) return "";
  return iso.replace("T", " ").slice(0, 16);
}

export default function DatasetList() {
  const { datasets, activeDatasetId, switchDataset, deleteDataset } = useDashboard();
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const ref = useRef();

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (datasets.length === 0) return null;

  const active = datasets.find((d) => d.id === activeDatasetId);

  async function handleDelete(e, id) {
    e.stopPropagation();
    setDeletingId(id);
    await deleteDataset(id);
    setDeletingId(null);
  }

  async function handleSwitch(id) {
    if (id === activeDatasetId) return;
    setOpen(false);
    await switchDataset(id);
  }

  return (
    <div className="dataset-picker" ref={ref}>
      <button
        className={`dataset-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Cambiar conjunto de datos"
      >
        <span className="dataset-trigger-icon">🗂</span>
        <span className="dataset-trigger-label">
          {active ? active.name : "Datos"}
        </span>
        <span className="dataset-count-badge">{datasets.length}</span>
        <span className="filter-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="dataset-dropdown">
          <div className="dataset-dropdown-header">Conjuntos de datos</div>
          <ul className="dataset-list">
            {datasets.map((ds) => (
              <li
                key={ds.id}
                className={`dataset-item ${ds.id === activeDatasetId ? "active" : ""}`}
                onClick={() => handleSwitch(ds.id)}
              >
                <div className="dataset-item-info">
                  <span className="dataset-item-name">{ds.name}</span>
                  <span className="dataset-item-meta">
                    {formatDate(ds.created_at)} · {ds.row_count.toLocaleString()} filas
                  </span>
                </div>
                {ds.id === activeDatasetId && (
                  <span className="dataset-active-dot" title="Activo" />
                )}
                <button
                  className="dataset-delete-btn"
                  title="Eliminar"
                  disabled={deletingId === ds.id}
                  onClick={(e) => handleDelete(e, ds.id)}
                >
                  {deletingId === ds.id ? <span className="spinner" /> : "✕"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
