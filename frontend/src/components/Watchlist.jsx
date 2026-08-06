import { useEffect, useMemo, useRef, useState } from "react";
import MultiSelectFilter from "./MultiSelectFilter";
import Charts from "./Charts";
import { FIELDS } from "../utils/score";
import { useDashboard } from "../context/DashboardContext";

function buildParams({ date, datasetId, filters, skus }) {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (datasetId != null) params.set("dataset_id", datasetId);
  if (filters?.tipoCliente?.length) params.set("tipoCliente", filters.tipoCliente.join(","));
  if (filters?.canal?.length) params.set("canal", filters.canal.join(","));
  if (filters?.macrofamilia?.length) params.set("macrofamilia", filters.macrofamilia.join(","));
  if (filters?.rot?.length) params.set("rot", filters.rot.join(","));
  params.set("sku", skus.join(","));
  return params;
}

export default function Watchlist({ rows, selectedDate, selectedSkus, setSelectedSkus, onSelectSku, onSelectClient }) {
  const { activeDatasetId, globalFilters, scoreConfig } = useDashboard();
  const defaultThreshold = scoreConfig?.defaultThreshold ?? 15;

  const [watchData, setWatchData] = useState(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const { skuOptions, labelMap } = useMemo(() => {
    const map = {};
    for (const row of rows) {
      const sku = row[FIELDS.SKU];
      if (!sku || sku === "None" || sku === "nan") continue;
      if (!map[sku]) {
        const desc = row[FIELDS.DESCRIPCION];
        map[sku] = desc ? `${sku} — ${desc}` : sku;
      }
    }
    return { skuOptions: Object.keys(map).sort(), labelMap: map };
  }, [rows]);

  useEffect(() => {
    if (selectedSkus.length === 0) return;
    const id = ++requestId.current;

    async function run() {
      setLoading(true);
      try {
        const params = buildParams({ date: selectedDate, datasetId: activeDatasetId, filters: globalFilters, skus: selectedSkus });
        const res = await fetch(`/data?${params}`);
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const data = await res.json();
        if (id !== requestId.current) return;
        setWatchData(data);
      } catch (err) {
        if (id !== requestId.current) return;
        console.error("Failed to fetch watchlist data:", err);
        setWatchData(null);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }

    run();
  }, [selectedSkus, selectedDate, activeDatasetId, globalFilters]);

  function removeSku(sku) {
    setSelectedSkus((prev) => prev.filter((s) => s !== sku));
  }

  return (
    <div className="charts">
      <div className="watchlist-picker">
        <h3>Productos en seguimiento</h3>
        <div className="global-filters" style={{ marginTop: 8 }}>
          <MultiSelectFilter
            label="SKUs"
            options={skuOptions}
            values={selectedSkus}
            onChange={setSelectedSkus}
            labelMap={labelMap}
            showSelectAll={false}
          />
        </div>
        {selectedSkus.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {selectedSkus.map((sku) => (
              <span key={sku} className="product-threshold-tag" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {sku}
                <span style={{ cursor: "pointer", fontWeight: 700 }} onClick={() => removeSku(sku)}>✕</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {selectedSkus.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--text-muted)", fontSize: 16, padding: 40 }}>
          Elegí uno o más SKUs para ver su información.
        </div>
      ) : loading && !watchData ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, padding: 40 }}>
          <div className="full-page-spinner" />
        </div>
      ) : watchData ? (
        <Charts
          clients={watchData.clients}
          allDatesClients={watchData.allDatesClients}
          rows={watchData.rows}
          scatter={watchData.scatter}
          infractionChart={watchData.deviationChart}
          allDatesInfractionChart={watchData.allDatesDeviationChart}
          deviationThreshold={defaultThreshold}
          monthlySummary={watchData.monthlySummary}
          skuDeviationChart={watchData.skuDeviationChart}
          rotChart={watchData.rotChart}
          onSelect={onSelectClient}
          onSelectSku={onSelectSku}
        />
      ) : null}
    </div>
  );
}
