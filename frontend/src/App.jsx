import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import FileUpload from "./components/FileUpload";
import ClientList from "./components/ClientList";
import ClientDetail from "./components/ClientDetail";
import Charts from "./components/Charts";
import ScoreLegend from "./components/ScoreLegend";
import DateDropdown from "./components/DateDropdown";
import { useDashboard } from "./context/DashboardContext";
import "./App.css";

function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { dashboardData, setDateData } = useDashboard();

  const dates = dashboardData?.dates ?? [];
  const selectedDate = dashboardData?.selectedDate ?? null;
  const rows = dashboardData?.rows ?? [];
  const clients = dashboardData?.clients ?? [];
  const scatter = dashboardData?.scatter ?? [];
  const infractionChart = dashboardData?.infractionChart ?? [];
  const highDeviationChart = dashboardData?.highDeviationChart ?? [];

  const selectedClientName = location.pathname.startsWith("/client/")
    ? decodeURIComponent(location.pathname.split("/client/")[1])
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

  function handleSelect(client, pctThreshold = null) {
    navigate(`/client/${encodeURIComponent(client.name)}`, { state: { pctThreshold } });
  }

  function handleClose() {
    navigate("/");
  }

  return (
    <>
      <aside className="sidebar">
        <h2 className="section-title">Clientes</h2>
        <DateDropdown dates={dates} selected={selectedDate} onChange={setDateData} />
        <ClientList
          clients={clients}
          rows={rows}
          onSelect={handleSelect}
          selectedName={selectedClientName}
        />
      </aside>

      <section className="content">
        {selectedClient ? (
          <ClientDetail
            client={{ ...selectedClient, rows: clientRows }}
            onClose={handleClose}
            pctThreshold={pctThreshold}
            onSetFilter={(t) => navigate(`/client/${encodeURIComponent(selectedClient.name)}`, { state: { pctThreshold: t } })}
            dates={dates}
            selectedDate={selectedDate}
            onDateChange={setDateData}
          />
        ) : (
          <div style={{ display: "flex", gap: 16, minHeight: 0, flex: 1 }}>
            <div className="charts-wrap">
              <Charts
                key={selectedDate}
                clients={clients}
                rows={rows}
                scatter={scatter}
                infractionChart={infractionChart}
                highDeviationChart={highDeviationChart}
                onSelect={handleSelect}
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
  const { dashboardData, setDashboardData, loading } = useDashboard();

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
      <header className="app-header">
        <h1>Control de Precios Dashboard</h1>
        <FileUpload onData={setDashboardData} />
        {rows.length > 0 && (
          <span className="row-count">{rows.length} registros</span>
        )}
      </header>

      {rows.length > 0 ? (
        <div className="main-layout">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/client/:clientName" element={<Dashboard />} />
          </Routes>
        </div>
      ) : (
        <p className="welcome">Subí tu Excel para comenzar el análisis de precios.</p>
      )}
    </div>
  );
}
