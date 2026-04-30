import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

const DashboardContext = createContext(null);

const DEFAULT_SCORE_BANDS = [5, 10, 15, 20, 25, 30];
const DEFAULT_FILTERS = { tipoCliente: [], canal: "", macrofamilia: "", rot: "" };

export function DashboardProvider({ children }) {
  const [dashboardData, setDashboardDataState] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [activeDatasetId, setActiveDatasetId] = useState(null);
  const [thresholdCount, setThresholdCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [compareDatasetId, setCompareDatasetId] = useState(null);
  const [scoreConfig, setScoreConfigState] = useState({ bands: DEFAULT_SCORE_BANDS });
  const [globalFilters, setGlobalFiltersState] = useState(DEFAULT_FILTERS);
  const [filterOptions, setFilterOptions] = useState({ clientes: [], canales: [], macrofamilias: [], rots: [] });

  // Ref so fetch callbacks always see the latest filters without recreating themselves
  const globalFiltersRef = useRef(DEFAULT_FILTERS);
  useEffect(() => { globalFiltersRef.current = globalFilters; }, [globalFilters]);

  const activeDatasetIdRef = useRef(null);
  useEffect(() => { activeDatasetIdRef.current = activeDatasetId; }, [activeDatasetId]);

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

        if (initRes.status === 503 || (!initRes.ok && initRes.status !== 204)) {
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
          if (initData.filterOptions) setFilterOptions(initData.filterOptions);
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

  const setScoreConfig = useCallback(async (config) => {
    setScoreConfigState(config);
    const id = activeDatasetIdRef.current;
    if (id == null) return;
    setLoadingData(true);
    try {
      const selectedDate = dashboardDataRef.current?.selectedDate ?? null;
      const params = buildParams(selectedDate, id, globalFiltersRef.current);
      const res = await fetch(`/data?${params}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      if (data.filterOptions) setFilterOptions(data.filterOptions);
      setDashboardDataState((prev) => ({
        ...prev,
        ...data,
        dates: prev?.dates ?? data.dates ?? [],
        datasets: prev?.datasets ?? data.datasets ?? [],
        activeDatasetId: id,
        sheets: data.sheets ?? prev?.sheets ?? [],
      }));
    } catch (err) {
      console.error("Failed to refresh after score config change:", err);
    } finally {
      setLoadingData(false);
    }
  }, []);

  const setDashboardData = useCallback((data) => {
    setDatasets(data.datasets ?? []);
    setActiveDatasetId(data.activeDatasetId ?? null);
    setThresholdCount(data.thresholdCount ?? 0);
    setGlobalFiltersState(DEFAULT_FILTERS);
    globalFiltersRef.current = DEFAULT_FILTERS;
    if (data.filterOptions) setFilterOptions(data.filterOptions);
    setDashboardDataState({
      ...data,
      selectedDate: data.dates?.[0] ?? null,
      sheets: data.sheets ?? [],
    });
  }, []);

  function buildParams(date, datasetId, filters) {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (datasetId != null) params.set("dataset_id", datasetId);
    if (filters.tipoCliente && filters.tipoCliente.length > 0) params.set("tipoCliente", filters.tipoCliente.join(","));
    if (filters.canal) params.set("canal", filters.canal);
    if (filters.macrofamilia) params.set("macrofamilia", filters.macrofamilia);
    if (filters.rot) params.set("rot", filters.rot);
    return params;
  }

  const setDateData = useCallback(async (date, datasetId) => {
    setLoadingData(true);
    try {
      const id = datasetId ?? activeDatasetIdRef.current;
      const params = buildParams(date, id, globalFiltersRef.current);
      const res = await fetch(`/data?${params}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      if (data.filterOptions) setFilterOptions(data.filterOptions);
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
  }, []);

  const setGlobalFilter = useCallback(async (key, value) => {
    const newFilters = key === "__clear__" ? DEFAULT_FILTERS : { ...globalFiltersRef.current, [key]: value };
    setGlobalFiltersState(newFilters);
    globalFiltersRef.current = newFilters;

    setLoadingData(true);
    try {
      const id = activeDatasetIdRef.current;
      const selectedDate = dashboardDataRef.current?.selectedDate ?? null;
      const params = buildParams(selectedDate, id, newFilters);
      const res = await fetch(`/data?${params}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      if (data.filterOptions) setFilterOptions(data.filterOptions);
      setDashboardDataState((prev) => ({
        ...prev,
        ...data,
        dates: prev?.dates ?? data.dates ?? [],
        datasets: prev?.datasets ?? data.datasets ?? [],
        activeDatasetId: id,
        sheets: data.sheets ?? prev?.sheets ?? [],
      }));
    } catch (err) {
      console.error("Failed to apply filter:", err);
    } finally {
      setLoadingData(false);
    }
  }, []);

  // Ref to access current dashboardData inside setGlobalFilter
  const dashboardDataRef = useRef(null);
  useEffect(() => { dashboardDataRef.current = dashboardData; }, [dashboardData]);

  const switchDataset = useCallback(async (datasetId) => {
    setLoadingData(true);
    setGlobalFiltersState(DEFAULT_FILTERS);
    globalFiltersRef.current = DEFAULT_FILTERS;
    try {
      const res = await fetch(`/data?dataset_id=${datasetId}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setActiveDatasetId(datasetId);
      if (data.filterOptions) setFilterOptions(data.filterOptions);
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
            if (data.filterOptions) setFilterOptions(data.filterOptions);
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
      globalFilters,
      setGlobalFilter,
      filterOptions,
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
