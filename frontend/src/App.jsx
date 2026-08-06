import { useState, useEffect, useRef } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import FileUpload from "./components/FileUpload";
import ClientList from "./components/ClientList";
import ClientDetail from "./components/ClientDetail";
import ProductList from "./components/ProductList";
import ProductDetail from "./components/ProductDetail";
import Charts from "./components/Charts";
import ScoreLegend from "./components/ScoreLegend";
import ScoreConfigPanel from "./components/ScoreConfigPanel";
import DateDropdown from "./components/DateDropdown";
import DatasetList from "./components/DatasetList";
import ThresholdUpload from "./components/ThresholdUpload";
import Watchlist from "./components/Watchlist";
import WatchlistSidebar from "./components/WatchlistSidebar";
import MultiSelectFilter from "./components/MultiSelectFilter";
import { useDashboard } from "./context/DashboardContext";
import { useWatchlistSkus } from "./hooks/useWatchlistSkus";
import "./App.css";

function FilterDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef();
  const inputRef = useRef();

  useEffect(() => {
    function handler(e) { if (!wrapRef.current?.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  function select(v) { onChange(v); setQuery(""); setOpen(false); }

  return (
    <div ref={wrapRef} className="gf-wrap">
      <button
        className={`gf-trigger ${open ? "open" : ""} ${value ? "gf-active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className="gf-label">{label}</span>
        <span className={`gf-value ${!value ? "placeholder" : ""}`}>{value || "Todos"}</span>
        {value && (
          <span className="gf-clear" onMouseDown={(e) => { e.stopPropagation(); onChange(""); setOpen(false); }}>✕</span>
        )}
        <span className="gf-arrow">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="gf-dropdown">
          <div className="filter-search-wrap">
            <input
              ref={inputRef}
              className="filter-search-input"
              type="text"
              placeholder={`Buscar…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && filtered.length === 1) select(filtered[0]);
              }}
            />
          </div>
          <ul className="filter-suggestions">
            <li className={`filter-suggestion-item ${!value ? "active" : ""}`} onMouseDown={() => select("")}>Todos</li>
            {filtered.slice(0, 50).map((o) => (
              <li key={o} className={`filter-suggestion-item ${value === o ? "active" : ""}`} onMouseDown={() => select(o)}>{o}</li>
            ))}
            {filtered.length > 50 && (
              <li className="filter-suggestion-more">+{filtered.length - 50} más — refiná la búsqueda</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function GlobalFiltersBar({ filterOptions, globalFilters, setGlobalFilter }) {
  const hasActive = Object.values(globalFilters).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v)));
  return (
    <div className={`global-filters ${hasActive ? "has-active" : ""}`}>
      <span className="gf-title">Filtros</span>
      <MultiSelectFilter
        label="Tipo de cliente"
        options={filterOptions.tipoCliente ?? []}
        values={globalFilters.tipoCliente ?? []}
        onChange={(v) => setGlobalFilter("tipoCliente", v)}
        labelMap={{ "#ND": "SIN CLASIFICAR" }}
      />
      <MultiSelectFilter
        label="Canal"
        options={filterOptions.canales ?? []}
        values={globalFilters.canal ?? []}
        onChange={(v) => setGlobalFilter("canal", v)}
      />
      <MultiSelectFilter
        label="Macrofamilia"
        options={filterOptions.macrofamilias ?? []}
        values={globalFilters.macrofamilia ?? []}
        onChange={(v) => setGlobalFilter("macrofamilia", v)}
      />
      <MultiSelectFilter
        label="Rotación"
        options={filterOptions.rots ?? []}
        values={globalFilters.rot ?? []}
        onChange={(v) => setGlobalFilter("rot", v)}
      />
      {hasActive && (
        <button
          className="gf-clear-all"
          onClick={() => setGlobalFilter("__clear__", "")}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}


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
  const { dashboardData, setDateData, scoreConfig } = useDashboard();
  const defaultThreshold = scoreConfig?.defaultThreshold ?? 15;
  const [watchlistSkus, setWatchlistSkus] = useWatchlistSkus();

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
  const skuDeviationChart = dashboardData?.skuDeviationChart ?? [];
  const rotChart = dashboardData?.rotChart ?? [];

  const isProductMode = location.pathname.startsWith("/product/");
  const isClientMode = location.pathname.startsWith("/client/");
  const isWatchlistMode = location.pathname === "/watchlist";

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

  const activeTab = isWatchlistMode ? "watchlist" : isProductMode ? "products" : "clients";

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
          <button
            className={`sidebar-tab ${activeTab === "watchlist" ? "active" : ""}`}
            onClick={() => activeTab !== "watchlist" && navigate("/watchlist")}
          >
            Seguimiento
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
        ) : activeTab === "products" ? (
          <ProductList
            rows={rows}
            onSelect={handleSelectProduct}
            selectedSku={selectedSku}
            onSelectClient={(clientName) => navigate(`/client/${encodeURIComponent(clientName)}`)}
          />
        ) : (
          <WatchlistSidebar
            rows={rows}
            selectedSkus={watchlistSkus}
            onRemove={(sku) => setWatchlistSkus((prev) => prev.filter((s) => s !== sku))}
            onSelectSku={(sku) => navigate(`/product/${encodeURIComponent(sku)}`)}
          />
        )}
      </aside>

      <section className="content">
        {isWatchlistMode ? (
          <div className="charts-wrap">
            <Watchlist
              rows={rows}
              selectedDate={selectedDate}
              selectedSkus={watchlistSkus}
              setSelectedSkus={setWatchlistSkus}
              onSelectSku={(sku) => navigate(`/product/${encodeURIComponent(sku)}`)}
              onSelectClient={handleSelectClient}
            />
          </div>
        ) : selectedClient ? (
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
          <div className="charts-wrap">
            <Charts
              clients={clients}
              allDatesClients={allDatesClients}
              rows={rows}
              scatter={scatter}
              infractionChart={infractionChart}
              allDatesInfractionChart={allDatesInfractionChart}
              deviationThreshold={defaultThreshold}
              monthlySummary={monthlySummary}
              skuDeviationChart={skuDeviationChart}
              rotChart={rotChart}
              onSelect={handleSelectClient}
              onSelectSku={(sku) => navigate(`/product/${encodeURIComponent(sku)}`)}
            />
          </div>
        )}
      </section>
    </>
  );
}

export default function App() {
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();
  const [showScoreConfig, setShowScoreConfig] = useState(false);
  const {
    dashboardData, setDashboardData, loading, loadingData,
    thresholdCount, refreshThresholdCount, datasets,
    globalFilters, setGlobalFilter, filterOptions,
  } = useDashboard();

  const rows = dashboardData?.rows ?? [];
  const hasDataset = dashboardData !== null && (dashboardData.dates?.length > 0 || dashboardData.clients?.length > 0);

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
        <ThresholdUpload thresholdCount={thresholdCount} onUploaded={refreshThresholdCount} />
        <ScoreLegend onEdit={() => setShowScoreConfig(true)} />
        <DatasetList />
        {rows.length > 0 && (
          <span className="row-count">{rows.length} registros</span>
        )}
      </header>

      {showScoreConfig && <ScoreConfigPanel onClose={() => setShowScoreConfig(false)} />}

      {hasDataset && (
        <GlobalFiltersBar
          filterOptions={filterOptions}
          globalFilters={globalFilters}
          setGlobalFilter={setGlobalFilter}
        />
      )}

      {hasDataset ? (
        <div className="main-layout">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/client/:clientName" element={<Dashboard />} />
            <Route path="/product/*" element={<Dashboard />} />
            <Route path="/watchlist" element={<Dashboard />} />
          </Routes>
        </div>
      ) : (
        <p className="welcome">Subí tu Excel para comenzar el análisis de precios.</p>
      )}
    </div>
  );
}
