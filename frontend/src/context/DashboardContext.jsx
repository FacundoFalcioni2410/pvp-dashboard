import { createContext, useContext, useState, useCallback, useEffect } from "react";

const DashboardContext = createContext(null);

export function DashboardProvider({ children }) {
  const [dashboardData, setDashboardDataState] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [activeDatasetId, setActiveDatasetId] = useState(null);
  const [thresholdCount, setThresholdCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [compareDatasetId, setCompareDatasetId] = useState(null);

  useEffect(() => {
    fetch("/init")
      .then((res) => {
        if (res.status === 204) return null;
        return res.json();
      })
      .then((data) => {
        if (data) {
          setDatasets(data.datasets ?? []);
          setActiveDatasetId(data.activeDatasetId ?? null);
          setThresholdCount(data.thresholdCount ?? 0);
          setDashboardDataState(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setDashboardData = useCallback((data) => {
    setDatasets(data.datasets ?? []);
    setActiveDatasetId(data.activeDatasetId ?? null);
    setThresholdCount(data.thresholdCount ?? 0);
    setDashboardDataState({ 
      ...data, 
      selectedDate: data.dates?.[0] ?? null,
      sheets: data.sheets ?? [],
    });
  }, []);

  const setDateData = useCallback(async (date, datasetId) => {
    try {
      const id = datasetId ?? activeDatasetId;
      const params = new URLSearchParams({ date });
      if (id != null) params.set("dataset_id", id);
      const res = await fetch(`/data?${params}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setDashboardDataState((prev) => ({
        ...prev,
        ...data,
        dates: prev?.dates ?? data.dates ?? [],
        selectedDate: date,
        datasets: prev?.datasets ?? data.datasets ?? [],
        activeDatasetId: id,
        sheets: data.sheets ?? prev?.sheets ?? [],
      }));
    } catch (err) {
      console.error("Failed to fetch date data:", err);
    }
  }, [activeDatasetId]);

  const switchDataset = useCallback(async (datasetId) => {
    try {
      const res = await fetch(`/data?dataset_id=${datasetId}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setActiveDatasetId(datasetId);
      setDashboardDataState({
        ...data,
        selectedDate: data.selectedDate ?? data.dates?.[0] ?? null,
        datasets,
        activeDatasetId: datasetId,
        sheets: data.sheets ?? [],
      });
    } catch (err) {
      console.error("Failed to switch dataset:", err);
    }
  }, [datasets]);

  const deleteDataset = useCallback(async (datasetId) => {
    try {
      const res = await fetch(`/datasets/${datasetId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const { datasets: newDatasets } = await res.json();
      setDatasets(newDatasets);

      if (activeDatasetId === datasetId) {
        if (newDatasets.length === 0) {
          setActiveDatasetId(null);
          setDashboardDataState(null);
        } else {
          const nextId = newDatasets[0].id;
          const dataRes = await fetch(`/data?dataset_id=${nextId}`);
          if (dataRes.ok) {
            const data = await dataRes.json();
            setActiveDatasetId(nextId);
            setDashboardDataState({
              ...data,
              selectedDate: data.selectedDate ?? data.dates?.[0] ?? null,
              datasets: newDatasets,
              activeDatasetId: nextId,
            });
          }
        }
      }
    } catch (err) {
      console.error("Failed to delete dataset:", err);
    }
  }, [activeDatasetId]);

  return (
    <DashboardContext.Provider value={{
      dashboardData,
      setDashboardData,
      setDateData,
      loading,
      datasets,
      activeDatasetId,
      switchDataset,
      deleteDataset,
      thresholdCount,
      setThresholdCount,
      compareDatasetId,
      setCompareDatasetId,
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error("useDashboard must be used within DashboardProvider");
  return context;
}
