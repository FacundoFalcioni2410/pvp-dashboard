import { createContext, useContext, useState, useCallback, useEffect } from "react";

const DashboardContext = createContext(null);

export function DashboardProvider({ children }) {
  const [dashboardData, setDashboardDataState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/init")
      .then((res) => {
        if (res.status === 204) return null;
        return res.json();
      })
      .then((data) => {
        if (data) setDashboardDataState(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setDashboardData = useCallback((data) => {
    setDashboardDataState({ ...data, selectedDate: data.dates?.[0] ?? null });
  }, []);

  const setDateData = useCallback(async (date) => {
    try {
      const res = await fetch(`/data?date=${encodeURIComponent(date)}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setDashboardDataState((prev) => ({ ...data, dates: prev?.dates ?? [], selectedDate: date }));
    } catch (err) {
      console.error("Failed to fetch date data:", err);
    }
  }, []);

  return (
    <DashboardContext.Provider value={{ dashboardData, setDashboardData, setDateData, loading }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error("useDashboard must be used within DashboardProvider");
  return context;
}
