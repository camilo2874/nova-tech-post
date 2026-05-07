import { useCallback, useEffect, useState } from "react";
import {
  abrirCaja,
  buscarMovimientosGlobales,
  cerrarCaja,
  listarMovimientosCaja,
  obtenerCajaAbierta,
  obtenerDetalleVenta,
  obtenerResumenesVentas,
  obtenerResumenTurno,
  obtenerSaldoUltimoCierre,
  registrarMovimientoCaja,
} from "../services/cajaServicio";
import { useCaja } from "../context/CajaContext";
import "./CajaAperturaHero.css";

const fmt = (n) =>
  `$ ${Number(n || 0).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function calcularDuracion(abierto_en) {
  if (!abierto_en) return "—";
  const ms = Date.now() - new Date(abierto_en).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

// ── Modal genérico ────────────────────────────────────────────────────────────
function Modal({ onClose, children, wide = false }) {
  useEffect(() => {
    const handler = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: "20px",
          padding: "2rem",
          width: "100%",
          maxWidth: wide ? "680px" : "460px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Extrae el UUID de venta del concepto si el movimiento es una venta automática
function extraerVentaId(concepto) {
  const match = concepto?.match(/^Venta\s+([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

// ── Modal detalle de un movimiento ───────────────────────────────────────────
function ModalDetalleMovimiento({ movimiento, onClose }) {
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const ventaId = extraerVentaId(movimiento.concepto);
  const esVenta = Boolean(ventaId);
  const vendedorMovimiento = movimiento.usuarios?.nombre ?? null;

  useEffect(() => {
    if (!ventaId) return;
    setCargando(true);
    obtenerDetalleVenta(ventaId)
      .then(setDetalle)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [ventaId]);

  const metodoPagoLabel = { efectivo: "💵 Efectivo", transferencia: "🏦 Transferencia", tarjeta: "💳 Tarjeta" };
  const refCorta = ventaId ? ventaId.slice(-8).toUpperCase() : null;

  return (
    <Modal onClose={onClose} wide>
      {/* Cabecera */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "46px", height: "46px", flexShrink: 0,
            background: movimiento.tipo === "ingreso"
              ? "linear-gradient(135deg, #047857, #10b981)"
              : "linear-gradient(135deg, #b91c1c, #ef4444)",
            borderRadius: "12px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.3rem",
          }}>
            {esVenta ? "🛒" : movimiento.tipo === "ingreso" ? "↓" : "↑"}
          </div>
          <div>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: "1.05rem", color: "#111827" }}>
              {esVenta ? "Detalle de Venta" : movimiento.tipo === "ingreso" ? "Ingreso Manual" : "Retiro de Efectivo"}
            </h3>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280" }}>
              {new Date(movimiento.creado_en).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" })}
            </p>
          </div>
        </div>
        <button
          type="button" onClick={onClose}
          style={{
            background: "#f3f4f6", border: "none", borderRadius: "8px",
            width: "32px", height: "32px", cursor: "pointer", fontSize: "1rem",
            color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >✕</button>
      </div>

      {/* Monto principal */}
      <div style={{
        background: movimiento.tipo === "ingreso" ? "#f0fdf4" : "#fef2f2",
        border: `1.5px solid ${movimiento.tipo === "ingreso" ? "#bbf7d0" : "#fecaca"}`,
        borderRadius: "14px", padding: "1rem 1.3rem",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: "1rem",
      }}>
        <div>
          <div style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 600, marginBottom: "4px" }}>
            {movimiento.tipo === "ingreso" ? "MONTO INGRESADO" : "MONTO RETIRADO"}
          </div>
          <div style={{ fontSize: "1.7rem", fontWeight: 800, color: movimiento.tipo === "ingreso" ? "#15803d" : "#b91c1c" }}>
            {movimiento.tipo === "retiro" ? "− " : "+ "}{fmt(movimiento.monto)}
          </div>
        </div>
        <span style={{
          background: movimiento.tipo === "ingreso" ? "#dcfce7" : "#fee2e2",
          color: movimiento.tipo === "ingreso" ? "#15803d" : "#b91c1c",
          padding: "4px 14px", borderRadius: "20px", fontSize: "0.8rem", fontWeight: 700,
        }}>
          {movimiento.tipo === "ingreso" ? "↓ Ingreso" : "↑ Retiro"}
        </span>
      </div>

      {/* Info general: quién + referencia */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "1rem" }}>
        <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px 13px" }}>
          <div style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 600, marginBottom: "3px" }}>
            {esVenta ? "ATENDIDO POR" : "REGISTRADO POR"}
          </div>
          <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#111827" }}>
            {(esVenta ? detalle?.usuarios?.nombre : vendedorMovimiento) ?? "—"}
          </div>
        </div>
        {esVenta && refCorta ? (
          <div style={{ background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: "10px", padding: "10px 13px" }}>
            <div style={{ fontSize: "0.7rem", color: "#6d28d9", fontWeight: 600, marginBottom: "3px" }}>N° DE FACTURA</div>
            <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#4c1d95", fontFamily: "monospace" }}>
              #{refCorta}
            </div>
            <div style={{ fontSize: "0.64rem", color: "#9ca3af", marginTop: "2px", wordBreak: "break-all" }}>
              {ventaId}
            </div>
          </div>
        ) : !esVenta ? (
          <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px 13px" }}>
            <div style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 600, marginBottom: "3px" }}>CONCEPTO</div>
            <div style={{ fontSize: "0.88rem", fontWeight: 500, color: "#111827" }}>{movimiento.concepto}</div>
          </div>
        ) : null}
      </div>

      {/* Detalle de venta */}
      {esVenta && (
        <>
          {cargando && (
            <div style={{ textAlign: "center", padding: "1.5rem", color: "#9ca3af", fontSize: "0.88rem" }}>
              Cargando productos...
            </div>
          )}
          {error && <div className="nt-alert nt-alert-error" style={{ marginBottom: "1rem" }}>{error}</div>}
          {detalle && (
            <>
              {/* Método de pago */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "1rem", flexWrap: "wrap" }}>
                <div style={{
                  background: "#eff6ff", border: "1px solid #bfdbfe",
                  borderRadius: "8px", padding: "7px 13px",
                  fontSize: "0.82rem", color: "#1d4ed8", fontWeight: 600,
                }}>
                  {metodoPagoLabel[detalle.metodo_pago] ?? detalle.metodo_pago}
                </div>
                {Number(detalle.descuento) > 0 && (
                  <div style={{
                    background: "#fefce8", border: "1px solid #fde68a",
                    borderRadius: "8px", padding: "7px 13px",
                    fontSize: "0.82rem", color: "#92400e", fontWeight: 600,
                  }}>
                    🏷️ Descuento: {fmt(detalle.descuento)}
                  </div>
                )}
              </div>

              {/* Tabla de productos */}
              <div style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 600, marginBottom: "6px", letterSpacing: "0.03em" }}>
                PRODUCTOS VENDIDOS
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "10px", overflow: "hidden", marginBottom: "1rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["Producto", "Código", "Cant.", "Precio unit.", "Subtotal"].map((h) => (
                        <th key={h} style={{
                          textAlign: "left", padding: "8px 11px",
                          color: "#6b7280", fontWeight: 600, fontSize: "0.74rem",
                          borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(detalle.detalle_venta ?? []).map((d, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? "white" : "#fafafa" }}>
                        <td style={{ padding: "9px 11px", color: "#111827", fontWeight: 600 }}>
                          {d.productos?.nombre ?? "—"}
                        </td>
                        <td style={{ padding: "9px 11px", color: "#6b7280", fontFamily: "monospace", fontSize: "0.78rem" }}>
                          {d.productos?.codigo_barras ?? "—"}
                        </td>
                        <td style={{ padding: "9px 11px", color: "#374151", textAlign: "center", fontWeight: 600 }}>
                          {d.cantidad}
                        </td>
                        <td style={{ padding: "9px 11px", color: "#374151" }}>
                          {fmt(d.precio_unitario)}
                        </td>
                        <td style={{ padding: "9px 11px", fontWeight: 700, color: "#047857" }}>
                          {fmt(Number(d.cantidad) * Number(d.precio_unitario))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totales */}
              <div style={{
                background: "#f8fafc", border: "1px solid #e5e7eb",
                borderRadius: "10px", padding: "12px 14px",
                display: "flex", flexDirection: "column", gap: "7px",
              }}>
                {Number(detalle.descuento) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#6b7280" }}>
                    <span>Subtotal (lista)</span><span>{fmt(detalle.subtotal)}</span>
                  </div>
                )}
                {Number(detalle.descuento) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#b45309" }}>
                    <span>Descuento aplicado</span><span>− {fmt(detalle.descuento)}</span>
                  </div>
                )}
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  fontSize: "1.05rem", fontWeight: 800, color: "#111827",
                  borderTop: Number(detalle.descuento) > 0 ? "2px solid #e5e7eb" : "none",
                  paddingTop: Number(detalle.descuento) > 0 ? "8px" : 0,
                }}>
                  <span>Total cobrado</span>
                  <span style={{ color: "#047857" }}>{fmt(detalle.total)}</span>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

// ── Modal Historial Global (todos los turnos) ─────────────────────────────────
function ModalHistorialGlobal({ onClose }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [resultados, setResultados] = useState(null);
  const [resumenVentas, setResumenVentas] = useState({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [movSeleccionado, setMovSeleccionado] = useState(null);

  async function buscar() {
    setCargando(true);
    setError("");
    try {
      const data = await buscarMovimientosGlobales({
        tipo: filtroTipo !== "todos" ? filtroTipo : null,
        fechaDesde: fechaDesde || null,
        fechaHasta: fechaHasta || null,
        busqueda: busqueda || null,
      });
      setResultados(data);
      const ventaIds = data.map((m) => extraerVentaId(m.concepto)).filter(Boolean);
      if (ventaIds.length) {
        obtenerResumenesVentas(ventaIds).then(setResumenVentas).catch(() => {});
      } else {
        setResumenVentas({});
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  const totalResultados = resultados
    ? resultados.reduce((acc, m) => {
        if (m.tipo === "ingreso") acc.ingresos += Number(m.monto);
        else acc.retiros += Number(m.monto);
        return acc;
      }, { ingresos: 0, retiros: 0 })
    : null;

  function labelTurno(m) {
    if (!m.caja?.abierto_en) return "—";
    const desde = new Date(m.caja.abierto_en).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
    const hasta = m.caja.cerrado_en
      ? new Date(m.caja.cerrado_en).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })
      : "activo";
    return `${desde} → ${hasta}`;
  }

  return (
    <>
      <Modal onClose={onClose} wide>
        {/* Cabecera */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "44px", height: "44px",
              background: "linear-gradient(135deg, #0f172a, #334155)",
              borderRadius: "12px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.2rem", flexShrink: 0,
            }}>🔎</div>
            <div>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: "1.05rem", color: "#111827" }}>
                Búsqueda Global de Movimientos
              </h3>
              <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280" }}>
                Busca en todos los turnos — pasados y activo
              </p>
            </div>
          </div>
          <button
            type="button" onClick={onClose}
            style={{
              background: "#f3f4f6", border: "none", borderRadius: "8px",
              width: "32px", height: "32px", cursor: "pointer", fontSize: "1rem",
              color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >✕</button>
        </div>

        {/* Filtros */}
        <div style={{
          background: "#f8fafc", border: "1px solid #e5e7eb",
          borderRadius: "12px", padding: "14px",
          display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "1rem",
        }}>
          {/* Búsqueda texto */}
          <div style={{ flex: "1 1 180px" }}>
            <label style={{ display: "block", fontSize: "0.74rem", color: "#6b7280", fontWeight: 600, marginBottom: "5px", letterSpacing: "0.03em" }}>BUSCAR</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "0.85rem", color: "#9ca3af" }}>🔍</span>
              <input
                className="nt-field"
                placeholder="Concepto o producto..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscar()}
                style={{ paddingLeft: "30px", fontSize: "0.85rem" }}
              />
            </div>
          </div>

          {/* Tipo */}
          <div style={{ flex: "0 0 135px" }}>
            <label style={{ display: "block", fontSize: "0.74rem", color: "#6b7280", fontWeight: 600, marginBottom: "5px", letterSpacing: "0.03em" }}>TIPO</label>
            <select className="nt-field" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ fontSize: "0.85rem" }}>
              <option value="todos">Todos</option>
              <option value="ingreso">Solo ingresos</option>
              <option value="retiro">Solo retiros</option>
            </select>
          </div>

          {/* Fecha desde */}
          <div style={{ flex: "0 0 150px" }}>
            <label style={{ display: "block", fontSize: "0.74rem", color: "#6b7280", fontWeight: 600, marginBottom: "5px", letterSpacing: "0.03em" }}>DESDE</label>
            <input className="nt-field" type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} style={{ fontSize: "0.85rem" }} />
          </div>

          {/* Fecha hasta */}
          <div style={{ flex: "0 0 150px" }}>
            <label style={{ display: "block", fontSize: "0.74rem", color: "#6b7280", fontWeight: 600, marginBottom: "5px", letterSpacing: "0.03em" }}>HASTA</label>
            <input className="nt-field" type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} style={{ fontSize: "0.85rem" }} />
          </div>

          {/* Botón buscar */}
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              type="button"
              onClick={buscar}
              disabled={cargando}
              style={{
                background: "linear-gradient(135deg, #0f172a, #334155)",
                border: "none", borderRadius: "8px", color: "white",
                padding: "8px 20px", cursor: "pointer", fontWeight: 700,
                fontSize: "0.85rem", whiteSpace: "nowrap",
                opacity: cargando ? 0.6 : 1,
              }}
            >
              {cargando ? "Buscando..." : "🔎 Buscar"}
            </button>
          </div>
        </div>

        {error && <div className="nt-alert nt-alert-error" style={{ marginBottom: "1rem" }}>{error}</div>}

        {/* Estado inicial — sin búsqueda */}
        {resultados === null && !cargando && (
          <div style={{ textAlign: "center", padding: "2.5rem", color: "#9ca3af" }}>
            <div style={{ fontSize: "2rem", marginBottom: "10px" }}>🔎</div>
            <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 500 }}>
              Aplica filtros y pulsa <strong>Buscar</strong>
            </p>
            <p style={{ margin: "6px 0 0", fontSize: "0.8rem" }}>
              Puedes buscar por concepto, producto, fecha o tipo en todos los turnos
            </p>
          </div>
        )}

        {/* Sin resultados */}
        {resultados?.length === 0 && (
          <div style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>
            <div style={{ fontSize: "1.8rem", marginBottom: "8px" }}>📭</div>
            <p style={{ margin: 0, fontSize: "0.88rem" }}>Ningún movimiento coincide con los filtros</p>
          </div>
        )}

        {/* Resultados */}
        {resultados?.length > 0 && (
          <>
            {/* Mini resumen */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "1rem" }}>
              {[
                { label: "Resultados", value: resultados.length, color: "#374151", bg: "#f8fafc", border: "#e2e8f0" },
                { label: "Total ingresos", value: fmt(totalResultados.ingresos), color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
                { label: "Total retiros", value: fmt(totalResultados.retiros), color: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
              ].map((s) => (
                <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: "10px", padding: "10px 13px", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "0.74rem", color: "#6b7280" }}>{s.label}</span>
                  <span style={{ fontWeight: 700, color: s.color, fontSize: "0.95rem" }}>{s.value}</span>
                </div>
              ))}
            </div>

            <div style={{ maxHeight: "320px", overflowY: "auto", borderRadius: "10px", border: "1px solid #f3f4f6" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                <thead style={{ position: "sticky", top: 0, background: "#f9fafb", zIndex: 1 }}>
                  <tr>
                    {["", "Tipo", "Monto", "Concepto / Producto", "Turno", "Fecha", ""].map((h) => (
                      <th key={h} style={{
                        textAlign: "left", padding: "9px 11px",
                        color: "#6b7280", fontWeight: 600, fontSize: "0.74rem",
                        borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((m, i) => {
                    const vid = extraerVentaId(m.concepto);
                    const esVenta = Boolean(vid);
                    const productos = vid ? (resumenVentas[vid] ?? []) : [];
                    const conceptoTexto = productos.length
                      ? productos.join(", ")
                      : esVenta ? "Venta de productos" : m.concepto;

                    return (
                      <tr
                        key={m.id}
                        onClick={() => setMovSeleccionado(m)}
                        style={{ background: i % 2 === 0 ? "white" : "#fafafa", cursor: "pointer" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "white" : "#fafafa")}
                      >
                        <td style={{ padding: "9px 11px" }}>
                          <span style={{ fontSize: "0.9rem" }}>{esVenta ? "🛒" : "📝"}</span>
                        </td>
                        <td style={{ padding: "9px 11px" }}>
                          <span style={{
                            background: m.tipo === "ingreso" ? "#dcfce7" : "#fee2e2",
                            color: m.tipo === "ingreso" ? "#15803d" : "#b91c1c",
                            padding: "2px 8px", borderRadius: "20px",
                            fontSize: "0.72rem", fontWeight: 600, whiteSpace: "nowrap",
                          }}>
                            {m.tipo === "ingreso" ? "↓ Ingreso" : "↑ Retiro"}
                          </span>
                        </td>
                        <td style={{ padding: "9px 11px", fontWeight: 700, color: m.tipo === "ingreso" ? "#15803d" : "#b91c1c", whiteSpace: "nowrap" }}>
                          {m.tipo === "retiro" ? "− " : "+ "}{fmt(m.monto)}
                        </td>
                        <td style={{ padding: "9px 11px", maxWidth: "180px" }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111827", fontSize: "0.83rem" }}>
                            {conceptoTexto}
                          </div>
                          {esVenta && vid && (
                            <div style={{ fontSize: "0.68rem", color: "#9ca3af", fontFamily: "monospace" }}>#{vid.slice(-8).toUpperCase()}</div>
                          )}
                        </td>
                        <td style={{ padding: "9px 11px", color: "#6b7280", fontSize: "0.74rem", whiteSpace: "nowrap" }}>
                          {labelTurno(m)}
                        </td>
                        <td style={{ padding: "9px 11px", color: "#9ca3af", fontSize: "0.74rem", whiteSpace: "nowrap" }}>
                          {new Date(m.creado_en).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td style={{ padding: "9px 11px", color: "#9ca3af" }}>›</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>

      {movSeleccionado && (
        <ModalDetalleMovimiento movimiento={movSeleccionado} onClose={() => setMovSeleccionado(null)} />
      )}
    </>
  );
}

// ── Modal Historial con filtros ───────────────────────────────────────────────
function ModalHistorial({ movimientos, resumen, onClose }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroFecha, setFiltroFecha] = useState("");
  const [movSeleccionado, setMovSeleccionado] = useState(null);
  const [resumenVentas, setResumenVentas] = useState({});

  // Carga en un solo batch los nombres de productos para todas las ventas del historial
  useEffect(() => {
    const ventaIds = movimientos
      .map((m) => extraerVentaId(m.concepto))
      .filter(Boolean);
    if (!ventaIds.length) return;
    obtenerResumenesVentas(ventaIds).then(setResumenVentas).catch(() => {});
  }, [movimientos]);

  const filtrados = movimientos.filter((m) => {
    const coincideTexto = busqueda.trim() === "" ||
      m.concepto.toLowerCase().includes(busqueda.toLowerCase()) ||
      String(m.monto).includes(busqueda.trim());
    const coincideTipo = filtroTipo === "todos" || m.tipo === filtroTipo;
    const coincideFecha = filtroFecha === "" ||
      new Date(m.creado_en).toLocaleDateString("en-CA") === filtroFecha;
    return coincideTexto && coincideTipo && coincideFecha;
  });

  const totalFiltrado = filtrados.reduce(
    (acc, m) => {
      if (m.tipo === "ingreso") acc.ingresos += Number(m.monto);
      else acc.retiros += Number(m.monto);
      return acc;
    },
    { ingresos: 0, retiros: 0 },
  );

  const hayFiltros = busqueda.trim() !== "" || filtroTipo !== "todos" || filtroFecha !== "";

  function limpiarFiltros() {
    setBusqueda("");
    setFiltroTipo("todos");
    setFiltroFecha("");
  }

  return (
    <>
      <Modal onClose={onClose} wide>
        {/* Cabecera */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "44px", height: "44px",
              background: "linear-gradient(135deg, #6d28d9, #8b5cf6)",
              borderRadius: "12px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.2rem", flexShrink: 0,
            }}>📋</div>
            <div>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: "1.05rem", color: "#111827" }}>
                Historial de Movimientos
              </h3>
              <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280" }}>
                {movimientos.length} movimiento{movimientos.length !== 1 ? "s" : ""} · toca uno para ver el detalle
              </p>
            </div>
          </div>
          <button
            type="button" onClick={onClose}
            style={{
              background: "#f3f4f6", border: "none", borderRadius: "8px",
              width: "32px", height: "32px", cursor: "pointer", fontSize: "1rem",
              color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >✕</button>
        </div>

        {/* Mini-resumen */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "1.1rem" }}>
          {[
            {
              label: hayFiltros ? "Ingresos filtrados" : "Ingresos del turno",
              value: fmt(hayFiltros ? totalFiltrado.ingresos : resumen.total_ingresos),
              color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0",
            },
            {
              label: hayFiltros ? "Retiros filtrados" : "Retiros del turno",
              value: fmt(hayFiltros ? totalFiltrado.retiros : resumen.total_retiros),
              color: "#b91c1c", bg: "#fef2f2", border: "#fecaca",
            },
          ].map((s) => (
            <div key={s.label} style={{
              background: s.bg, border: `1px solid ${s.border}`,
              borderRadius: "10px", padding: "10px 14px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: "0.78rem", color: "#374151" }}>{s.label}</span>
              <span style={{ fontWeight: 700, color: s.color, fontSize: "0.95rem" }}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{
          background: "#f8fafc", border: "1px solid #e5e7eb",
          borderRadius: "12px", padding: "12px 14px",
          marginBottom: "1rem", display: "flex", gap: "10px",
          flexWrap: "wrap", alignItems: "flex-end",
        }}>
          <div style={{ flex: "1 1 180px" }}>
            <label style={{ display: "block", fontSize: "0.74rem", color: "#6b7280", fontWeight: 600, marginBottom: "5px", letterSpacing: "0.03em" }}>
              BUSCAR
            </label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "0.85rem", color: "#9ca3af" }}>🔍</span>
              <input
                className="nt-field"
                placeholder="Concepto o monto..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                style={{ paddingLeft: "30px", fontSize: "0.85rem" }}
              />
            </div>
          </div>

          <div style={{ flex: "0 0 140px" }}>
            <label style={{ display: "block", fontSize: "0.74rem", color: "#6b7280", fontWeight: 600, marginBottom: "5px", letterSpacing: "0.03em" }}>
              TIPO
            </label>
            <select
              className="nt-field"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              style={{ fontSize: "0.85rem" }}
            >
              <option value="todos">Todos</option>
              <option value="ingreso">Solo ingresos</option>
              <option value="retiro">Solo retiros</option>
            </select>
          </div>

          <div style={{ flex: "0 0 160px" }}>
            <label style={{ display: "block", fontSize: "0.74rem", color: "#6b7280", fontWeight: 600, marginBottom: "5px", letterSpacing: "0.03em" }}>
              FECHA
            </label>
            <input
              className="nt-field"
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              style={{ fontSize: "0.85rem" }}
            />
          </div>

          {hayFiltros && (
            <button
              type="button" onClick={limpiarFiltros}
              style={{
                background: "white", border: "1px solid #d1d5db",
                borderRadius: "8px", padding: "7px 14px", cursor: "pointer",
                fontSize: "0.8rem", color: "#6b7280", fontWeight: 600,
                whiteSpace: "nowrap", alignSelf: "flex-end",
              }}
            >✕ Limpiar</button>
          )}
        </div>

        {hayFiltros && (
          <p style={{ margin: "0 0 8px", fontSize: "0.78rem", color: "#6b7280" }}>
            {filtrados.length === 0
              ? "No hay movimientos que coincidan"
              : `${filtrados.length} resultado${filtrados.length !== 1 ? "s" : ""} encontrado${filtrados.length !== 1 ? "s" : ""}`}
          </p>
        )}

        {/* Tabla */}
        {movimientos.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2.5rem", color: "#9ca3af" }}>
            <div style={{ fontSize: "2rem", marginBottom: "10px" }}>📭</div>
            <p style={{ margin: 0, fontSize: "0.88rem" }}>Aún no hay movimientos en este turno</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>
            <div style={{ fontSize: "1.8rem", marginBottom: "8px" }}>🔍</div>
            <p style={{ margin: 0, fontSize: "0.88rem" }}>Ningún movimiento coincide con los filtros</p>
            <button
              type="button" onClick={limpiarFiltros}
              style={{ marginTop: "10px", background: "none", border: "none", color: "#6d28d9", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 }}
            >Limpiar filtros</button>
          </div>
        ) : (
          <div style={{ maxHeight: "300px", overflowY: "auto", borderRadius: "10px", border: "1px solid #f3f4f6" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f9fafb", zIndex: 1 }}>
                <tr>
                  {["Origen", "Tipo", "Monto", "Concepto / Producto", "Fecha", ""].map((h) => (
                    <th key={h} style={{
                      textAlign: "left", padding: "9px 12px",
                      color: "#6b7280", fontWeight: 600, fontSize: "0.76rem",
                      borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((m, i) => {
                  const vid = extraerVentaId(m.concepto);
                  const esVenta = Boolean(vid);
                  const productos = vid ? (resumenVentas[vid] ?? []) : [];
                  const productosTexto = productos.length
                    ? productos.join(", ")
                    : esVenta ? "Cargando..." : m.concepto;

                  return (
                    <tr
                      key={m.id}
                      onClick={() => setMovSeleccionado(m)}
                      style={{
                        background: i % 2 === 0 ? "white" : "#fafafa",
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "white" : "#fafafa")}
                    >
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontSize: "1rem" }}>{esVenta ? "🛒" : "📝"}</span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{
                          background: m.tipo === "ingreso" ? "#dcfce7" : "#fee2e2",
                          color: m.tipo === "ingreso" ? "#15803d" : "#b91c1c",
                          padding: "2px 9px", borderRadius: "20px",
                          fontSize: "0.74rem", fontWeight: 600, whiteSpace: "nowrap",
                        }}>
                          {m.tipo === "ingreso" ? "↓ Ingreso" : "↑ Retiro"}
                        </span>
                      </td>
                      <td style={{
                        padding: "10px 12px", fontWeight: 700,
                        color: m.tipo === "ingreso" ? "#15803d" : "#b91c1c", whiteSpace: "nowrap",
                      }}>
                        {m.tipo === "retiro" ? "− " : "+ "}{fmt(m.monto)}
                      </td>
                      <td style={{ padding: "10px 12px", maxWidth: "200px" }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111827", fontWeight: esVenta ? 500 : 400, fontSize: "0.84rem" }}>
                          {productosTexto}
                        </div>
                        {esVenta && vid && (
                          <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: "1px", fontFamily: "monospace" }}>
                            #{vid.slice(-8).toUpperCase()}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#9ca3af", fontSize: "0.76rem", whiteSpace: "nowrap" }}>
                        {new Date(m.creado_en).toLocaleString("es-CO", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#9ca3af" }}>›</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Sub-modal: detalle del movimiento seleccionado */}
      {movSeleccionado && (
        <ModalDetalleMovimiento
          movimiento={movSeleccionado}
          onClose={() => setMovSeleccionado(null)}
        />
      )}
    </>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function CajaTurnoPanel({ usuarioId, onCajaAbiertaChange }) {
  const { modoVisor, turnoActivo } = useCaja();

  const [caja, setCaja] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [saldoAnterior, setSaldoAnterior] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [errorLocal, setErrorLocal] = useState("");
  const [procesando, setProcesando] = useState(false);

  // Apertura
  const [montoApertura, setMontoApertura] = useState("0");
  const [motivoDiferenciaApertura, setMotivoDiferenciaApertura] = useState("");

  // Modal activo: null | "retiro" | "cierre"
  const [modalActivo, setModalActivo] = useState(null);

  // Retiro
  const [retiroMonto, setRetiroMonto] = useState("");
  const [retiroConcepto, setRetiroConcepto] = useState("");

  // Ingreso manual
  const [ingresoMonto, setIngresoMonto] = useState("");
  const [ingresoConcepto, setIngresoConcepto] = useState("");

  // Cierre
  const [cierreContado, setCierreContado] = useState("");
  const [cierreNotas, setCierreNotas] = useState("");

  // Tick para duración
  const [, setTick] = useState(0);

  const notificar = useCallback(
    (fila) => {
      setCaja(fila);
      onCajaAbiertaChange?.(fila ?? null);
    },
    [onCajaAbiertaChange],
  );

  const refrescarTodo = useCallback(async () => {
    if (!usuarioId) { notificar(null); return; }
    setCargando(true);
    setErrorLocal("");
    try {
      const abierta = await obtenerCajaAbierta(usuarioId);
      notificar(abierta);

      if (abierta?.id) {
        // El usuario actual es el operador: carga sus propios datos
        const [lista, res] = await Promise.all([
          listarMovimientosCaja(abierta.id),
          obtenerResumenTurno(abierta.id),
        ]);
        setMovimientos(lista);
        setResumen(res);
      } else if (modoVisor && turnoActivo?.caja_id) {
        // Modo visor: no tenemos turno propio, pero existe un turno activo de otro usuario.
        // Cargamos sus métricas para monitoreo (RLS permite lectura a admin/superadmin).
        try {
          const [lista, res] = await Promise.all([
            listarMovimientosCaja(turnoActivo.caja_id),
            obtenerResumenTurno(turnoActivo.caja_id),
          ]);
          setMovimientos(lista);
          setResumen(res);
        } catch {
          // Si RLS bloquea (p. ej. cajero viendo a otro cajero), mostrar vacío sin error
          setMovimientos([]);
          setResumen(null);
        }
      } else {
        // Sin turno activo en ningún lado
        setMovimientos([]);
        setResumen(null);
        const saldo = await obtenerSaldoUltimoCierre();
        setSaldoAnterior(saldo);
        setMontoApertura(String(saldo));
      }
    } catch (err) {
      setErrorLocal(err.message);
      notificar(null);
    } finally {
      setCargando(false);
    }
  }, [usuarioId, notificar, modoVisor, turnoActivo?.caja_id]);

  useEffect(() => { refrescarTodo(); }, [refrescarTodo]);

  // Duración: tick cada minuto
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // Auto-refresco cada 30 s cuando hay turno abierto (propio o en modo visor)
  useEffect(() => {
    const cajaId = caja?.id ?? (modoVisor ? turnoActivo?.caja_id : null);
    if (!cajaId) return;
    const id = setInterval(async () => {
      try {
        const [lista, res] = await Promise.all([
          listarMovimientosCaja(cajaId),
          obtenerResumenTurno(cajaId),
        ]);
        setMovimientos(lista);
        setResumen(res);
      } catch { /* silencioso */ }
    }, 30000);
    return () => clearInterval(id);
  }, [caja?.id, modoVisor, turnoActivo?.caja_id]);

  // ── Acciones ────────────────────────────────────────────────────────────────
  async function manejarAbrir() {
    if (!usuarioId) return;
    setProcesando(true);
    setErrorLocal("");
    try {
      const fila = await abrirCaja({ usuarioId, montoApertura, motivoDiferenciaApertura });
      notificar(fila);
      setMovimientos([]);
      setMotivoDiferenciaApertura("");
      // monto_apertura en BD = saldoAnterior (base heredada); la diferencia va a movimientos
      const base = fila.monto_apertura ?? Number(montoApertura);
      setResumen({ monto_apertura: base, total_ingresos: 0, total_retiros: 0, efectivo_en_caja: base, total_movimientos: 0 });
    } catch (err) {
      setErrorLocal(err.message);
    } finally {
      setProcesando(false);
    }
  }

  async function manejarRetiro() {
    if (!usuarioId || !caja?.id) return;
    setProcesando(true);
    setErrorLocal("");
    try {
      await registrarMovimientoCaja({ cajaId: caja.id, usuarioId, tipo: "retiro", monto: retiroMonto, concepto: retiroConcepto });
      setRetiroMonto("");
      setRetiroConcepto("");
      setModalActivo(null);
      const [lista, res] = await Promise.all([listarMovimientosCaja(caja.id), obtenerResumenTurno(caja.id)]);
      setMovimientos(lista);
      setResumen(res);
    } catch (err) {
      setErrorLocal(err.message);
    } finally {
      setProcesando(false);
    }
  }

  async function manejarIngreso() {
    if (!usuarioId || !caja?.id) return;
    setProcesando(true);
    setErrorLocal("");
    try {
      await registrarMovimientoCaja({ cajaId: caja.id, usuarioId, tipo: "ingreso", monto: ingresoMonto, concepto: ingresoConcepto });
      setIngresoMonto("");
      setIngresoConcepto("");
      setModalActivo(null);
      const [lista, res] = await Promise.all([listarMovimientosCaja(caja.id), obtenerResumenTurno(caja.id)]);
      setMovimientos(lista);
      setResumen(res);
    } catch (err) {
      setErrorLocal(err.message);
    } finally {
      setProcesando(false);
    }
  }

  async function manejarCerrar() {
    if (!usuarioId || !caja?.id) return;
    setProcesando(true);
    setErrorLocal("");
    try {
      await cerrarCaja({ cajaId: caja.id, usuarioId, montoCierreEfectivo: cierreContado === "" ? null : cierreContado, notasCierre: cierreNotas });
      notificar(null);
      setMovimientos([]);
      setResumen(null);
      setModalActivo(null);
      setCierreContado("");
      setCierreNotas("");
    } catch (err) {
      setErrorLocal(err.message);
    } finally {
      setProcesando(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!usuarioId) return null;

  if (cargando) {
    return (
      <div className="caja-ap-wrap">
        <div className="nt-card caja-ap-loading-card" role="status" aria-live="polite">
          <div className="caja-ap-ring" />
          <p>Preparando datos de caja…</p>
        </div>
      </div>
    );
  }

  // ── MODO VISOR: hay un turno activo pero es de otro usuario ──────────────────
  if (!caja && modoVisor && turnoActivo) {
    const rv = resumen ?? {
      monto_apertura: turnoActivo.monto_apertura ?? 0,
      total_ingresos: 0,
      total_retiros: 0,
      efectivo_en_caja: turnoActivo.monto_apertura ?? 0,
      total_movimientos: 0,
    };

    return (
      <div className="nt-stack">
        {errorLocal && <div className="nt-alert nt-alert-error">{errorLocal}</div>}

        {/* Banner visor */}
        <div style={{
          background: "linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 50%, #3b82f6 100%)",
          borderRadius: "16px",
          padding: "1.1rem 1.5rem",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{
              width: "44px", height: "44px",
              background: "rgba(255,255,255,0.18)",
              borderRadius: "12px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.3rem",
            }}>👁</div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>Modo Visor</span>
                <span style={{
                  background: "rgba(255,255,255,0.22)",
                  padding: "2px 9px", borderRadius: "20px",
                  fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.07em",
                }}>SOLO LECTURA</span>
              </div>
              <div style={{ opacity: 0.8, fontSize: "0.82rem", marginTop: "3px" }}>
                Caja operada por <strong>{turnoActivo.operador_nombre}</strong>
                {" · "}{calcularDuracion(turnoActivo.abierto_en)} en curso
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ textAlign: "right", opacity: 0.85, fontSize: "0.8rem" }}>
              <div style={{ fontWeight: 600 }}>Abierto</div>
              <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>
                {new Date(turnoActivo.abierto_en).toLocaleString("es-CO", {
                  dateStyle: "medium", timeStyle: "short",
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={refrescarTodo}
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "8px", color: "white",
                padding: "7px 14px", cursor: "pointer",
                fontSize: "0.82rem", fontWeight: 600,
              }}
            >↻ Actualizar</button>
          </div>
        </div>

        {/* Aviso informativo */}
        <div style={{
          background: "#eff6ff", border: "1px solid #bfdbfe",
          borderRadius: "12px", padding: "12px 16px",
          display: "flex", alignItems: "flex-start", gap: "10px",
        }}>
          <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>ℹ️</span>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#1e3a8a", lineHeight: 1.5 }}>
            Estás en <strong>modo visor</strong>. Puedes monitorear el estado de la caja
            en tiempo real pero no puedes realizar ventas ni movimientos.
            Cuando <strong>{turnoActivo.operador_nombre}</strong> cierre su turno,
            podrás abrir uno nuevo.
          </p>
        </div>

        {/* 4 tarjetas de métricas (igual que operador) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: "14px" }}>
          {[
            { label: "Saldo Inicial", value: fmt(rv.monto_apertura), sub: "Base de caja", icon: "💳", from: "#1d4ed8", to: "#3b82f6" },
            { label: "Ingresos del Turno", value: fmt(rv.total_ingresos), sub: "Ventas registradas", icon: "📈", from: "#047857", to: "#10b981" },
            { label: "Retiros Realizados", value: fmt(rv.total_retiros), sub: "Caja fuerte / consig.", icon: "💸", from: "#c2410c", to: "#f97316" },
            { label: "Efectivo en Caja", value: fmt(rv.efectivo_en_caja), sub: "Balance actual", icon: "💵", from: "#6d28d9", to: "#8b5cf6" },
          ].map((c) => (
            <div key={c.label} style={{
              background: `linear-gradient(145deg, ${c.from} 0%, ${c.to} 100%)`,
              borderRadius: "16px", padding: "1.25rem 1.3rem",
              color: "white", position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", right: "-8px", top: "-8px", fontSize: "3rem", opacity: 0.12 }}>{c.icon}</div>
              <div style={{ fontSize: "0.75rem", opacity: 0.8, marginBottom: "8px", fontWeight: 500 }}>{c.label}</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, lineHeight: 1.1 }}>{c.value}</div>
              <div style={{ fontSize: "0.7rem", opacity: 0.65, marginTop: "6px" }}>{c.sub}</div>
              <div style={{ position: "absolute", right: "12px", bottom: "10px", fontSize: "1.1rem", opacity: 0.7 }}>{c.icon}</div>
            </div>
          ))}
        </div>

        {/* Stat movimientos */}
        <div style={{
          background: "white", border: "1px solid #e5e7eb",
          borderRadius: "14px", padding: "1rem 1.4rem",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "3px" }}>Movimientos en este turno</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#111827" }}>{rv.total_movimientos}</div>
          </div>
          <span style={{ fontSize: "2rem", opacity: 0.2 }}>📋</span>
        </div>

        {/* Resumen financiero */}
        <div className="nt-card" style={{ padding: "1.4rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
            <span style={{ fontSize: "1rem" }}>💲</span>
            <h4 style={{ margin: 0, fontWeight: 700, fontSize: "1rem" }}>Resumen Financiero del Turno</h4>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[
              { label: "Saldo Inicial", value: fmt(rv.monto_apertura), color: "#374151", bg: "#f8fafc", border: "#e2e8f0", icon: "💳" },
              { label: "Ingresos del Turno", value: `+ ${fmt(rv.total_ingresos)}`, color: "#047857", bg: "#f0fdf4", border: "#bbf7d0", icon: "📈" },
              { label: "Consignaciones / Retiros", value: `- ${fmt(rv.total_retiros)}`, color: "#c2410c", bg: "#fff7ed", border: "#fed7aa", icon: "💸" },
            ].map((row) => (
              <div key={row.label} style={{
                background: row.bg, border: `1px solid ${row.border}`,
                borderRadius: "10px", padding: "11px 15px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                  <span style={{ fontSize: "0.95rem" }}>{row.icon}</span>
                  <span style={{ fontSize: "0.88rem", color: "#374151" }}>{row.label}</span>
                </div>
                <span style={{ fontWeight: 700, color: row.color, fontSize: "0.95rem" }}>{row.value}</span>
              </div>
            ))}
            <div style={{
              background: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
              border: "2px solid #8b5cf6", borderRadius: "12px", padding: "13px 15px",
              display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                <span style={{ fontSize: "0.95rem" }}>💵</span>
                <div>
                  <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#374151" }}>Efectivo en Caja</div>
                  <div style={{ fontSize: "0.72rem", color: "#7c3aed" }}>Balance actual esperado</div>
                </div>
              </div>
              <span style={{ fontSize: "1.35rem", fontWeight: 800, color: "#6d28d9" }}>{fmt(rv.efectivo_en_caja)}</span>
            </div>
          </div>
        </div>

        {/* Botón historial — solo para ver */}
        <button
          type="button"
          onClick={() => setModalActivo("historialGlobal")}
          style={{
            background: "white", border: "1.5px solid #e5e7eb", borderRadius: "16px",
            padding: "1.2rem 1.3rem", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "space-between",
            width: "100%", textAlign: "left", transition: "border-color 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#334155"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(15,23,42,0.1)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "42px", height: "42px",
              background: "linear-gradient(135deg, #0f172a, #334155)",
              borderRadius: "12px", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "1.1rem", flexShrink: 0,
            }}>🔎</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#111827" }}>Historial de movimientos</div>
              <div style={{ fontSize: "0.76rem", color: "#6b7280", marginTop: "2px" }}>Busca en turnos anteriores</div>
            </div>
          </div>
          <span style={{ color: "#9ca3af", fontSize: "1.1rem" }}>›</span>
        </button>

        {/* Modal historial global (solo lectura disponible en modo visor) */}
        {modalActivo === "historialGlobal" && (
          <ModalHistorialGlobal onClose={() => setModalActivo(null)} />
        )}
      </div>
    );
  }

  // ── SIN TURNO (y sin modo visor activo) ────────────────────────────────────
  if (!caja) {
    const montoNum = Number(montoApertura) || 0;
    const diff = saldoAnterior > 0 ? montoNum - saldoAnterior : 0;
    const hayDiferencia = saldoAnterior > 0 && diff !== 0;
    const esFaltante = diff < 0;
    const esSobrante = diff > 0;
    const motivoRequerido = hayDiferencia && !motivoDiferenciaApertura.trim();

    const fechaLinea = new Date().toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const fechaBonita = fechaLinea.charAt(0).toUpperCase() + fechaLinea.slice(1);

    let cuadreVal = "—";
    let cuadreResumen =
      saldoAnterior > 0
        ? "Escribe el efectivo físico declarado para compararlo con el último cierre."
        : "Sin cierre anterior de referencia. Usa solo el montón físico en caja.";
    let cuadreTone = "muted";
    if (saldoAnterior > 0 && !hayDiferencia) {
      cuadreVal = "Alineados";
      cuadreResumen = "Declaración igual al último cierre registrado.";
      cuadreTone = "ok";
    } else if (hayDiferencia) {
      cuadreVal = fmt(diff);
      cuadreResumen = "Corrige motivo más abajo o ajusta el monto antes de confirmar.";
      cuadreTone = "warn";
    }

    return (
      <>
        {errorLocal && (
          <div className="nt-alert nt-alert-error" style={{ marginBottom: "1rem" }}>
            {errorLocal}
          </div>
        )}

        <section className="caja-ap-wrap" aria-labelledby="caja-apertura-title">
          <article className="nt-card caja-ap-card">
            <header className="caja-ap-card-head">
              <h2 id="caja-apertura-title">Abrir turno de caja</h2>
              <p className="caja-ap-lead">
                No hay turno activo. Cuenta el efectivo físico y confirma el monto para comenzar a vender en este punto de
                caja.
              </p>
              <span className="caja-ap-meta">{fechaBonita}</span>
            </header>

            <div className="caja-ap-summary">
              <div className="caja-ap-sum-cell">
                <span className="caja-ap-sum-lbl">Último cierre</span>
                <span className="caja-ap-sum-val">{saldoAnterior > 0 ? fmt(saldoAnterior) : "—"}</span>
                <span className="caja-ap-sum-status" data-tone="muted">
                  {saldoAnterior > 0 ? "Referencia sugerida" : "Sin cierre anterior"}
                </span>
              </div>
              <div className="caja-ap-sum-cell">
                <span className="caja-ap-sum-lbl">Declarado</span>
                <span className="caja-ap-sum-val">{fmt(montoNum)}</span>
                <span className="caja-ap-sum-status" data-tone="muted">
                  Efectivo en caja ahora
                </span>
              </div>
              <div className="caja-ap-sum-cell">
                <span className="caja-ap-sum-lbl">Cuadre</span>
                <span className="caja-ap-sum-val" style={{ fontSize: hayDiferencia ? "1.2rem" : "1rem" }}>
                  {cuadreVal}
                </span>
                <span className="caja-ap-sum-status" data-tone={cuadreTone}>
                  {cuadreResumen}
                </span>
              </div>
            </div>

            {saldoAnterior <= 0 && (
              <div className="caja-ap-callout" data-variant="neutral">
                No aparece saldo del último cierre en el sistema. Abre tu turno con el efectivo real que tienes físicamente
                en este momento.
              </div>
            )}

            {hayDiferencia && (
              <div className="caja-ap-callout" data-variant="risk">
                {esFaltante && (
                  <>
                    El último cierre registró{" "}
                    <strong>{fmt(saldoAnterior)}</strong> y declaras{" "}
                    <strong>{fmt(montoNum)}</strong>.
                    <br />
                    <strong>Faltante de {fmt(Math.abs(diff))}.</strong> Documenta el motivo abajo antes de continuar.
                  </>
                )}
                {esSobrante && (
                  <>
                    El último cierre registró{" "}
                    <strong>{fmt(saldoAnterior)}</strong> y declaras{" "}
                    <strong>{fmt(montoNum)}</strong>.
                    <br />
                    <strong>Sobrante de {fmt(diff)}.</strong> Indica el origen del dinero adicional antes de continuar.
                  </>
                )}
              </div>
            )}

            <label className="caja-ap-form-label" htmlFor="caja-monto-apertura">
              Efectivo inicial en caja
            </label>
            <input
              id="caja-monto-apertura"
              className={`nt-field caja-ap-monto${hayDiferencia ? " caja-ap-monto--warn" : ""}`}
              type="number"
              min="0"
              step="100"
              value={montoApertura}
              onChange={(e) => setMontoApertura(e.target.value)}
              style={{ marginBottom: "1rem", width: "100%", boxSizing: "border-box" }}
            />

            {hayDiferencia && (
              <div className="caja-ap-diff-wrap">
                <label className="caja-ap-diff-label" htmlFor="caja-motivo-diff">
                  {esFaltante ? "Motivo del faltante *" : "Origen del sobrante *"}
                </label>
                <input
                  id="caja-motivo-diff"
                  className="nt-field"
                  placeholder={
                    esFaltante
                      ? "Ej: consignación al banco antes de abrir..."
                      : "Ej: ingreso autorizado para caja, venta fuera del sistema..."
                  }
                  value={motivoDiferenciaApertura}
                  onChange={(e) => setMotivoDiferenciaApertura(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
                <p className="caja-ap-tip">
                  Quedará registrado como{" "}
                  <strong>{esFaltante ? "retiro" : "ingreso"}</strong>{" "}
                  en el historial de movimientos del turno.
                </p>
              </div>
            )}

            <div className="caja-ap-actions">
              <button
                className="nt-btn nt-btn-primary"
                type="button"
                disabled={procesando || motivoRequerido}
                onClick={manejarAbrir}
                style={{ opacity: motivoRequerido ? 0.55 : undefined }}
              >
                {procesando ? "Abriendo…" : motivoRequerido ? "Completa el motivo obligatorio" : "Abrir turno"}
              </button>
              <p className="caja-ap-tip">
                Consejo: cuenta el efectivo físico antes de registrar el número; así evitas inconsistencias durante el día.
              </p>
            </div>
          </article>
        </section>
      </>
    );
  }

  // ── CON TURNO ───────────────────────────────────────────────────────────────
  const r = resumen ?? {
    monto_apertura: caja.monto_apertura, total_ingresos: 0,
    total_retiros: 0, efectivo_en_caja: caja.monto_apertura, total_movimientos: 0,
  };

  return (
    <div className="nt-stack">
      {errorLocal && <div className="nt-alert nt-alert-error">{errorLocal}</div>}

      {/* ── Barra turno activo ── */}
      <div style={{
        background: "linear-gradient(135deg, #047857 0%, #059669 50%, #10b981 100%)",
        borderRadius: "16px",
        padding: "1.1rem 1.5rem",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "10px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{
            width: "44px", height: "44px",
            background: "rgba(255,255,255,0.18)",
            borderRadius: "12px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.3rem",
          }}>✅</div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>Turno Activo</span>
              <span style={{
                background: "rgba(255,255,255,0.22)",
                padding: "2px 9px",
                borderRadius: "20px",
                fontSize: "0.68rem",
                fontWeight: 800,
                letterSpacing: "0.07em",
              }}>EN VIVO</span>
            </div>
            <div style={{ opacity: 0.75, fontSize: "0.8rem", marginTop: "3px" }}>
              {new Date(caja.abierto_en).toLocaleString("es-CO", {
                dateStyle: "medium", timeStyle: "short",
              })}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{ textAlign: "right", opacity: 0.85, fontSize: "0.82rem" }}>
            <div style={{ fontWeight: 600 }}>Duración del turno</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>{calcularDuracion(caja.abierto_en)}</div>
          </div>
          <button
            type="button"
            onClick={refrescarTodo}
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: "8px",
              color: "white",
              padding: "7px 14px",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: 600,
            }}
          >↻ Actualizar</button>
        </div>
      </div>

      {/* ── 4 tarjetas de métricas ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: "14px" }}>
        {[
          {
            label: "Saldo Inicial", value: fmt(r.monto_apertura),
            sub: "Base de caja", icon: "💳",
            from: "#1d4ed8", to: "#3b82f6",
          },
          {
            label: "Ingresos del Turno", value: fmt(r.total_ingresos),
            sub: "Ventas registradas", icon: "📈",
            from: "#047857", to: "#10b981",
          },
          {
            label: "Retiros Realizados", value: fmt(r.total_retiros),
            sub: "Caja fuerte / consig.", icon: "💸",
            from: "#c2410c", to: "#f97316",
          },
          {
            label: "Efectivo en Caja", value: fmt(r.efectivo_en_caja),
            sub: "Balance actual", icon: "💵",
            from: "#6d28d9", to: "#8b5cf6",
          },
        ].map((c) => (
          <div key={c.label} style={{
            background: `linear-gradient(145deg, ${c.from} 0%, ${c.to} 100%)`,
            borderRadius: "16px",
            padding: "1.25rem 1.3rem",
            color: "white",
            position: "relative",
            overflow: "hidden",
          }}>
            <div style={{
              position: "absolute", right: "-8px", top: "-8px",
              fontSize: "3rem", opacity: 0.12,
            }}>{c.icon}</div>
            <div style={{ fontSize: "0.75rem", opacity: 0.8, marginBottom: "8px", fontWeight: 500, letterSpacing: "0.02em" }}>
              {c.label}
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, lineHeight: 1.1 }}>{c.value}</div>
            <div style={{ fontSize: "0.7rem", opacity: 0.65, marginTop: "6px" }}>{c.sub}</div>
            <div style={{ position: "absolute", right: "12px", bottom: "10px", fontSize: "1.1rem", opacity: 0.7 }}>
              {c.icon}
            </div>
          </div>
        ))}
      </div>

      {/* ── Stat: Movimientos totales ── */}
      <div style={{
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
        padding: "1rem 1.4rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "3px" }}>Movimientos en este turno</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#111827" }}>{r.total_movimientos}</div>
        </div>
        <span style={{ fontSize: "2rem", opacity: 0.2 }}>📋</span>
      </div>

      {/* ── Botones de acción ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

        {/* Fila 1: Retirar e Ingresar */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <button
            type="button"
            onClick={() => setModalActivo("retiro")}
            style={{
              background: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)",
              border: "none", borderRadius: "16px", padding: "1.2rem 1rem",
              color: "white", cursor: "pointer", display: "flex",
              alignItems: "center", gap: "12px", fontWeight: 700,
              fontSize: "0.95rem", textAlign: "left", transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <div style={{
              width: "40px", height: "40px", background: "rgba(255,255,255,0.18)",
              borderRadius: "10px", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "1.2rem", flexShrink: 0,
            }}>💸</div>
            <div>
              <div>Retirar Efectivo</div>
              <div style={{ fontSize: "0.72rem", opacity: 0.75, fontWeight: 400, marginTop: "2px" }}>
                Consignación o salida de caja
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setModalActivo("ingreso")}
            style={{
              background: "linear-gradient(135deg, #047857 0%, #10b981 100%)",
              border: "none", borderRadius: "16px", padding: "1.2rem 1rem",
              color: "white", cursor: "pointer", display: "flex",
              alignItems: "center", gap: "12px", fontWeight: 700,
              fontSize: "0.95rem", textAlign: "left", transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <div style={{
              width: "40px", height: "40px", background: "rgba(255,255,255,0.18)",
              borderRadius: "10px", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "1.2rem", flexShrink: 0,
            }}>💰</div>
            <div>
              <div>Ingresar Efectivo</div>
              <div style={{ fontSize: "0.72rem", opacity: 0.75, fontWeight: 400, marginTop: "2px" }}>
                Recargas, servicios u otros ingresos
              </div>
            </div>
          </button>
        </div>

        {/* Fila 2: Cerrar Turno (ancho completo) */}
        <button
          type="button"
          onClick={() => setModalActivo("cierre")}
          style={{
            background: "linear-gradient(135deg, #b91c1c 0%, #ef4444 100%)",
            border: "none", borderRadius: "16px", padding: "1.1rem 1.4rem",
            color: "white", cursor: "pointer", display: "flex",
            alignItems: "center", gap: "13px", fontWeight: 700,
            fontSize: "0.97rem", textAlign: "left", transition: "opacity 0.15s",
            width: "100%",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          <div style={{
            width: "40px", height: "40px", background: "rgba(255,255,255,0.18)",
            borderRadius: "10px", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: "1.2rem", flexShrink: 0,
          }}>🔒</div>
          <div>
            <div>Cerrar Turno</div>
            <div style={{ fontSize: "0.72rem", opacity: 0.75, fontWeight: 400, marginTop: "2px" }}>
              Finalizar y generar reporte completo
            </div>
          </div>
        </button>

      </div>

      {/* ── Resumen financiero ── */}
      <div className="nt-card" style={{ padding: "1.4rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
          <span style={{ fontSize: "1rem" }}>💲</span>
          <h4 style={{ margin: 0, fontWeight: 700, fontSize: "1rem" }}>Resumen Financiero del Turno</h4>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[
            { label: "Saldo Inicial", value: fmt(r.monto_apertura), color: "#374151", bg: "#f8fafc", border: "#e2e8f0", icon: "💳" },
            { label: "Ingresos del Turno", value: `+ ${fmt(r.total_ingresos)}`, color: "#047857", bg: "#f0fdf4", border: "#bbf7d0", icon: "📈" },
            { label: "Consignaciones / Retiros", value: `- ${fmt(r.total_retiros)}`, color: "#c2410c", bg: "#fff7ed", border: "#fed7aa", icon: "💸" },
          ].map((row) => (
            <div key={row.label} style={{
              background: row.bg,
              border: `1px solid ${row.border}`,
              borderRadius: "10px",
              padding: "11px 15px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                <span style={{ fontSize: "0.95rem" }}>{row.icon}</span>
                <span style={{ fontSize: "0.88rem", color: "#374151" }}>{row.label}</span>
              </div>
              <span style={{ fontWeight: 700, color: row.color, fontSize: "0.95rem" }}>{row.value}</span>
            </div>
          ))}

          <div style={{
            background: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
            border: "2px solid #8b5cf6",
            borderRadius: "12px",
            padding: "13px 15px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "4px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
              <span style={{ fontSize: "0.95rem" }}>💵</span>
              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#374151" }}>Efectivo en Caja</div>
                <div style={{ fontSize: "0.72rem", color: "#7c3aed" }}>Balance actual esperado</div>
              </div>
            </div>
            <span style={{ fontSize: "1.35rem", fontWeight: 800, color: "#6d28d9" }}>{fmt(r.efectivo_en_caja)}</span>
          </div>
        </div>
      </div>

      {/* ── Tarjetas de historial — en fila lado a lado ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>

        {/* Historial turno actual */}
        <button
          type="button"
          onClick={() => setModalActivo("historial")}
          style={{
            background: "white", border: "1.5px solid #e5e7eb", borderRadius: "16px",
            padding: "1.2rem 1.3rem", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "space-between",
            width: "100%", textAlign: "left", transition: "border-color 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#6d28d9"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(109,40,217,0.1)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "42px", height: "42px",
              background: "linear-gradient(135deg, #6d28d9, #8b5cf6)",
              borderRadius: "12px", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "1.1rem", flexShrink: 0,
            }}>📋</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#111827" }}>
                Este turno
              </div>
              <div style={{ fontSize: "0.76rem", color: "#6b7280", marginTop: "2px" }}>
                {movimientos.length === 0
                  ? "Sin movimientos aún"
                  : `${movimientos.length} movimiento${movimientos.length !== 1 ? "s" : ""}`}
              </div>
            </div>
          </div>
          <span style={{ color: "#9ca3af", fontSize: "1.1rem" }}>›</span>
        </button>

        {/* Búsqueda global — todos los turnos */}
        <button
          type="button"
          onClick={() => setModalActivo("historialGlobal")}
          style={{
            background: "white", border: "1.5px solid #e5e7eb", borderRadius: "16px",
            padding: "1.2rem 1.3rem", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "space-between",
            width: "100%", textAlign: "left", transition: "border-color 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#334155"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(15,23,42,0.1)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "42px", height: "42px",
              background: "linear-gradient(135deg, #0f172a, #334155)",
              borderRadius: "12px", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "1.1rem", flexShrink: 0,
            }}>🔎</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#111827" }}>
                Buscar en todos
              </div>
              <div style={{ fontSize: "0.76rem", color: "#6b7280", marginTop: "2px" }}>
                Busca en turnos anteriores
              </div>
            </div>
          </div>
          <span style={{ color: "#9ca3af", fontSize: "1.1rem" }}>›</span>
        </button>

      </div>

      {/* ── Modal: Ingresar Efectivo ── */}
      {modalActivo === "ingreso" && (
        <Modal onClose={() => { setModalActivo(null); setIngresoMonto(""); setIngresoConcepto(""); setErrorLocal(""); }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1.5rem" }}>
            <div style={{
              width: "46px", height: "46px",
              background: "linear-gradient(135deg, #047857, #10b981)",
              borderRadius: "12px", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "1.3rem", flexShrink: 0,
            }}>💰</div>
            <div>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: "1.1rem", color: "#111827" }}>
                Ingresar Efectivo
              </h3>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#6b7280" }}>
                El ingreso quedará registrado con fecha, monto y concepto
              </p>
            </div>
          </div>

          {errorLocal && (
            <div className="nt-alert nt-alert-error" style={{ marginBottom: "1rem" }}>{errorLocal}</div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", color: "#374151", fontWeight: 600, marginBottom: "6px" }}>
                Monto a ingresar *
              </label>
              <input
                className="nt-field"
                type="number"
                min="1"
                step="100"
                placeholder="$ 0"
                value={ingresoMonto}
                onChange={(e) => setIngresoMonto(e.target.value)}
                autoFocus
                style={{ fontSize: "1.1rem", fontWeight: 700 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", color: "#374151", fontWeight: 600, marginBottom: "6px" }}>
                Concepto *
              </label>
              <input
                className="nt-field"
                placeholder="Ej: Recargas celulares, comisión servicio, ingreso externo..."
                value={ingresoConcepto}
                onChange={(e) => setIngresoConcepto(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && manejarIngreso()}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "1.5rem" }}>
            <button
              className="nt-btn nt-btn-primary"
              type="button"
              disabled={procesando || !ingresoMonto || !ingresoConcepto.trim()}
              onClick={manejarIngreso}
              style={{
                flex: 1, padding: "12px", borderRadius: "10px", fontWeight: 700,
                background: "linear-gradient(135deg, #047857, #10b981)",
                border: "none",
                opacity: (!ingresoMonto || !ingresoConcepto.trim()) ? 0.5 : 1,
              }}
            >
              {procesando ? "Registrando..." : "Confirmar ingreso"}
            </button>
            <button
              className="nt-btn"
              type="button"
              onClick={() => { setModalActivo(null); setIngresoMonto(""); setIngresoConcepto(""); setErrorLocal(""); }}
              style={{ padding: "12px 20px", borderRadius: "10px" }}
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Retirar Efectivo ── */}
      {modalActivo === "retiro" && (
        <Modal onClose={() => { setModalActivo(null); setRetiroMonto(""); setRetiroConcepto(""); setErrorLocal(""); }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1.5rem" }}>
            <div style={{
              width: "46px", height: "46px",
              background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
              borderRadius: "12px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.3rem", flexShrink: 0,
            }}>💸</div>
            <div>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: "1.1rem", color: "#111827" }}>
                Retirar Efectivo
              </h3>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#6b7280" }}>
                El retiro quedará registrado con fecha y concepto
              </p>
            </div>
          </div>

          {errorLocal && (
            <div className="nt-alert nt-alert-error" style={{ marginBottom: "1rem" }}>{errorLocal}</div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", color: "#374151", fontWeight: 600, marginBottom: "6px" }}>
                Monto a retirar *
              </label>
              <input
                className="nt-field"
                type="number"
                min="1"
                step="100"
                placeholder="$ 0"
                value={retiroMonto}
                onChange={(e) => setRetiroMonto(e.target.value)}
                autoFocus
                style={{ fontSize: "1.1rem", fontWeight: 700 }}
              />
              {r.efectivo_en_caja > 0 && (
                <p style={{ margin: "5px 0 0", fontSize: "0.76rem", color: "#6b7280" }}>
                  Disponible en caja: <strong>{fmt(r.efectivo_en_caja)}</strong>
                </p>
              )}
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", color: "#374151", fontWeight: 600, marginBottom: "6px" }}>
                Concepto *
              </label>
              <input
                className="nt-field"
                placeholder="Ej: Consignación banco, Gastos de papelería..."
                value={retiroConcepto}
                onChange={(e) => setRetiroConcepto(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && manejarRetiro()}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "1.5rem" }}>
            <button
              className="nt-btn nt-btn-primary"
              type="button"
              disabled={procesando || !retiroMonto || !retiroConcepto.trim()}
              onClick={manejarRetiro}
              style={{ flex: 1, padding: "12px", borderRadius: "10px", fontWeight: 700 }}
            >
              {procesando ? "Registrando..." : "Confirmar retiro"}
            </button>
            <button
              className="nt-btn"
              type="button"
              onClick={() => { setModalActivo(null); setRetiroMonto(""); setRetiroConcepto(""); setErrorLocal(""); }}
              style={{ padding: "12px 20px", borderRadius: "10px" }}
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Historial de movimientos del turno actual ── */}
      {modalActivo === "historial" && (
        <ModalHistorial
          movimientos={movimientos}
          resumen={r}
          onClose={() => setModalActivo(null)}
        />
      )}

      {/* ── Modal: Búsqueda global en todos los turnos ── */}
      {modalActivo === "historialGlobal" && (
        <ModalHistorialGlobal onClose={() => setModalActivo(null)} />
      )}

      {/* ── Modal: Cerrar Turno ── */}
      {modalActivo === "cierre" && (
        <Modal onClose={() => { setModalActivo(null); setCierreContado(""); setCierreNotas(""); setErrorLocal(""); }}>
          {(() => {
            const contado = cierreContado !== "" ? Number(cierreContado) : null;
            const diferencia = contado !== null ? contado - r.efectivo_en_caja : null;
            const hayDescuadre = diferencia !== null && diferencia !== 0;
            const esFaltante = diferencia !== null && diferencia < 0;
            const esSobrante = diferencia !== null && diferencia > 0;
            const cuadra = diferencia === 0;
            const notasObligatorias = hayDescuadre && !cierreNotas.trim();

            return (
              <>
                {/* Cabecera */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "0.75rem" }}>
                  <div style={{
                    width: "46px", height: "46px",
                    background: "linear-gradient(135deg, #b91c1c, #ef4444)",
                    borderRadius: "12px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1.3rem", flexShrink: 0,
                  }}>🔒</div>
                  <div>
                    <h3 style={{ margin: 0, fontWeight: 700, fontSize: "1.1rem", color: "#111827" }}>
                      Cerrar Turno de Caja
                    </h3>
                    <p style={{ margin: 0, fontSize: "0.82rem", color: "#6b7280" }}>
                      Esta acción no se puede deshacer
                    </p>
                  </div>
                </div>

                {/* Saldo del sistema */}
                <div style={{
                  background: "linear-gradient(135deg, #f5f3ff, #ede9fe)",
                  border: "1.5px solid #c4b5fd",
                  borderRadius: "12px", padding: "13px 16px", margin: "1rem 0",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: "0.76rem", color: "#7c3aed", fontWeight: 600 }}>EFECTIVO ESPERADO EN CAJA</div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#4c1d95" }}>{fmt(r.efectivo_en_caja)}</div>
                    <div style={{ fontSize: "0.71rem", color: "#7c3aed", marginTop: "2px" }}>
                      Calculado por el sistema
                    </div>
                  </div>
                  <span style={{ fontSize: "2rem" }}>💵</span>
                </div>

                {errorLocal && (
                  <div className="nt-alert nt-alert-error" style={{ marginBottom: "1rem" }}>{errorLocal}</div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {/* Conteo físico */}
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", color: "#374151", fontWeight: 600, marginBottom: "6px" }}>
                      Efectivo contado físicamente *
                    </label>
                    <input
                      className="nt-field"
                      type="number"
                      min="0"
                      step="100"
                      placeholder="$ contado en caja"
                      value={cierreContado}
                      onChange={(e) => setCierreContado(e.target.value)}
                      autoFocus
                      style={{ borderColor: esFaltante ? "#ef4444" : esSobrante ? "#f59e0b" : cuadra ? "#22c55e" : undefined }}
                    />

                    {/* Resultado del conteo en tiempo real */}
                    {diferencia !== null && (
                      <div style={{
                        marginTop: "8px",
                        background: cuadra ? "#f0fdf4" : esFaltante ? "#fef2f2" : "#fffbeb",
                        border: `1.5px solid ${cuadra ? "#86efac" : esFaltante ? "#fca5a5" : "#fcd34d"}`,
                        borderRadius: "10px",
                        padding: "10px 13px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "8px",
                      }}>
                        <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>
                          {cuadra ? "✅" : esFaltante ? "🔴" : "🟡"}
                        </span>
                        <div>
                          {cuadra && (
                            <p style={{ margin: 0, fontWeight: 700, color: "#15803d", fontSize: "0.9rem" }}>
                              El conteo cuadra perfectamente con el sistema.
                            </p>
                          )}
                          {esFaltante && (
                            <>
                              <p style={{ margin: "0 0 3px", fontWeight: 700, color: "#b91c1c", fontSize: "0.9rem" }}>
                                FALTANTE: {fmt(Math.abs(diferencia))}
                              </p>
                              <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280" }}>
                                El sistema registra {fmt(r.efectivo_en_caja)} pero se contaron {fmt(contado)}.
                                Se requiere una observación obligatoria para identificar al responsable del descuadre.
                              </p>
                            </>
                          )}
                          {esSobrante && (
                            <>
                              <p style={{ margin: "0 0 3px", fontWeight: 700, color: "#92400e", fontSize: "0.9rem" }}>
                                SOBRANTE: {fmt(diferencia)}
                              </p>
                              <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280" }}>
                                Hay más dinero del esperado. Registra en las observaciones el motivo.
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Observaciones — obligatorias si hay descuadre */}
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "6px", color: hayDescuadre ? "#b91c1c" : "#374151" }}>
                      {hayDescuadre ? "⚠️ Observación de descuadre *" : "Notas de cierre (opcional)"}
                    </label>
                    <input
                      className="nt-field"
                      placeholder={hayDescuadre
                        ? "Explica el origen del descuadre: quién, qué pasó, qué se hará..."
                        : "Observaciones del turno..."}
                      value={cierreNotas}
                      onChange={(e) => setCierreNotas(e.target.value)}
                      style={{ borderColor: notasObligatorias ? "#ef4444" : undefined }}
                    />
                    {notasObligatorias && (
                      <p style={{ margin: "5px 0 0", fontSize: "0.76rem", color: "#b91c1c", fontWeight: 600 }}>
                        Esta observación es obligatoria cuando hay descuadre.
                      </p>
                    )}
                    {hayDescuadre && cierreNotas.trim() && (
                      <p style={{ margin: "5px 0 0", fontSize: "0.75rem", color: "#6b7280" }}>
                        Esta nota quedará registrada en el sistema para auditoría.
                      </p>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "1.5rem" }}>
                  <button
                    className="nt-btn nt-btn-danger"
                    type="button"
                    disabled={procesando || notasObligatorias}
                    onClick={manejarCerrar}
                    style={{ flex: 1, padding: "12px", borderRadius: "10px", fontWeight: 700, opacity: notasObligatorias ? 0.5 : 1 }}
                  >
                    {procesando ? "Cerrando..." : notasObligatorias ? "Escribe la observación para continuar" : "Confirmar cierre"}
                  </button>
                  <button
                    className="nt-btn"
                    type="button"
                    onClick={() => { setModalActivo(null); setCierreContado(""); setCierreNotas(""); setErrorLocal(""); }}
                    style={{ padding: "12px 20px", borderRadius: "10px" }}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
