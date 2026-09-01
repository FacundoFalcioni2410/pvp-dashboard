import { useMemo, useState } from "react";
import { useDashboard } from "../context/DashboardContext";

/* ---------- icons (stroke, 24x24) ---------- */
const ICON_PATHS = {
  grinder: '<circle cx="9" cy="15" r="5"/><path d="M9 10V4l7-1v4l-7 2"/><path d="M13 6l6-1"/>',
  drill: '<rect x="3" y="10" width="9" height="6" rx="1"/><path d="M12 12h7l3 2-3 2h-7"/><path d="M6 10V7h3v3"/>',
  saw: '<path d="M3 17l16-11"/><path d="M6 17l1.5-2.5L9 17l1.5-2.5L12 17l1.5-2.5L15 17l1.5-2.5L18 17"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 1 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2 2.6-2.6z"/>',
  impact: '<rect x="9" y="4" width="6" height="9" rx="1"/><path d="M12 13v3"/><path d="M8 16h8l-1 4H9z"/>',
  light: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3 11.2c.6.4 1 1.1 1 1.8h4c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/>',
  spray: '<rect x="8" y="9" width="8" height="11" rx="1"/><path d="M10 9V6a2 2 0 0 1 2-2h1"/><path d="M16 6l3-2M16 9l3.5-.5M15 4l2-2.5"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 13h15a3 3 0 1 1-3 3"/><path d="M3 18h8a2.5 2.5 0 1 0-2.5-2.5"/>',
  flame: '<path d="M12 2s5 4.5 5 9a5 5 0 0 1-10 0c0-1.2.5-2 1-3 .3 1 1 1.5 1.5 1 .5-2 -.5-4 2.5-7z"/>',
  garden: '<path d="M4 20c6-1 10-5 12-12"/><path d="M9 20c2-4 2-9 7-14"/><circle cx="18" cy="6" r="2"/>',
  battery: '<rect x="3" y="8" width="16" height="9" rx="1.5"/><path d="M19 11v3"/><path d="M7 8v-2h6v2"/>',
  charger: '<rect x="3" y="8" width="16" height="9" rx="1.5"/><path d="M19 11v3"/><path d="M11 10l-2 3h3l-2 3"/>',
  rotary: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  sander: '<rect x="4" y="6" width="16" height="9" rx="1"/><path d="M8 15v3M16 15v3M6 18h12"/><path d="M8 10h8M8 12.5h8"/>',
  meter: '<rect x="4" y="4" width="16" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/><path d="M8 12l2.5-2 2 2L16 9"/>',
  disc: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.4"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/>',
  pliers: '<path d="M6 4l6 8v8"/><path d="M18 4l-6 8"/><path d="M9 20h6"/>',
  screwdriver: '<path d="M14 3l7 7-2 2-7-7z"/><path d="M12.5 7.5L5 15l-1 4 4-1 7.5-7.5"/>',
  clamp: '<rect x="5" y="3" width="4" height="18" rx="1"/><path d="M9 7h9v3H9"/><path d="M9 14h6v3H9"/>',
  toolbox: '<rect x="3" y="9" width="18" height="11" rx="1.5"/><path d="M8 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3"/><path d="M3 13h18"/>',
  nailer: '<path d="M12 2v13"/><path d="M8 6l4-4 4 4"/><path d="M7 19h10l-1 3H8z"/>',
  compressor: '<rect x="3" y="12" width="18" height="7" rx="1.5"/><circle cx="7" cy="8" r="4"/><path d="M7 12V8"/>',
  level: '<rect x="2" y="10" width="20" height="5" rx="1"/><circle cx="12" cy="12.5" r="1.6"/><path d="M6 10v5M18 10v5"/>',
  tool: '<path d="M14.7 6.3a4 4 0 1 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2 2.6-2.6z"/><path d="M15 3l6 6"/>',
};

const CATS = [
  { m: ["amoladora", "miniamoladora"], i: "grinder" },
  { m: ["taladro", "perforadora", "atornillador para durlok", "atornillador de impacto"], i: "drill" },
  { m: ["rotomartillo", "martillo demoledor", "demoledor"], i: "drill" },
  { m: ["atornillador"], i: "screwdriver" },
  { m: ["sierra", "motosierra", "serrucho", "cuchilla corta", "podadora"], i: "saw" },
  { m: ["llave de impacto", "llave crique", "crique"], i: "impact" },
  { m: ["llave inglesa", "llave combinada", "llave autoajustable", "llave "], i: "wrench" },
  { m: ["linterna", "lampara de trabajo", "lámpara"], i: "light" },
  { m: ["hidrolavadora"], i: "water" },
  { m: ["soplador", "aspirador", "aspiradora", "ventilador"], i: "wind" },
  { m: ["pistola de calor", "termofusora", "soldadora", "soldador", "pistola soldadora"], i: "flame" },
  { m: ["pistola de pintar", "pulverizador", "mezclador de pintura", "sprayer", "equipo para pintar", "rodillo", "pistola de pegar", "aplicador de silicona"], i: "spray" },
  { m: ["cortadora de cesped", "cortacesped", "cortacerco", "tijera de poda", "bordeadora", "cortacercos", "cabina granalladora"], i: "garden" },
  { m: ["bomba", "transferencia de liquidos"], i: "water" },
  { m: ["minitorno"], i: "rotary" },
  { m: ["lijadora"], i: "sander" },
  { m: ["cargador"], i: "charger" },
  { m: ["bateria", "batería", "mochila bateria"], i: "battery" },
  { m: ["compresor", "inflador"], i: "compressor" },
  { m: ["nivel de burbuja", "nivel laser", "nivel magnetico", "medidor laser"], i: "level" },
  { m: ["multimetro", "pinza amperometrica", "buscapolo", "tester", "anemometro", "detector", "higrometro", "termohigrometro", "decibelimetro", "luxometro", "torquimetro"], i: "meter" },
  { m: ["disco ", "hoja de sierra", "mecha", "clavos", "grapas", "cinta", "lija", "punta ", "cadena para motosierra"], i: "disc" },
  { m: ["pinza", "alicate", "tenaza", "pico de loro"], i: "pliers" },
  { m: ["destornillador"], i: "screwdriver" },
  { m: ["sargento", "prensa", "clamp", "abrazadera"], i: "clamp" },
  { m: ["clavadora"], i: "nailer" },
  { m: ["caja de herramientas", "porta herramientas", "bolso", "carro", "gabinete", "contenedor", "kit ", "set de", "banco de trabajo", "estuche"], i: "toolbox" },
  { m: ["ventosa vibradora", "vibrador para concreto", "candado", "cricket"], i: "tool" },
];

function iconFor(desc) {
  const d = (desc || "").toLowerCase();
  for (const c of CATS) {
    for (const term of c.m) if (d.includes(term)) return c.i;
  }
  return "tool";
}

function Icon({ name }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] || ICON_PATHS.tool }}
    />
  );
}

/* ---------- helpers ---------- */
function brandSlug(marca) {
  const m = (marca || "").toLowerCase();
  if (m.includes("dyllu")) return "dyllu";
  if (m.includes("osburk")) return "osburk";
  return "total";
}

const MES_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MES_LONG = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function fmtDate(iso) {
  if (!iso) return "";
  const p = iso.split("-");
  if (p.length !== 3) return iso;
  return `${p[2]} ${MES_SHORT[parseInt(p[1], 10) - 1] ?? "?"} ${p[0]}`;
}

function monthKey(iso) {
  return iso && iso.length >= 7 ? iso.slice(0, 7) : "";
}

function periodLabel(key) {
  if (key === "hist") return "Histórico";
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  const [y, m] = key.split("-");
  return `${MES_LONG[parseInt(m, 10) - 1] ?? key} ${y}`;
}

const CAMBIO_META = {
  NOVEDAD: { label: "Novedad", cls: "novedad" },
  DISCONTINUO: { label: "Discontinuo", cls: "discontinuo" },
  REEMPLAZO: { label: "Reemplazo", cls: "reemplazo" },
};
function cambioMeta(raw) {
  const key = (raw || "").trim().toUpperCase();
  if (CAMBIO_META[key]) return CAMBIO_META[key];
  if (key.startsWith("DESCRIPCION")) return { label: "Actualizado", cls: "update" };
  return { label: raw || "—", cls: "update" };
}

/* ---------- card components (module scope) ---------- */
function ChangeCard({ r, open, onToggle }) {
  const cm = cambioMeta(r.cambio);
  return (
    <div className={`cmp-card cmp-brand-${r._brand}`}>
      <div className="cmp-card-top">
        <span className="cmp-icon"><Icon name={r._icon} /></span>
        <div className="cmp-card-body">
          <div className="cmp-desc">{r.descripcion || "—"}</div>
          <div className="cmp-sku">{r.sku || "—"}</div>
        </div>
      </div>
      <div className="cmp-meta">
        <span className={`cmp-badge cmp-badge-${cm.cls}`}>{cm.label}</span>
        <span className="cmp-badge cmp-badge-brand">{r.marca || "—"}</span>
        <span className="cmp-date">{fmtDate(r.fecha)}</span>
      </div>
      {r.datos && (
        <>
          <button type="button" className="cmp-datos-toggle" onClick={() => onToggle(r._id)}>
            {open ? "Ocultar datos técnicos" : "Ver datos técnicos"}
          </button>
          {open && <pre className="cmp-datos-box">{r.datos}</pre>}
        </>
      )}
    </div>
  );
}

function PairCard({ r, oldRow, open, onToggle }) {
  const oldDesc = oldRow
    ? oldRow.descripcion
    : r.reemplaza_a
      ? `SKU ${r.reemplaza_a} (sin datos en la planilla)`
      : "Sin producto anterior registrado";
  const oldSku = oldRow ? oldRow.sku : (r.reemplaza_a || "—");
  return (
    <div className={`cmp-pair cmp-brand-${r._brand}`}>
      <div className="cmp-pair-grid">
        <div className="cmp-pair-side cmp-pair-old">
          <span className="cmp-pair-tag">Sale</span>
          <div className="cmp-desc cmp-strike">{oldDesc}</div>
          <div className="cmp-sku">{oldSku}</div>
        </div>
        <div className="cmp-pair-arrow" aria-hidden="true">→</div>
        <div className="cmp-pair-side cmp-pair-new">
          <span className="cmp-pair-tag">Entra</span>
          <div className="cmp-desc">{r.descripcion || "—"}</div>
          <div className="cmp-sku">{r.sku || "—"}</div>
        </div>
      </div>
      <div className="cmp-pair-foot">
        <span className="cmp-badge cmp-badge-reemplazo">Reemplazo</span>
        <span className="cmp-badge cmp-badge-brand">{r.marca || "—"}</span>
        <span className="cmp-date">{fmtDate(r.fecha)}</span>
        {r.datos && (
          <button type="button" className="cmp-datos-toggle" onClick={() => onToggle(r._id)}>
            {open ? "Ocultar datos" : "Datos técnicos"}
          </button>
        )}
      </div>
      {r.datos && open && <pre className="cmp-datos-box">{r.datos}</pre>}
    </div>
  );
}

/* ---------- view ---------- */
export default function ComparisonView() {
  const { catalogChanges } = useDashboard();
  const meta = catalogChanges?.meta ?? { count: 0 };

  const [period, setPeriod] = useState("all");
  const [type, setType] = useState("all");
  const [brand, setBrand] = useState("all");
  const [q, setQ] = useState("");
  const [openDatos, setOpenDatos] = useState(() => new Set());

  const model = useMemo(() => {
    const rows = (catalogChanges?.changes ?? []).map((r, idx) => ({
      ...r,
      _id: idx,
      _brand: brandSlug(r.marca),
      _norm: (r.cambio || "").trim().toUpperCase(),
      _icon: iconFor(r.descripcion),
      _mkey: monthKey(r.fecha),
    }));

    const sheetPeriods = [...new Set(rows.map((r) => r.sheet_name).filter(Boolean))];
    let periods;
    if (sheetPeriods.length) {
      rows.forEach((r) => { r._period = r.sheet_name || "Sin hoja"; });
      periods = [...sheetPeriods];
      if (rows.some((r) => !r.sheet_name)) periods.push("Sin hoja");
    } else {
      const months = [...new Set(rows.map((r) => r._mkey).filter(Boolean))].sort().reverse();
      const recent = new Set(months.slice(0, 2));
      rows.forEach((r) => { r._period = recent.has(r._mkey) ? r._mkey : "hist"; });
      periods = [...recent].sort().reverse();
      if (months.length > 2) periods.push("hist");
    }

    const bySku = {};
    rows.forEach((r) => { if (r.sku && !bySku[r.sku]) bySku[r.sku] = r; });

    const reemplazos = rows.filter((r) => r._norm === "REEMPLAZO");
    const oldSkus = new Set(reemplazos.map((r) => r.reemplaza_a).filter(Boolean));
    const novedades = rows.filter((r) => r._norm === "NOVEDAD");
    const discontinuos = rows.filter((r) => r._norm === "DISCONTINUO" && !oldSkus.has(r.sku));
    const otros = rows.filter((r) => !["NOVEDAD", "DISCONTINUO", "REEMPLAZO"].includes(r._norm));

    const brands = [...new Set(rows.map((r) => r._brand))];

    return {
      rows, bySku, reemplazos, novedades, discontinuos, otros, periods, brands,
      counts: {
        total: rows.length,
        novedad: novedades.length,
        discontinuo: rows.filter((r) => r._norm === "DISCONTINUO").length,
        reemplazo: reemplazos.length,
      },
    };
  }, [catalogChanges]);

  function matches(r) {
    if (period !== "all" && r._period !== period) return false;
    if (brand !== "all" && r._brand !== brand) return false;
    if (type !== "all" && r._norm !== type) return false;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      if (!(r.sku || "").toLowerCase().includes(needle) &&
          !(r.descripcion || "").toLowerCase().includes(needle) &&
          !(r.reemplaza_a || "").toLowerCase().includes(needle)) return false;
    }
    return true;
  }

  function toggleDatos(id) {
    setOpenDatos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!meta.count) {
    return (
      <div className="cmp-view">
        <div className="cmp-empty">
          <p className="cmp-empty-title">Sin cambios de catálogo cargados</p>
          <p>
            Subí el Excel de <strong>Cambios</strong> (Novedades / Reemplazos / Discontinuos de
            TOTAL · DYLLU · OSBURK) con el botón <strong>«Cambios»</strong> de la barra superior.
          </p>
        </div>
      </div>
    );
  }

  const fReempl = model.reemplazos.filter(matches);
  const fNov = model.novedades.filter(matches);
  const fDisc = model.discontinuos.filter(matches);
  const fOtros = model.otros.filter(matches);
  const totalShown = fReempl.length + fNov.length + fDisc.length + fOtros.length;

  function section(title, cls, items, isPair) {
    if (items.length === 0) return null;
    return (
      <section className="cmp-section">
        <div className={`cmp-section-head ${cls}`}>
          <h2>{title}</h2>
          <span className="cmp-section-count">{items.length}</span>
        </div>
        <div className={`cmp-grid ${isPair ? "cmp-grid-pairs" : ""}`}>
          {items.map((r) =>
            isPair ? (
              <PairCard
                key={r._id}
                r={r}
                oldRow={r.reemplaza_a ? model.bySku[r.reemplaza_a] : null}
                open={openDatos.has(r._id)}
                onToggle={toggleDatos}
              />
            ) : (
              <ChangeCard key={r._id} r={r} open={openDatos.has(r._id)} onToggle={toggleDatos} />
            )
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="cmp-view">
      <header className="cmp-header">
        <p className="cmp-eyebrow">Catálogo · TOTAL · DYLLU · OSBURK</p>
        <h1 className="cmp-title">Novedades, Reemplazos &amp; Discontinuos</h1>
        <p className="cmp-sub">
          Altas, bajas y reemplazos de producto.
          {meta.filename ? ` Fuente: ${meta.filename}.` : ""}
        </p>
        <div className="cmp-stats">
          <div className="cmp-stat"><span className="cmp-stat-label">Registros</span><span className="cmp-stat-value">{model.counts.total}</span></div>
          <div className="cmp-stat"><span className="cmp-stat-label">Novedades</span><span className="cmp-stat-value c-novedad">{model.counts.novedad}</span></div>
          <div className="cmp-stat"><span className="cmp-stat-label">Discontinuos</span><span className="cmp-stat-value c-discontinuo">{model.counts.discontinuo}</span></div>
          <div className="cmp-stat"><span className="cmp-stat-label">Reemplazos</span><span className="cmp-stat-value c-reemplazo">{model.counts.reemplazo}</span></div>
        </div>
      </header>

      <div className="cmp-controls">
        <div className="cmp-tabs">
          <button type="button" className={`cmp-tab ${period === "all" ? "active" : ""}`} onClick={() => setPeriod("all")}>Todos</button>
          {model.periods.map((p) => (
            <button type="button" key={p} className={`cmp-tab ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)}>
              {periodLabel(p)}
            </button>
          ))}
        </div>

        <div className="cmp-chipgroup">
          <span className="cmp-chipgroup-label">Tipo</span>
          {[["all", "Todos"], ["NOVEDAD", "Novedad"], ["DISCONTINUO", "Discontinuo"], ["REEMPLAZO", "Reemplazo"]].map(([k, l]) => (
            <button type="button" key={k} className={`cmp-chip ${type === k ? "active" : ""}`} onClick={() => setType(k)}>{l}</button>
          ))}
        </div>

        {model.brands.length > 1 && (
          <div className="cmp-chipgroup">
            <span className="cmp-chipgroup-label">Marca</span>
            <button type="button" className={`cmp-chip ${brand === "all" ? "active" : ""}`} onClick={() => setBrand("all")}>Todas</button>
            {["total", "dyllu", "osburk"].filter((b) => model.brands.includes(b)).map((b) => (
              <button type="button" key={b} className={`cmp-chip ${brand === b ? "active" : ""}`} onClick={() => setBrand(b)}>
                {b[0].toUpperCase() + b.slice(1)}
              </button>
            ))}
          </div>
        )}

        <div className="cmp-search">
          <input
            type="text"
            placeholder="Buscar por SKU o descripción…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {totalShown === 0 ? (
        <div className="cmp-empty"><p>No hay resultados para este filtro.</p></div>
      ) : (
        <main className="cmp-sections">
          {section("Reemplazos", "reemplazo", fReempl, true)}
          {section("Novedades", "novedad", fNov, false)}
          {section("Discontinuos", "discontinuo", fDisc, false)}
          {section("Otros movimientos", "", fOtros, false)}
        </main>
      )}
    </div>
  );
}
