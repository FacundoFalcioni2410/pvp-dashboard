import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import FileUpload from "./components/FileUpload";
import ClientList from "./components/ClientList";
import ClientDetail from "./components/ClientDetail";
import ProductList from "./components/ProductList";
import ProductDetail from "./components/ProductDetail";
import Charts from "./components/Charts";
import ScoreLegend from "./components/ScoreLegend";
import DateDropdown from "./components/DateDropdown";
import DatasetList from "./components/DatasetList";
import ThresholdUpload from "./components/ThresholdUpload";
import { useDashboard } from "./context/DashboardContext";
import "./App.css";


const THEMES = {
  dark: {
    "--bg": "#0f0f1a",
    "--surface": "#1a1a2e",
    "--surface2": "#22223a",
    "--surface3": "#2a2a3a",
    "--border": "#2e2e4a",
    "--text": "#e0e0f0",
    "--text-muted": "#8888aa",
  },
  light: {
    "--bg": "#f5f5f7",
    "--surface": "#ffffff",
    "--surface2": "#f0f0f5",
    "--surface3": "#e8e8f0",
    "--border": "#e0e0e8",
    "--text": "#1a1a2e",
    "--text-muted": "#6b6b8a",
  },
};

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  useEffect(() => {
    const root = document.documentElement;
    const vars = THEMES[theme] ?? THEMES.dark;
    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(k, v);
    }
    root.style.background = vars["--bg"];
    root.style.color = vars["--text"];
    document.body.style.background = vars["--bg"];
    document.body.style.color = vars["--text"];
    root.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggle = () => setTheme((t) => t === "dark" ? "light" : "dark");
  return { theme, toggle };
}

function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { dashboardData, setDateData } = useDashboard();

  const dates = dashboardData?.dates ?? [];
  const selectedDate = dashboardData?.selectedDate ?? null;
  const rows = dashboardData?.rows ?? [];
  const clients = dashboardData?.clients ?? [];
  const allDatesClients = dashboardData?.allDatesClients ?? [];
  const scatter = dashboardData?.scatter ?? [];
  const infractionChart = dashboardData?.deviationChart ?? [];
  const allDatesInfractionChart = dashboardData?.allDatesDeviationChart ?? [];
  const monthlyDeviationChart = dashboardData?.monthlyDeviationChart ?? [];
  const monthlySummary = dashboardData?.monthlySummary ?? {};
  const skuScoreChart = dashboardData?.skuScoreChart ?? [];
  const allDatesSkuScoreChart = dashboardData?.allDatesSkuScoreChart ?? [];
  const skuDeviationChart = dashboardData?.skuDeviationChart ?? [];
  const rotChart = dashboardData?.rotChart ?? [];

  const isProductMode = location.pathname.startsWith("/product/");
  const isClientMode = location.pathname.startsWith("/client/");

  const selectedClientName = isClientMode
    ? decodeURIComponent(location.pathname.split("/client/")[1])
    : null;

  const selectedSku = isProductMode
    ? decodeURIComponent(location.pathname.split("/product/")[1])
    : null;

  const selectedClient = selectedClientName
    ? clients.find((c) => c.name === selectedClientName)
    : null;

  const pctThreshold = location.state?.pctThreshold ?? null;

  const clientRows = selectedClient
    ? rows.filter((r) => {
        if (r["RAZON SOCIAL"] !== selectedClient.name) return false;
        if (pctThreshold !== null) {
          const raw = parseFloat(r["% Dif con PVP"]);
          const pct = Math.abs(raw) <= 1.5 ? Math.abs(raw) * 100 : Math.abs(raw);
          return pct >= pctThreshold;
        }
        return true;
      })
    : [];

  function handleSelectClient(client, threshold = null) {
    navigate(`/client/${encodeURIComponent(client.name)}`, { state: { pctThreshold: threshold } });
  }

  function handleSelectProduct(product) {
    navigate(`/product/${encodeURIComponent(product.sku)}`);
  }

  function handleClose() {
    navigate("/");
  }

  const activeTab = isProductMode ? "products" : "clients";

  function setTab() {
    navigate("/");
  }

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab ${activeTab === "clients" ? "active" : ""}`}
            onClick={() => activeTab !== "clients" && setTab("clients")}
          >
            Clientes
          </button>
          <button
            className={`sidebar-tab ${activeTab === "products" ? "active" : ""}`}
            onClick={() => activeTab !== "products" && navigate("/product/")}
          >
            Productos
          </button>
        </div>

        <DateDropdown dates={dates} selected={selectedDate} onChange={setDateData} />

        {activeTab === "clients" ? (
          <>
            <ClientList
              clients={clients}
              rows={rows}
              onSelect={handleSelectClient}
              selectedName={selectedClientName}
              onSelectProduct={(sku) => navigate(`/product/${encodeURIComponent(sku)}`)}
            />
          </>
        ) : (
          <ProductList
            rows={rows}
            onSelect={handleSelectProduct}
            selectedSku={selectedSku}
            onSelectClient={(clientName) => navigate(`/client/${encodeURIComponent(clientName)}`)}
          />
        )}
      </aside>

      <section className="content">
        {selectedClient ? (
          <ClientDetail
            client={{ ...selectedClient, rows: clientRows }}
            onClose={handleClose}
            pctThreshold={pctThreshold}
            onSetFilter={(t) =>
              navigate(`/client/${encodeURIComponent(selectedClient.name)}`, { state: { pctThreshold: t } })
            }
            dates={dates}
            selectedDate={selectedDate}
            onDateChange={setDateData}
            onSelectProduct={(sku) => navigate(`/product/${encodeURIComponent(sku)}`)}
          />
        ) : selectedSku ? (
          <ProductDetail
            sku={selectedSku}
            rows={rows}
            dates={dates}
            onClose={handleClose}
            onSelectClient={(clientName) => navigate(`/client/${encodeURIComponent(clientName)}`)}
          />
        ) : (
          <div style={{ display: "flex", gap: 16, minHeight: 0, flex: 1 }}>
            <div className="charts-wrap">
<Charts
                clients={clients}
                allDatesClients={allDatesClients}
                rows={rows}
                scatter={scatter}
                infractionChart={infractionChart}
                allDatesInfractionChart={allDatesInfractionChart}
                monthlySummary={monthlySummary}
                skuScoreChart={skuScoreChart}
                allDatesSkuScoreChart={allDatesSkuScoreChart}
                skuDeviationChart={skuDeviationChart}
                rotChart={rotChart}
                onSelect={handleSelectClient}
                onSelectSku={(sku) => navigate(`/product/${encodeURIComponent(sku)}`)}
              />
            </div>
            <ScoreLegend />
          </div>
        )}
      </section>
    </>
  );
}

export default function App() {
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();
  const { dashboardData, setDashboardData, loading, loadingData, thresholdCount, setThresholdCount, datasets } = useDashboard();

  const rows = dashboardData?.rows ?? [];

  if (loading) {
    return (
      <div className="app">
        <div className="full-page-loader">
          <div className="full-page-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {loadingData && (
        <div className="data-loading-overlay">
          <div className="full-page-spinner" />
        </div>
      )}
      <header className="app-header">
        <h1>Control de Precios Dashboard</h1>
        <button className="theme-toggle" onClick={toggleTheme} title="Cambiar tema">
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <FileUpload onData={setDashboardData} />
        <ThresholdUpload thresholdCount={thresholdCount} onUploaded={setThresholdCount} />
        <DatasetList />
        {rows.length > 0 && (
          <span className="row-count">{rows.length} registros</span>
        )}
      </header>

      {rows.length > 0 ? (
        <div className="main-layout">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/client/:clientName" element={<Dashboard />} />
            <Route path="/product/*" element={<Dashboard />} />
          </Routes>
        </div>
      ) : (
        <p className="welcome">Subí tu Excel para comenzar el análisis de precios.</p>
      )}
    </div>
  );
}
