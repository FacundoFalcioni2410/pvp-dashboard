import { createContext, useContext, useState, useCallback, useEffect } from "react";

const DashboardContext = createContext(null);

const DEFAULT_SCORE_BANDS = [5, 10, 15, 20, 25, 30];

export function DashboardProvider({ children }) {
  const [dashboardData, setDashboardDataState] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [activeDatasetId, setActiveDatasetId] = useState(null);
  const [thresholdCount, setThresholdCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [compareDatasetId, setCompareDatasetId] = useState(null);
  const [scoreConfig, setScoreConfigState] = useState({ bands: DEFAULT_SCORE_BANDS });

  useEffect(() => {
    let cancelled = false;

    async function loadAll(attempt = 0) {
      try {
        const [initRes, scoreRes] = await Promise.all([
          fetch("/init"),
          fetch("/score-config"),
        ]);

        if (cancelled) return;

        const scoreData = scoreRes.ok
          ? await scoreRes.json().catch(() => ({ bands: DEFAULT_SCORE_BANDS }))
          : { bands: DEFAULT_SCORE_BANDS };

        if (initRes.status === 503 || !initRes.ok && initRes.status !== 204) {
          // Backend not ready yet — retry after a short delay
          if (attempt < 10) setTimeout(() => loadAll(attempt + 1), 1500);
          else setLoading(false);
          return;
        }

        const initData = initRes.status === 204 ? null : await initRes.json().catch(() => null);

        if (initData) {
          setDatasets(initData.datasets ?? []);
          setActiveDatasetId(initData.activeDatasetId ?? null);
          setThresholdCount(initData.thresholdCount ?? 0);
          setDashboardDataState(initData);
        }
        setScoreConfigState(scoreData);
        setLoading(false);
      } catch {
        if (cancelled) return;
        if (attempt < 10) setTimeout(() => loadAll(attempt + 1), 1500);
        else setLoading(false);
      }
    }

    loadAll();
    return () => { cancelled = true; };
  }, []);

  const setScoreConfig = useCallback((config) => {
    setScoreConfigState(config);
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
    setLoadingData(true);
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
    } finally {
      setLoadingData(false);
    }
  }, [activeDatasetId]);

  const switchDataset = useCallback(async (datasetId) => {
    setLoadingData(true);
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
    } finally {
      setLoadingData(false);
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
      loadingData,
      datasets,
      activeDatasetId,
      switchDataset,
      deleteDataset,
      thresholdCount,
      setThresholdCount,
      compareDatasetId,
      setCompareDatasetId,
      scoreConfig,
      setScoreConfig,
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
