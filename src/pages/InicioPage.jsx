import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCaja } from "../context/CajaContext";
import AppShell from "../components/AppShell";
import { obtenerReportePorRango, hoyLocal } from "../services/reportesServicio";
import { obtenerResumenTurno } from "../services/cajaServicio";
import "../styles/inicio.css";

// ── Helpers ─────────────────────────────────────────────────────────────────

const cop = (n) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n ?? 0);

function saludo() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 18) return "Buenas tardes";
  return "Buenas noches";
}

function tiempoTranscurrido(desde) {
  if (!desde) return "—";
  const diff = Math.floor((Date.now() - new Date(desde)) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${h}h ${m}min`;
}

function pct(valor, total) {
  if (!total) return 0;
  return Math.round((valor / total) * 100);
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sublabel, color, loading, delay = 0 }) {
  return (
    <div
      className={`db-kpi-card db-kpi-card--${color}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="db-kpi-icon-wrap">{icon}</div>
      <div className="db-kpi-body">
        <div className="db-kpi-label">{label}</div>
        {loading ? (
          <>
            <div className="db-shimmer db-shimmer--value" />
            <div className="db-shimmer db-shimmer--sub" />
          </>
        ) : (
          <>
            <div className="db-kpi-value">{value}</div>
            {sublabel && <div className="db-kpi-sub">{sublabel}</div>}
          </>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function InicioPage() {
  const { perfil, rol } = useAuth();
  const puedeVerReportes = rol === "administrador" || rol === "superadministrador";
  const { turnoActivo, cargandoTurno, soyElOperador } = useCaja();

  const [reporte, setReporte] = useState(null);
  const [resumenTurno, setResumenTurno] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cajaId = turnoActivo?.caja_id ?? null;

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const hoy = hoyLocal();
      const [rep, resumen] = await Promise.all([
        obtenerReportePorRango(hoy, hoy, "dia"),
        cajaId ? obtenerResumenTurno(cajaId) : Promise.resolve(null),
      ]);
      setReporte(rep);
      setResumenTurno(resumen);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [cajaId]);

  useEffect(() => {
    if (!cargandoTurno) cargarDatos();
  }, [cargarDatos, cargandoTurno]);

  const r = reporte?.resumen ?? {};
  const ventasRecientes = (reporte?.ventas ?? []).slice(-5).reverse();
  const topProductos = reporte?.productosMasVendidos?.slice(0, 4) ?? [];
  const metodosPago = reporte?.metodosPago ?? {};
  const totalVentas = r.totalVentas ?? 0;

  const metodosList = Object.entries(metodosPago)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const nombreUsuario = perfil?.nombre?.split(" ")[0] ?? "Usuario";
  const fechaLarga = new Date().toLocaleDateString("es-CO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <AppShell
      title="Inicio"
      description={`${saludo()}, ${nombreUsuario} · ${fechaLarga}`}
      mainClassName="nt-main--fill"
      actions={
        <button
          className="nt-btn nt-btn-ghost db-toolbar-btn"
          type="button"
          onClick={cargarDatos}
          title="Actualizar datos"
        >
          <IcRefresh />
          Actualizar
        </button>
      }
    >
      <div className="db-layout">
        <div className="db-bento">
          <div className="db-bento-kpis">
            <KpiCard
              icon={<IcVentas />}
              label="Ventas del día"
              value={cop(r.totalVentas)}
              sublabel={`${r.cantidadVentas ?? 0} transacciones`}
              color="blue"
              loading={cargando}
              delay={0}
            />
            <KpiCard
              icon={<IcTicket />}
              label="Ticket promedio"
              value={cop(r.ticketPromedio)}
              sublabel="Por transacción"
              color="violet"
              loading={cargando}
              delay={60}
            />
            <KpiCard
              icon={<IcEfectivo />}
              label="Cobrado en efectivo"
              value={cop(r.totalEfectivo)}
              sublabel={`${pct(r.totalEfectivo, totalVentas)}% del total`}
              color="green"
              loading={cargando}
              delay={120}
            />
            <KpiCard
              icon={<IcCaja />}
              label="Efectivo en caja"
              value={
                resumenTurno
                  ? cop(resumenTurno.efectivo_en_caja)
                  : turnoActivo
                  ? "..."
                  : "Sin turno"
              }
              sublabel={
                turnoActivo
                  ? `Turno activo · ${tiempoTranscurrido(turnoActivo.abierto_en)}`
                  : "Caja cerrada"
              }
              color={turnoActivo ? "amber" : "gray"}
              loading={cargando && !!cajaId}
              delay={180}
            />
          </div>

          <div className="db-bento-body">
            <div className="db-bento-col db-bento-col--spotlight">
              <div className="nt-card db-turno-card db-bento-card">
                <div className="db-turno-header">
                  <div className="db-turno-indicator">
                    <span
                      className={`db-turno-dot ${
                        turnoActivo ? "db-turno-dot--open" : "db-turno-dot--closed"
                      }`}
                    />
                    <span className="db-turno-status">
                      {turnoActivo ? "Turno activo" : "Sin turno activo"}
                    </span>
                  </div>
                  <Link to="/caja" className="db-link">
                    {turnoActivo ? "Ir a caja →" : "Abrir turno →"}
                  </Link>
                </div>

                {turnoActivo ? (
                  <div className="db-turno-info db-turno-info--compact">
                    <div className="db-turno-row">
                      <span className="db-turno-field">Operador</span>
                      <span className="db-turno-val">
                        {turnoActivo.operador_nombre ?? perfil?.nombre ?? "—"}
                      </span>
                    </div>
                    <div className="db-turno-row">
                      <span className="db-turno-field">Apertura</span>
                      <span className="db-turno-val">
                        {turnoActivo.abierto_en
                          ? new Date(turnoActivo.abierto_en).toLocaleTimeString(
                              "es-CO",
                              { hour: "2-digit", minute: "2-digit" }
                            )
                          : "—"}
                        {" · "}
                        {tiempoTranscurrido(turnoActivo.abierto_en)}
                      </span>
                    </div>
                    <div className="db-turno-row">
                      <span className="db-turno-field">Monto apertura</span>
                      <span className="db-turno-val">{cop(turnoActivo.monto_apertura)}</span>
                    </div>
                    {resumenTurno && (
                      <>
                        <div className="db-turno-row">
                          <span className="db-turno-field">Ingresos del turno</span>
                          <span className="db-turno-val db-turno-val--green">
                            {cop(resumenTurno.total_ingresos)}
                          </span>
                        </div>
                        <div className="db-turno-row">
                          <span className="db-turno-field">Retiros</span>
                          <span className="db-turno-val db-turno-val--red">
                            {cop(resumenTurno.total_retiros)}
                          </span>
                        </div>
                      </>
                    )}
                    {!soyElOperador && (
                      <p className="nt-muted db-turno-hint">
                        Modo visor: turno de {turnoActivo.operador_nombre}.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="nt-muted db-turno-empty">
                    No hay turno abierto. Abre uno desde{" "}
                    <Link to="/caja" className="nt-link">
                      Caja
                    </Link>
                    .
                  </p>
                )}
              </div>

              <div className="nt-card db-ventas-card db-bento-card db-spotlight-panel">
                <div className="db-section-head">
                  <h2 className="db-section-title">Ventas recientes</h2>
                  {puedeVerReportes ? (
                    <Link to="/reportes" className="db-link">
                      Ver todas →
                    </Link>
                  ) : null}
                </div>

                {cargando ? (
                  <div className="db-shimmer-list">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="db-shimmer db-shimmer--row" />
                    ))}
                  </div>
                ) : ventasRecientes.length === 0 ? (
                  <p className="db-panel-empty">No hay ventas registradas hoy.</p>
                ) : (
                  <div className="db-ventas-list">
                    {ventasRecientes.map((v, i) => (
                      <div
                        key={v.id}
                        className="db-venta-row"
                        style={{ animationDelay: `${i * 45}ms` }}
                      >
                        <div className="db-venta-meta">
                          <span className="db-venta-hora">
                            {new Date(v.creado_en).toLocaleTimeString("es-CO", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span
                            className={`db-venta-metodo db-venta-metodo--${
                              v.metodo_pago ?? "otro"
                            }`}
                          >
                            {v.metodo_pago ?? "otro"}
                          </span>
                        </div>
                        <span className="db-venta-total">{cop(v.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="db-bento-col db-bento-col--stack">
              <div className="nt-card db-productos-card db-bento-card">
                <div className="db-section-head">
                  <h2 className="db-section-title">Top hoy</h2>
                  <Link to="/inventario" className="db-link">
                    Inventario →
                  </Link>
                </div>

                {cargando ? (
                  <div className="db-shimmer-list">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="db-shimmer db-shimmer--row" />
                    ))}
                  </div>
                ) : topProductos.length === 0 ? (
                  <p className="db-panel-empty">Sin ventas registradas hoy.</p>
                ) : (
                  <div className="db-productos-list">
                    {topProductos.map((p, i) => (
                      <div
                        key={p.nombre}
                        className="db-producto-row"
                        style={{ animationDelay: `${i * 55}ms` }}
                      >
                        <span className="db-producto-rank">{i + 1}</span>
                        <span className="db-producto-nombre" title={p.nombre}>
                          {p.nombre}
                        </span>
                        <div className="db-producto-stats">
                          <span className="db-producto-cant">{p.cantidad} uds</span>
                          <span className="db-producto-total">{cop(p.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="nt-card db-metodos-card db-bento-card">
                <div className="db-section-head">
                  <h2 className="db-section-title">Métodos de pago</h2>
                </div>

                {cargando ? (
                  <div className="db-shimmer-list">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="db-shimmer db-shimmer--row" />
                    ))}
                  </div>
                ) : metodosList.length === 0 ? (
                  <p className="db-panel-empty">Sin cobros registrados hoy.</p>
                ) : (
                  <div className="db-metodos-list">
                    {metodosList.map(([metodo, monto]) => (
                      <div key={metodo} className="db-metodo-row">
                        <span className="db-metodo-label">{metodo}</span>
                        <div className="db-metodo-bar-wrap">
                          <div
                            className={`db-metodo-bar db-metodo-bar--${metodo}`}
                            style={{ width: `${Math.max(pct(monto, totalVentas), 4)}%` }}
                          />
                        </div>
                        <span className="db-metodo-val">{cop(monto)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {error && <div className="nt-alert nt-alert-error db-error-banner">Error al cargar datos: {error}</div>}
      </div>
    </AppShell>
  );
}

// ── Íconos SVG inline ────────────────────────────────────────────────────────

function IcVentas() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function IcTicket() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 17v2" />
      <path d="M13 11v2" />
    </svg>
  );
}

function IcEfectivo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

function IcCaja() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />
      <rect width="20" height="12" x="2" y="10" rx="2" />
      <circle cx="12" cy="16" r="2" />
    </svg>
  );
}

function IcRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}
