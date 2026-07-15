import { useState, useEffect, useCallback, useMemo } from "react";
import AppShell from "../components/AppShell";
import {
  obtenerTurnosDisponibles,
  obtenerReporteTurno,
  obtenerReportePorRango,
  obtenerReporteGeneral,
  limpiarDatosFinancieros,
  hayTurnosAbiertos,
  hoyLocal,
  rangoSemanaActual,
  rangoMesActual,
} from "../services/reportesServicio";
import { generarPdfReporte } from "../utils/generarPdfReporte";
import "../styles/reportes.css";

// ── Helpers de formato ─────────────────────────────────────────────────────

const COP = (n) => `$${Math.round(Number(n ?? 0)).toLocaleString("es-CO")}`;

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Si el concepto es "Venta [UUID]" (registro automático del RPC), lo muestra legible. */
function formatConcepto(concepto) {
  if (!concepto) return "—";
  const partes = concepto.trim().split(" ");
  if (partes.length === 2 && partes[0].toLowerCase() === "venta" && RE_UUID.test(partes[1])) {
    return "Ingreso por venta";
  }
  return concepto;
}

function fechaHora(f) {
  if (!f) return "—";
  return new Date(f).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

function fechaCorta(f) {
  if (!f) return "—";
  return new Date(f).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const TABS = [
  { id: "turno",   label: "Por Turno",  icon: "⏱️" },
  { id: "dia",     label: "Hoy",        icon: "📅" },
  { id: "semana",  label: "Semana",     icon: "🗓️" },
  { id: "mes",     label: "Mes",        icon: "📆" },
  { id: "general", label: "General",    icon: "📊" },
];

// ── Componentes secundarios ────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = "blue", icon }) {
  return (
    <div className={`rpt-kpi-card rpt-kpi--${color}`}>
      {icon && <div className="rpt-kpi-icon">{icon}</div>}
      <div className="rpt-kpi-label">{label}</div>
      <div className="rpt-kpi-value">{value}</div>
      {sub && <div className="rpt-kpi-sub">{sub}</div>}
    </div>
  );
}

function TablaVentas({ ventas }) {
  if (!ventas.length) {
    return (
      <div className="rpt-empty">
        <div className="rpt-empty-icon">🧾</div>
        <p className="rpt-empty-text">No hay ventas en este período.</p>
      </div>
    );
  }

  const totalFinal = ventas.reduce((s, v) => s + Number(v.total), 0);

  return (
    <div className="nt-table-wrap">
      <table className="nt-table">
        <thead>
          <tr>
            <th>Fecha / Hora</th>
            <th>Cajero</th>
            <th>Método</th>
            <th>Productos</th>
            <th style={{ textAlign: "right" }}>Subtotal</th>
            <th style={{ textAlign: "right" }}>Dcto.</th>
            <th style={{ textAlign: "right" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map((v) => (
            <tr key={v.id}>
              <td>{fechaHora(v.creado_en)}</td>
              <td>{v.usuarios?.nombre ?? "—"}</td>
              <td>
                <span className="rpt-badge rpt-badge--metodo">
                  {v.metodo_pago ?? "—"}
                </span>
              </td>
              <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {(v.detalle_venta ?? [])
                  .map((d) => `${d.productos?.nombre ?? "?"} ×${d.cantidad}`)
                  .join(", ") || "—"}
              </td>
              <td style={{ textAlign: "right" }} className="nt-muted">
                {COP(v.subtotal)}
              </td>
              <td style={{ textAlign: "right" }} className="rpt-monto-neg">
                {Number(v.descuento ?? 0) > 0 ? `-${COP(v.descuento)}` : "—"}
              </td>
              <td style={{ textAlign: "right" }} className="rpt-monto-total">
                {COP(v.total)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="rpt-table-footer-row">
            <td colSpan={4} style={{ fontWeight: 700 }}>
              Total — {ventas.length} venta{ventas.length !== 1 ? "s" : ""}
            </td>
            <td />
            <td />
            <td style={{ textAlign: "right" }} className="rpt-monto-pos">
              {COP(totalFinal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TablaMovimientos({ movimientos }) {
  if (!movimientos.length) {
    return (
      <div className="rpt-empty">
        <div className="rpt-empty-icon">💰</div>
        <p className="rpt-empty-text">No hay movimientos de caja en este período.</p>
      </div>
    );
  }

  const totalIngresos = movimientos
    .filter((m) => m.tipo === "ingreso")
    .reduce((s, m) => s + Number(m.monto), 0);
  const totalEgresos = movimientos
    .filter((m) => m.tipo === "retiro")
    .reduce((s, m) => s + Number(m.monto), 0);

  return (
    <div className="nt-table-wrap">
      <table className="nt-table">
        <thead>
          <tr>
            <th>Fecha / Hora</th>
            <th>Usuario</th>
            <th>Tipo</th>
            <th>Concepto</th>
            <th style={{ textAlign: "right" }}>Monto</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m) => (
            <tr key={m.id}>
              <td>{fechaHora(m.creado_en)}</td>
              <td>{m.usuarios?.nombre ?? "—"}</td>
              <td>
                <span
                  className={`rpt-badge ${
                    m.tipo === "ingreso" ? "rpt-badge--ingreso" : "rpt-badge--egreso"
                  }`}
                >
                  {m.tipo === "ingreso" ? "▲ Ingreso" : "▼ Egreso"}
                </span>
              </td>
              <td>{formatConcepto(m.concepto)}</td>
              <td
                style={{ textAlign: "right" }}
                className={m.tipo === "ingreso" ? "rpt-monto-pos" : "rpt-monto-neg"}
              >
                {m.tipo === "ingreso" ? "+" : "-"}{COP(m.monto)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="rpt-table-footer-row">
            <td colSpan={3} style={{ fontWeight: 700 }}>
              {movimientos.length} movimiento{movimientos.length !== 1 ? "s" : ""}
            </td>
            <td style={{ fontWeight: 600, color: "var(--nt-muted)", fontSize: 13 }}>
              Ingresos: {COP(totalIngresos)} | Egresos: {COP(totalEgresos)}
            </td>
            <td style={{ textAlign: "right" }} className="rpt-monto-pos">
              {COP(totalIngresos - totalEgresos)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TablaTurnos({ turnos }) {
  if (!turnos.length) return null;
  return (
    <div className="nt-table-wrap">
      <table className="nt-table">
        <thead>
          <tr>
            <th>Cajero</th>
            <th>Apertura</th>
            <th>Cierre</th>
            <th>Estado</th>
            <th style={{ textAlign: "right" }}>Monto Inicial</th>
            <th style={{ textAlign: "right" }}>Conteo Efectivo</th>
            <th style={{ textAlign: "right" }}>Saldo Sistema</th>
          </tr>
        </thead>
        <tbody>
          {turnos.map((t) => (
            <tr key={t.id}>
              <td style={{ fontWeight: 600 }}>{t.usuarios?.nombre ?? "—"}</td>
              <td>{fechaHora(t.abierto_en)}</td>
              <td>{t.cerrado_en ? fechaHora(t.cerrado_en) : "—"}</td>
              <td>
                <span
                  className={`rpt-badge ${
                    t.cerrado_en ? "rpt-badge--egreso" : "rpt-badge--ingreso"
                  }`}
                >
                  {t.cerrado_en ? "Cerrado" : "Abierto"}
                </span>
              </td>
              <td style={{ textAlign: "right" }}>{COP(t.monto_apertura)}</td>
              <td style={{ textAlign: "right" }} className="rpt-monto-pos">
                {t.monto_cierre_efectivo != null ? COP(t.monto_cierre_efectivo) : "—"}
              </td>
              <td style={{ textAlign: "right" }} className="rpt-monto-total">
                {t.saldo_calculado_cierre != null ? COP(t.saldo_calculado_cierre) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopProductos({ productos }) {
  if (!productos.length) return null;
  const medallas = ["🥇", "🥈", "🥉"];
  return (
    <div className="rpt-top-list">
      {productos.slice(0, 10).map((p, i) => (
        <div key={p.nombre} className="rpt-top-item">
          <div className="rpt-top-rank">
            {i < 3 ? (
              <span className="rpt-top-rank--medal">{medallas[i]}</span>
            ) : (
              i + 1
            )}
          </div>
          <div className="rpt-top-nombre" title={p.nombre}>
            {p.nombre}
          </div>
          <div className="rpt-top-unidades">{p.cantidad.toLocaleString("es-CO")} uds.</div>
          <div className="rpt-top-total">{COP(p.total)}</div>
        </div>
      ))}
    </div>
  );
}

function VentasPorCategoria({ categorias }) {
  if (!categorias.length) return null;
  const maxTotal = Math.max(...categorias.map((c) => c.total), 1);
  return (
    <div className="rpt-cat-list">
      {categorias.map((c) => {
        const pct = (c.total / maxTotal) * 100;
        return (
          <div key={c.categoria} className="rpt-cat-item">
            <div className="rpt-cat-info">
              <span className="rpt-cat-nombre">{c.categoria}</span>
              <span className="rpt-cat-unidades">{c.cantidad.toLocaleString("es-CO")} uds.</span>
            </div>
            <div className="rpt-cat-bar-track">
              <div className="rpt-cat-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="rpt-cat-total">{COP(c.total)}</div>
          </div>
        );
      })}
    </div>
  );
}

function MetodosPago({ metodosPago }) {
  const entradas = Object.entries(metodosPago);
  if (!entradas.length) return null;
  return (
    <div className="rpt-metodos-grid">
      {entradas.map(([metodo, total]) => (
        <div key={metodo} className="rpt-metodo-pill">
          <span className="rpt-metodo-pill-name">{metodo}</span>
          <span className="rpt-metodo-pill-val">{COP(total)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Modal limpieza de datos ────────────────────────────────────────────────

const PALABRA_CLAVE = "BORRAR TODO";

function ModalLimpiezaDatos({ onClose, onExito }) {
  const [paso, setPaso]             = useState(1); // 1 = advertencia, 2 = confirmación
  const [texto, setTexto]           = useState("");
  const [ejecutando, setEjecutando] = useState(false);
  const [error, setError]           = useState(null);
  const [resultado, setResultado]   = useState(null);

  const palabraValida = texto.trim() === PALABRA_CLAVE;

  async function handleBorrar() {
    if (!palabraValida) return;
    setEjecutando(true);
    setError(null);
    try {
      const res = await limpiarDatosFinancieros();
      setResultado(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setEjecutando(false);
    }
  }

  function handleCerrar() {
    if (resultado) onExito();
    onClose();
  }

  return (
    <div className="rpt-modal-overlay" onClick={(e) => e.target === e.currentTarget && handleCerrar()}>
      <div className="rpt-modal" role="dialog" aria-modal="true">

        {/* Header */}
        <div className="rpt-modal-header">
          <div className="rpt-modal-header-icon">⚠️</div>
          <div>
            <h2 className="rpt-modal-header-title">Limpieza de datos financieros</h2>
            <p className="rpt-modal-header-sub">
              {resultado ? "Limpieza completada" : paso === 1 ? "Paso 1 de 2 — Revisar qué se elimina" : "Paso 2 de 2 — Confirmación final"}
            </p>
          </div>
        </div>

        {/* Resultado exitoso */}
        {resultado ? (
          <div className="rpt-modal-body">
            <div className="rpt-clean-result">
              <div className="rpt-clean-result-title">
                ✅ Datos eliminados correctamente
              </div>
              <div className="rpt-clean-result-rows">
                {resultado.resumen.map((r) => (
                  <div key={r.tabla} className="rpt-clean-result-row">
                    <span>{r.label}</span>
                    <span>{r.filas.toLocaleString("es-CO")} registros eliminados</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="nt-muted" style={{ margin: 0, fontSize: 13 }}>
              El inventario, usuarios y configuración del sistema permanecen intactos. Ya puedes empezar un nuevo período.
            </p>
          </div>
        ) : paso === 1 ? (
          /* ── Paso 1: Advertencia ── */
          <div className="rpt-modal-body">
            <div className="nt-alert nt-alert-error" style={{ fontSize: 13.5 }}>
              <strong>Esta acción es irreversible.</strong> Una vez ejecutada, no hay forma de recuperar los datos eliminados. Asegúrate de haber descargado el reporte general antes de continuar.
            </div>

            <div>
              <p className="nt-label" style={{ marginBottom: 8 }}>Se eliminarán permanentemente:</p>
              <ul className="rpt-modal-list">
                <li className="is-delete">🗑️ <strong>Ventas</strong> — todas las transacciones registradas</li>
                <li className="is-delete">🗑️ <strong>Líneas de venta</strong> — detalle de productos por venta</li>
                <li className="is-delete">🗑️ <strong>Movimientos de caja</strong> — ingresos y egresos</li>
                <li className="is-delete">🗑️ <strong>Turnos de caja</strong> — historial de aperturas y cierres</li>
              </ul>
            </div>

            <div>
              <p className="nt-label" style={{ marginBottom: 8 }}>Se conserva sin cambios:</p>
              <ul className="rpt-modal-list">
                <li className="is-keep">✅ <strong>Inventario</strong> — productos y categorías</li>
                <li className="is-keep">✅ <strong>Usuarios</strong> — cuentas y roles</li>
              </ul>
            </div>
          </div>
        ) : (
          /* ── Paso 2: Confirmación ── */
          <div className="rpt-modal-body">
            <div className="nt-alert nt-alert-error" style={{ fontSize: 13 }}>
              Estás a punto de borrar <strong>todo el historial financiero</strong>. Esta es tu última oportunidad para cancelar.
            </div>

            <div>
              <p className="rpt-confirm-label">
                Escribe <code>{PALABRA_CLAVE}</code> para habilitar el botón de borrado:
              </p>
              <input
                type="text"
                className={`nt-field rpt-confirm-field${palabraValida ? " is-valid" : ""}`}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={PALABRA_CLAVE}
                autoFocus
                autoComplete="off"
              />
            </div>

            {error && (
              <div className="nt-alert nt-alert-error" style={{ fontSize: 13 }}>
                {error}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="rpt-modal-footer">
          <button className="nt-btn" onClick={handleCerrar}>
            {resultado ? "Cerrar" : "Cancelar"}
          </button>

          {!resultado && paso === 1 && (
            <button className="rpt-btn-execute" onClick={() => setPaso(2)}>
              Entendido, continuar →
            </button>
          )}

          {!resultado && paso === 2 && (
            <button
              className="rpt-btn-execute"
              onClick={handleBorrar}
              disabled={!palabraValida || ejecutando}
            >
              {ejecutando ? (
                <>
                  <span className="rpt-spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: "#fff", borderColor: "rgba(255,255,255,0.3)" }} />
                  Borrando…
                </>
              ) : (
                "🗑️ Borrar todo el historial"
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Tarjeta de sección (abre modal al hacer clic) ─────────────────────────

function SectionCard({ title, icon, badge, stats, colorClass, onClick }) {
  return (
    <div
      className={`rpt-seccion-card rpt-seccion-card--${colorClass}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div className="rpt-seccion-card-top">
        <span className="rpt-seccion-card-icon">{icon}</span>
        <span className="rpt-seccion-card-badge">{badge}</span>
      </div>
      <h3 className="rpt-seccion-card-title">{title}</h3>
      <div className="rpt-seccion-card-stats">{stats}</div>
      <div className="rpt-seccion-card-cta">Ver detalle →</div>
    </div>
  );
}

// ── Modal de detalle de sección ────────────────────────────────────────────

function DetalleModal({ tipo, reporte, onClose }) {
  const [filtroMetodoPago, setFiltroMetodoPago] = useState("todos");
  const [busquedaVentas, setBusquedaVentas]     = useState("");
  const [filtroMovimiento, setFiltroMovimiento] = useState("todos");
  const [busquedaMov, setBusquedaMov]           = useState("");

  const ventasFiltradas = useMemo(() => {
    if (tipo !== "ventas") return [];
    let r = reporte.ventas;
    if (filtroMetodoPago === "efectivo") {
      r = r.filter((v) => v.metodo_pago === "efectivo");
    } else if (filtroMetodoPago === "otro") {
      r = r.filter((v) => v.metodo_pago !== "efectivo");
    }
    if (busquedaVentas.trim()) {
      const q = busquedaVentas.trim().toLowerCase();
      r = r.filter(
        (v) =>
          (v.usuarios?.nombre ?? "").toLowerCase().includes(q) ||
          (v.metodo_pago ?? "").toLowerCase().includes(q) ||
          (v.detalle_venta ?? []).some((d) =>
            (d.productos?.nombre ?? "").toLowerCase().includes(q)
          )
      );
    }
    return r;
  }, [tipo, reporte, filtroMetodoPago, busquedaVentas]);

  const movimientosFiltrados = useMemo(() => {
    if (tipo !== "movimientos") return [];
    let r = reporte.movimientos;
    if (filtroMovimiento !== "todos") {
      r = r.filter((m) => m.tipo === filtroMovimiento);
    }
    if (busquedaMov.trim()) {
      const q = busquedaMov.trim().toLowerCase();
      r = r.filter(
        (m) =>
          (m.usuarios?.nombre ?? "").toLowerCase().includes(q) ||
          (m.concepto ?? "").toLowerCase().includes(q)
      );
    }
    return r;
  }, [tipo, reporte, filtroMovimiento, busquedaMov]);

  const TITULOS = {
    ventas:       "Ventas registradas",
    movimientos:  "Movimientos de caja",
    productos:    "Productos más vendidos",
    categorias:   "Ventas por categoría",
    turnos:       "Turnos de caja en el período",
  };

  return (
    <div
      className="rpt-detail-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="rpt-detail-modal" role="dialog" aria-modal="true">

        {/* Header */}
        <div className="rpt-detail-header">
          <h2 className="rpt-detail-title">{TITULOS[tipo]}</h2>
          <button className="rpt-detail-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {/* Body */}
        <div className="rpt-detail-body">

          {tipo === "ventas" && (
            <>
              <div className="rpt-filtros">
                <div className="rpt-filtro-chips">
                  {[
                    { id: "todos",    label: "Todos" },
                    { id: "efectivo", label: "Efectivo" },
                    { id: "otro",     label: "Otros medios" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      className={`rpt-filtro-chip${filtroMetodoPago === opt.id ? " is-active" : ""}`}
                      onClick={() => setFiltroMetodoPago(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  className="nt-field rpt-filtro-search"
                  placeholder="Buscar cajero o producto…"
                  value={busquedaVentas}
                  onChange={(e) => setBusquedaVentas(e.target.value)}
                />
                {(filtroMetodoPago !== "todos" || busquedaVentas) && (
                  <button
                    className="rpt-filtro-reset"
                    onClick={() => { setFiltroMetodoPago("todos"); setBusquedaVentas(""); }}
                  >
                    Limpiar
                  </button>
                )}
                {ventasFiltradas.length !== reporte.ventas.length && (
                  <span className="rpt-section-filtered">
                    {ventasFiltradas.length} de {reporte.ventas.length}
                  </span>
                )}
              </div>
              <TablaVentas ventas={ventasFiltradas} />
            </>
          )}

          {tipo === "movimientos" && (
            <>
              <div className="rpt-filtros">
                <div className="rpt-filtro-chips">
                  {[
                    { id: "todos",   label: "Todos" },
                    { id: "ingreso", label: "Ingresos", mod: "ingreso" },
                    { id: "retiro",  label: "Egresos",  mod: "egreso"  },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      className={`rpt-filtro-chip${opt.mod ? ` rpt-filtro-chip--${opt.mod}` : ""}${filtroMovimiento === opt.id ? " is-active" : ""}`}
                      onClick={() => setFiltroMovimiento(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  className="nt-field rpt-filtro-search"
                  placeholder="Buscar usuario o concepto…"
                  value={busquedaMov}
                  onChange={(e) => setBusquedaMov(e.target.value)}
                />
                {(filtroMovimiento !== "todos" || busquedaMov) && (
                  <button
                    className="rpt-filtro-reset"
                    onClick={() => { setFiltroMovimiento("todos"); setBusquedaMov(""); }}
                  >
                    Limpiar
                  </button>
                )}
                {movimientosFiltrados.length !== reporte.movimientos.length && (
                  <span className="rpt-section-filtered">
                    {movimientosFiltrados.length} de {reporte.movimientos.length}
                  </span>
                )}
              </div>
              <TablaMovimientos movimientos={movimientosFiltrados} />
            </>
          )}

          {tipo === "productos" && (
            <div className="nt-card" style={{ padding: "12px 16px" }}>
              <TopProductos productos={reporte.productosMasVendidos} />
            </div>
          )}

          {tipo === "categorias" && (
            <div className="nt-card" style={{ padding: "12px 16px" }}>
              <VentasPorCategoria categorias={reporte.ventasPorCategoria} />
            </div>
          )}

          {tipo === "turnos" && (
            <TablaTurnos turnos={reporte.turnos} />
          )}

        </div>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export default function ReportesPage() {
  const [tabActiva, setTabActiva] = useState("dia");

  // Turno
  const [turnos, setTurnos]             = useState([]);
  const [turnoSelId, setTurnoSelId]     = useState(null);
  const [cargandoTurnos, setCargandoTurnos] = useState(false);

  // Rango fechas para dia/semana/mes/personalizado
  const [fechaDesde, setFechaDesde] = useState(hoyLocal);
  const [fechaHasta, setFechaHasta] = useState(hoyLocal);

  // Reporte cargado
  const [reporte, setReporte]           = useState(null);
  const [cargando, setCargando]         = useState(false);
  const [error, setError]               = useState(null);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(null); // "ventas"|"movimientos"|"productos"|"turnos"
  const [modalLimpieza, setModalLimpieza] = useState(false);
  const [verificandoTurno, setVerificandoTurno] = useState(false);
  const [errorTurnoAbierto, setErrorTurnoAbierto] = useState(false);

  // Carga la lista de turnos al abrir la pestaña "turno"
  useEffect(() => {
    if (tabActiva !== "turno") return;
    setCargandoTurnos(true);
    obtenerTurnosDisponibles()
      .then(setTurnos)
      .catch((e) => setError(e.message))
      .finally(() => setCargandoTurnos(false));
  }, [tabActiva]);

  // Actualiza las fechas según la pestaña seleccionada
  useEffect(() => {
    const hoy = hoyLocal();
    if (tabActiva === "dia") {
      setFechaDesde(hoy);
      setFechaHasta(hoy);
    } else if (tabActiva === "semana") {
      const { desde, hasta } = rangoSemanaActual();
      setFechaDesde(desde);
      setFechaHasta(hasta);
    } else if (tabActiva === "mes") {
      const { desde, hasta } = rangoMesActual();
      setFechaDesde(desde);
      setFechaHasta(hasta);
    }
    // Limpia el reporte al cambiar de tab
    setReporte(null);
    setError(null);
  }, [tabActiva]);

  const cargarReporte = useCallback(async () => {
    try {
      setCargando(true);
      setError(null);
      let datos;
      if (tabActiva === "turno") {
        if (!turnoSelId) throw new Error("Selecciona un turno de la lista.");
        datos = await obtenerReporteTurno(turnoSelId);
      } else if (tabActiva === "general") {
        datos = await obtenerReporteGeneral();
      } else {
        datos = await obtenerReportePorRango(fechaDesde, fechaHasta, tabActiva);
      }
      setReporte(datos);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [tabActiva, turnoSelId, fechaDesde, fechaHasta]);

  const handleAbrirLimpieza = useCallback(async () => {
    setVerificandoTurno(true);
    setErrorTurnoAbierto(false);
    try {
      const abierto = await hayTurnosAbiertos();
      if (abierto) {
        setErrorTurnoAbierto(true);
      } else {
        setModalLimpieza(true);
      }
    } catch {
      setModalLimpieza(true); // si falla la verificación, dejamos que la RPC rechace
    } finally {
      setVerificandoTurno(false);
    }
  }, []);

  const handleGenerarPdf = useCallback(async () => {
    if (!reporte) return;
    setGenerandoPdf(true);
    try {
      await generarPdfReporte(reporte);
    } catch (e) {
      setError(`Error al generar PDF: ${e.message}`);
    } finally {
      setGenerandoPdf(false);
    }
  }, [reporte]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <AppShell title="Reportes" description="Estado financiero del local — genera reportes por turno, día, semana, mes o historial completo.">
      <div className="rpt-page">

        {/* ── Tabs de período ── */}
        <div className="rpt-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={tabActiva === tab.id}
              className={`rpt-tab${tabActiva === tab.id ? " is-active" : ""}`}
              onClick={() => setTabActiva(tab.id)}
            >
              <span className="rpt-tab-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Controles de filtro ── */}
        <section className="nt-card nt-stack">
          <div className="rpt-controls">

            {/* Selector de turno */}
            {tabActiva === "turno" && (
              <div style={{ flex: 1 }}>
                <div className="rpt-controls-label">Selecciona un turno de caja</div>
                {cargandoTurnos ? (
                  <div className="rpt-loading">
                    <div className="rpt-spinner" />
                    Cargando turnos…
                  </div>
                ) : turnos.length === 0 ? (
                  <p className="nt-muted" style={{ margin: 0, fontSize: 14 }}>
                    No hay turnos registrados.
                  </p>
                ) : (
                  <div className="rpt-turno-list">
                    {turnos.map((t) => (
                      <div
                        key={t.id}
                        className={`rpt-turno-item${turnoSelId === t.id ? " is-selected" : ""}`}
                        onClick={() => setTurnoSelId(t.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && setTurnoSelId(t.id)}
                      >
                        <div
                          className={`rpt-turno-dot ${
                            t.cerrado_en ? "rpt-turno-dot--closed" : "rpt-turno-dot--open"
                          }`}
                        />
                        <div className="rpt-turno-info">
                          <div className="rpt-turno-cajero">
                            {t.usuarios?.nombre ?? "Cajero"}{" "}
                            {!t.cerrado_en && (
                              <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>
                                · Abierto
                              </span>
                            )}
                          </div>
                          <div className="rpt-turno-fecha">
                            {fechaHora(t.abierto_en)}
                            {t.cerrado_en ? ` → ${fechaHora(t.cerrado_en)}` : ""}
                          </div>
                        </div>
                        <div className="rpt-turno-monto">{COP(t.monto_apertura)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Filtros de fecha para dia/semana/mes/general */}
            {tabActiva !== "turno" && tabActiva !== "general" && (
              <>
                <div>
                  <div className="rpt-controls-label">Desde</div>
                  <input
                    type="date"
                    className="nt-field"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    max={fechaHasta}
                  />
                </div>
                <div>
                  <div className="rpt-controls-label">Hasta</div>
                  <input
                    type="date"
                    className="nt-field"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    min={fechaDesde}
                    max={hoyLocal()}
                  />
                </div>
              </>
            )}

            {tabActiva === "general" && (
              <p className="nt-muted" style={{ margin: 0, fontSize: 14 }}>
                Este reporte incluye <strong>todo el historial</strong> disponible en el sistema.
              </p>
            )}

            {/* Botón cargar */}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <button
                className="nt-btn nt-btn-primary"
                onClick={cargarReporte}
                disabled={cargando || (tabActiva === "turno" && !turnoSelId)}
              >
                {cargando ? (
                  <>
                    <span className="rpt-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    Cargando…
                  </>
                ) : (
                  "📊 Generar reporte"
                )}
              </button>

              {reporte && (
                <button
                  className="rpt-btn-pdf"
                  onClick={handleGenerarPdf}
                  disabled={generandoPdf}
                >
                  {generandoPdf ? (
                    <>
                      <span className="rpt-spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: "#fff", borderColor: "rgba(255,255,255,0.3)" }} />
                      Generando…
                    </>
                  ) : (
                    <>📄 Descargar PDF</>
                  )}
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="nt-alert nt-alert-error" style={{ marginTop: 8 }}>
              {error}
            </div>
          )}
        </section>

        {/* ── Reporte cargado ── */}
        {cargando && (
          <div className="rpt-loading">
            <div className="rpt-spinner" />
            Consultando datos…
          </div>
        )}

        {!cargando && reporte && (
          <>
            {/* ── Aviso turno multidía ── */}
            {reporte.tipo !== "turno" && reporte.turnosMultidia?.length > 0 && (
              <div className="nt-alert" style={{
                background: "var(--nt-amber-50, #fffbeb)",
                border: "1px solid var(--nt-amber-300, #fcd34d)",
                borderRadius: 10,
                padding: "12px 16px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                fontSize: 13.5,
              }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
                <div>
                  <strong>Hay {reporte.turnosMultidia.length === 1 ? "un turno activo" : `${reporte.turnosMultidia.length} turnos activos`} desde antes de este período.</strong>
                  {" "}Las ventas de ese turno se incluyen aquí según su fecha, pero el saldo inicial mostrado corresponde a la apertura original
                  {" "}({reporte.turnosMultidia[0]?.usuarios?.nombre
                    ? `de ${reporte.turnosMultidia[0].usuarios.nombre}, `
                    : ""}
                  abierto el {fechaCorta(reporte.turnosMultidia[0]?.abierto_en)}).
                  {" "}<strong>Para ver el reporte completo de ese turno (todos los días), usa la pestaña «Por Turno».</strong>
                </div>
              </div>
            )}

            {/* ── KPIs ── */}
            <div className="rpt-kpis">
              <KpiCard
                label="Total ventas"
                value={COP(reporte.resumen.totalVentas)}
                sub={`${reporte.resumen.cantidadVentas} transacción${reporte.resumen.cantidadVentas !== 1 ? "es" : ""}`}
                color="blue"
                icon="💵"
              />
              <KpiCard
                label="Ticket promedio"
                value={COP(reporte.resumen.ticketPromedio)}
                color="teal"
                icon="🎟️"
              />
              <KpiCard
                label="Ventas en efectivo"
                value={COP(reporte.resumen.totalEfectivo)}
                color="green"
                icon="💴"
              />
              <KpiCard
                label="Otros medios de pago"
                value={COP(reporte.resumen.totalOtrosMedios)}
                color="purple"
                icon="💳"
              />
              <KpiCard
                label="Descuentos otorgados"
                value={COP(reporte.resumen.totalDescuentos)}
                color="amber"
                icon="🏷️"
              />
              <KpiCard
                label="Saldo inicial caja"
                value={COP(reporte.resumen.saldoInicial)}
                color="blue"
                icon="🏦"
              />
              <KpiCard
                label="Ingresos caja"
                value={COP(reporte.resumen.totalIngresos)}
                color="green"
                icon="📈"
              />
              <KpiCard
                label="Egresos caja"
                value={COP(reporte.resumen.totalEgresos)}
                color="red"
                icon="📉"
              />
              <KpiCard
                label="Balance neto"
                value={COP(reporte.resumen.efectivoEnCaja)}
                color={reporte.resumen.efectivoEnCaja >= 0 ? "green" : "red"}
                icon={reporte.resumen.efectivoEnCaja >= 0 ? "✅" : "⚠️"}
              />
              <KpiCard
                label="Ganancia neta"
                value={COP(reporte.resumen.gananciaNeta)}
                sub="Venta − costo de productos"
                color={reporte.resumen.gananciaNeta >= 0 ? "purple" : "red"}
                icon="💹"
              />
            </div>

            {/* ── Info del turno ── */}
            {reporte.tipo === "turno" && reporte.turno && (
              <section className="nt-card nt-stack">
                <h2 style={{ margin: 0, fontSize: 16 }}>Información del turno</h2>
                <div className="nt-table-wrap">
                  <table className="nt-table">
                    <thead>
                      <tr>
                        <th>Cajero</th>
                        <th>Apertura</th>
                        <th>Cierre</th>
                        <th style={{ textAlign: "right" }}>Monto Apertura</th>
                        <th style={{ textAlign: "right" }}>Conteo Efectivo</th>
                        <th style={{ textAlign: "right" }}>Saldo Sistema</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ fontWeight: 700 }}>{reporte.turno.usuarios?.nombre ?? "—"}</td>
                        <td>{fechaHora(reporte.turno.abierto_en)}</td>
                        <td>
                          {reporte.turno.cerrado_en ? (
                            fechaHora(reporte.turno.cerrado_en)
                          ) : (
                            <span className="rpt-badge rpt-badge--ingreso">Abierto</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>{COP(reporte.turno.monto_apertura)}</td>
                        <td style={{ textAlign: "right" }} className="rpt-monto-pos">
                          {reporte.turno.monto_cierre_efectivo != null
                            ? COP(reporte.turno.monto_cierre_efectivo)
                            : "—"}
                        </td>
                        <td style={{ textAlign: "right" }} className="rpt-monto-total">
                          {reporte.turno.saldo_calculado_cierre != null
                            ? COP(reporte.turno.saldo_calculado_cierre)
                            : "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {reporte.turno.notas_cierre && (
                  <p className="nt-muted" style={{ margin: 0, fontSize: 13 }}>
                    <strong>Notas de cierre:</strong> {reporte.turno.notas_cierre}
                  </p>
                )}
              </section>
            )}

            {/* ── Métodos de pago ── */}
            {Object.keys(reporte.metodosPago).length > 0 && (
              <section className="nt-card nt-stack">
                <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Desglose por método de pago</h2>
                <MetodosPago metodosPago={reporte.metodosPago} />
              </section>
            )}

            {/* ── Grid de tarjetas de detalle ── */}
            <div className="rpt-seccion-cards">
              <SectionCard
                title="Ventas registradas"
                icon="🧾"
                badge={reporte.ventas.length}
                colorClass="blue"
                stats={
                  <>
                    <span>Total: <strong>{COP(reporte.resumen.totalVentas)}</strong></span>
                    <span>Efectivo: <strong>{COP(reporte.resumen.totalEfectivo)}</strong></span>
                  </>
                }
                onClick={() => setModalAbierto("ventas")}
              />
              <SectionCard
                title="Movimientos de caja"
                icon="💰"
                badge={reporte.movimientos.length}
                colorClass="purple"
                stats={
                  <>
                    <span className="rpt-monto-pos">+ {COP(reporte.resumen.totalIngresos)}</span>
                    <span className="rpt-monto-neg">− {COP(reporte.resumen.totalEgresos)}</span>
                  </>
                }
                onClick={() => setModalAbierto("movimientos")}
              />
              {reporte.productosMasVendidos.length > 0 && (
                <SectionCard
                  title="Productos más vendidos"
                  icon="📦"
                  badge={reporte.productosMasVendidos.length}
                  colorClass="green"
                  stats={
                    <span>
                      Top: <strong>{reporte.productosMasVendidos[0]?.nombre}</strong>
                    </span>
                  }
                  onClick={() => setModalAbierto("productos")}
                />
              )}
              {reporte.ventasPorCategoria.length > 0 && (
                <SectionCard
                  title="Ventas por categoría"
                  icon="🏷️"
                  badge={reporte.ventasPorCategoria.length}
                  colorClass="amber"
                  stats={
                    <span>
                      Top: <strong>{reporte.ventasPorCategoria[0]?.categoria}</strong>{" "}
                      ({COP(reporte.ventasPorCategoria[0]?.total)})
                    </span>
                  }
                  onClick={() => setModalAbierto("categorias")}
                />
              )}
              {reporte.tipo !== "turno" && reporte.turnos.length > 0 && (
                <SectionCard
                  title="Turnos de caja"
                  icon="⏱️"
                  badge={reporte.turnos.length}
                  colorClass="teal"
                  stats={
                    <span>
                      {reporte.turnos.filter((t) => !t.cerrado_en).length > 0
                        ? `${reporte.turnos.filter((t) => !t.cerrado_en).length} abierto(s)`
                        : "Todos cerrados"}
                    </span>
                  }
                  onClick={() => setModalAbierto("turnos")}
                />
              )}
            </div>
          </>
        )}

        {/* Estado inicial (sin reporte) */}
        {!cargando && !reporte && !error && (
          <section className="nt-card">
            <div className="rpt-empty">
              <div className="rpt-empty-icon">📊</div>
              <p className="rpt-empty-text">
                Selecciona el período y presiona <strong>Generar reporte</strong> para ver los datos financieros.
              </p>
            </div>
          </section>
        )}

        {/* ── Zona de peligro ── */}
        <div className="rpt-danger-zone">
          <div className="rpt-danger-zone-text">
            <h3>🗑️ Limpiar historial financiero</h3>
            <p>
              Borra todas las ventas, movimientos de caja y turnos para empezar un período nuevo.
              El inventario de productos no se elimina.{" "}
              <strong>Recomendado: descarga el reporte general antes de ejecutar esta acción.</strong>
            </p>
            {errorTurnoAbierto && (
              <p style={{ marginTop: 8, marginBottom: 0, color: "#dc2626", fontWeight: 700, fontSize: 13 }}>
                ⛔ Hay un turno de caja abierto. Cierra el turno desde la sección Caja antes de limpiar los datos.
              </p>
            )}
          </div>
          <button
            className="rpt-btn-danger-zone"
            onClick={handleAbrirLimpieza}
            disabled={verificandoTurno}
          >
            {verificandoTurno ? (
              <>
                <span className="rpt-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                Verificando…
              </>
            ) : (
              "Limpiar datos financieros"
            )}
          </button>
        </div>

      </div>

      {/* Modal de detalle de sección */}
      {modalAbierto && reporte && (
        <DetalleModal
          tipo={modalAbierto}
          reporte={reporte}
          onClose={() => setModalAbierto(null)}
        />
      )}

      {/* Modal de limpieza */}
      {modalLimpieza && (
        <ModalLimpiezaDatos
          onClose={() => setModalLimpieza(false)}
          onExito={() => {
            setReporte(null);
            setTurnoSelId(null);
            setModalLimpieza(false);
          }}
        />
      )}

    </AppShell>
  );
}
