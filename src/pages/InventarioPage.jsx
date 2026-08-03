import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import AppShell from "../components/AppShell";
import {
  crearCategoria,
  eliminarCategoria,
  obtenerCategorias,
  renombrarCategoria,
} from "../services/categoriasServicio";
import {
  actualizarProducto,
  ajustarStock,
  crearProducto,
  eliminarProducto,
  obtenerMovimientosInventario,
  obtenerProductos,
} from "../services/productosServicio";
import {
  hoyLocal,
  rangoSemanaActual,
  rangoMesActual,
  obtenerReporteReabastecimiento,
} from "../services/reportesServicio";
import "../styles/inventario.css";

const TIMEOUT_FETCH_MS = 12000;

function conTimeout(promesa, ms, valorDefecto) {
  return Promise.race([
    promesa,
    new Promise((resolve) => setTimeout(() => resolve(valorDefecto), ms)),
  ]);
}

const estadoInicial = {
  nombre: "",
  categoria: "",
  precio_compra: "",
  precio_venta: "",
  stock: "",
  stock_minimo: "2",
  codigo_barras: "",
};

function formatCOP(valor) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(valor ?? 0);
}

/* ─── Modal genérico ─────────────────────────────────────── */
function Modal({ open, onClose, titulo, children, size = "md" }) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="inv-modal-overlay" onClick={onClose}>
      <div
        className={`inv-modal-box inv-modal-${size}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inv-modal-header">
          <h2 className="inv-modal-title">{titulo}</h2>
          <button className="inv-modal-close" onClick={onClose} type="button">✕</button>
        </div>
        <div className="inv-modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ─── Tarjeta de estadística ─────────────────────────────── */
function StatCard({ icon, label, value, sub, variant = "blue", badge }) {
  return (
    <div className={`inv-stat-card inv-stat-${variant}`}>
      <div className="inv-stat-icon">{icon}</div>
      <div className="inv-stat-content">
        {badge && <span className="inv-stat-badge">{badge}</span>}
        <div className="inv-stat-label">{label}</div>
        <div className="inv-stat-value">{value}</div>
        {sub && <div className="inv-stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

/* ─── Tarjeta de producto ────────────────────────────────── */
function ProductCard({ producto, esAdmin, onEditar, onEliminar, onAjustarStock, onVerHistorial }) {
  const stockMinimo = producto.stock_minimo ?? 2;
  const stockPct = Math.min((producto.stock / Math.max(stockMinimo * 2, 1)) * 100, 100);
  const stockBajo = producto.stock <= stockMinimo;
  const valorInventario = (producto.precio_venta ?? 0) * producto.stock;

  return (
    <div className={`inv-prod-card${stockBajo ? " inv-prod-card--alerta" : ""}`}>
      {stockBajo && <span className="inv-prod-badge-alerta">¡ALERTA!</span>}

      <div>
        <div className="inv-prod-nombre">{producto.nombre}</div>
        <span className="inv-prod-cat">{producto.categoria}</span>
      </div>

      <div className="inv-prod-precio-wrap">
        <div className="inv-prod-precio-label">Precio de Venta</div>
        <div className="inv-prod-precio">{formatCOP(producto.precio_venta)}</div>
      </div>

      <div className="inv-prod-stock-row">
        <span className="inv-prod-stock-label">Stock Disponible</span>
        <span className={`inv-prod-stock-num${stockBajo ? " inv-prod-stock-num--low" : ""}`}>
          {producto.stock}
        </span>
      </div>
      <div className="inv-prod-stock-bar">
        <div
          className={`inv-prod-stock-fill${stockBajo ? " inv-prod-stock-fill--low" : ""}`}
          style={{ width: `${Math.max(stockPct, 4)}%` }}
        />
      </div>
      <div className="inv-prod-stock-min">Mínimo requerido: {stockMinimo} unidades</div>

      <div className="inv-prod-valor">
        <span className="inv-prod-valor-label">Valor en inventario</span>
        <span className="inv-prod-valor-num">{formatCOP(valorInventario)}</span>
      </div>

      {esAdmin ? (
        <>
          <div className="inv-prod-actions">
            <button
              className="inv-btn inv-btn-stock"
              type="button"
              onClick={() => onAjustarStock(producto)}
            >
              📥 Ajustar stock
            </button>
            <button
              className="inv-btn inv-btn-ghost inv-btn-sm"
              type="button"
              onClick={() => onVerHistorial(producto)}
              title="Ver historial de stock (Kardex)"
            >
              📜
            </button>
          </div>
          <div className="inv-prod-actions">
            <button
              className="inv-btn inv-btn-edit"
              type="button"
              onClick={() => onEditar(producto)}
            >
              ✏ Editar
            </button>
            <button
              className="inv-btn inv-btn-delete"
              type="button"
              onClick={() => onEliminar(producto)}
            >
              🗑
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ─── Badge de tipo de movimiento (Kardex) ──────────────── */
function BadgeTipoMovimiento({ tipo }) {
  const estilos = {
    entrada: { bg: "#dcfce7", fg: "#15803d", label: "▲ Entrada" },
    venta: { bg: "#dbeafe", fg: "#1d4ed8", label: "🛒 Venta" },
    ajuste: { bg: "#fef3c7", fg: "#92400e", label: "✎ Ajuste" },
  };
  const s = estilos[tipo] ?? { bg: "#e2e8f0", fg: "#475569", label: tipo };
  return (
    <span
      style={{
        background: s.bg,
        color: s.fg,
        padding: "2px 10px",
        borderRadius: "999px",
        fontSize: "0.74rem",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

/* ─── Modal: Ajustar Stock ───────────────────────────────── */
function ModalAjustarStock({ open, producto, onClose, onGuardado }) {
  const [tipo, setTipo] = useState("entrada");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setTipo("entrada");
      setCantidad("");
      setMotivo("");
      setError("");
    }
  }, [open, producto?.id]);

  if (!open || !producto) return null;

  const cantidadNum = Number(cantidad);
  const deltaValido = cantidad !== "" && !Number.isNaN(cantidadNum) && cantidadNum !== 0 &&
    (tipo === "ajuste" || cantidadNum > 0);
  const stockResultante = deltaValido ? producto.stock + cantidadNum : null;
  const motivoRequerido = tipo === "ajuste" && !motivo.trim();

  async function manejarGuardar(e) {
    e.preventDefault();
    if (!deltaValido || motivoRequerido) return;
    setError("");
    try {
      setGuardando(true);
      await ajustarStock({ productoId: producto.id, tipo, cantidad: cantidadNum, motivo });
      onGuardado();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} titulo={`Ajustar stock — ${producto.nombre}`} size="sm">
      <form className="inv-form" onSubmit={manejarGuardar}>
        {error && <div className="nt-alert nt-alert-error">{error}</div>}

        <div className="inv-stock-preview">
          <span>Stock actual</span>
          <strong>{producto.stock}</strong>
        </div>

        <div className="inv-form-field">
          <label className="inv-label">Tipo de movimiento</label>
          <div className="inv-tipo-toggle">
            <button
              type="button"
              className={`inv-tipo-btn${tipo === "entrada" ? " is-active" : ""}`}
              onClick={() => setTipo("entrada")}
              disabled={guardando}
            >
              📥 Entrada de mercancía
            </button>
            <button
              type="button"
              className={`inv-tipo-btn${tipo === "ajuste" ? " is-active" : ""}`}
              onClick={() => setTipo("ajuste")}
              disabled={guardando}
            >
              ✎ Ajuste / corrección
            </button>
          </div>
        </div>

        <div className="inv-form-field">
          <label className="inv-label">
            {tipo === "entrada" ? "Unidades que llegaron" : "Cantidad a ajustar"}
            <span className="inv-required">*</span>
          </label>
          <input
            className="nt-field"
            type="number"
            step="1"
            min={tipo === "entrada" ? "1" : undefined}
            placeholder={tipo === "entrada" ? "Ej: 10" : "Ej: -2 (faltante) o 3 (sobrante)"}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            disabled={guardando}
            autoFocus
          />
          {tipo === "ajuste" && (
            <p className="inv-help-text">
              Usa un número negativo para reportar pérdidas, daños o faltantes; positivo si el
              conteo físico reveló más unidades de las registradas.
            </p>
          )}
        </div>

        <div className="inv-form-field">
          <label className="inv-label">
            Motivo {tipo === "ajuste" && <span className="inv-required">*</span>}
          </label>
          <input
            className="nt-field"
            placeholder={
              tipo === "entrada"
                ? "Ej: Compra a proveedor XYZ (opcional)"
                : "Ej: Producto dañado, faltante en conteo físico..."
            }
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={guardando}
          />
        </div>

        {stockResultante !== null && (
          <div className={`inv-stock-preview inv-stock-preview--resultado${stockResultante < 0 ? " is-negativo" : ""}`}>
            <span>Stock resultante</span>
            <strong>{producto.stock} {cantidadNum > 0 ? "+" : ""}{cantidadNum} = {stockResultante}</strong>
          </div>
        )}

        <div className="inv-form-actions">
          <button className="inv-btn inv-btn-ghost" type="button" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button
            className="inv-btn inv-btn-primary"
            type="submit"
            disabled={guardando || !deltaValido || motivoRequerido || stockResultante < 0}
          >
            {guardando ? "Guardando..." : "Confirmar ajuste"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── Modal: Historial de Stock (Kardex) ─────────────────── */
function ModalHistorialStock({ open, producto, onClose }) {
  const [movimientos, setMovimientos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !producto) return;
    setCargando(true);
    setError("");
    obtenerMovimientosInventario(producto.id)
      .then(setMovimientos)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [open, producto]);

  if (!open || !producto) return null;

  return (
    <Modal open={open} onClose={onClose} titulo={`Historial de stock — ${producto.nombre}`} size="lg">
      {error && <div className="nt-alert nt-alert-error">{error}</div>}

      {cargando ? (
        <div className="inv-loading">
          <div className="inv-spinner" />
          <span>Cargando historial...</span>
        </div>
      ) : movimientos.length === 0 ? (
        <div className="inv-empty">
          <div className="inv-empty-icon">📭</div>
          <div>Este producto aún no tiene movimientos registrados.</div>
        </div>
      ) : (
        <div className="nt-table-wrap">
          <table className="nt-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th style={{ textAlign: "right" }}>Cantidad</th>
                <th style={{ textAlign: "right" }}>Stock resultante</th>
                <th>Usuario</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td>
                    {new Date(m.creado_en).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td><BadgeTipoMovimiento tipo={m.tipo} /></td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: m.cantidad > 0 ? "#15803d" : "#b91c1c" }}>
                    {m.cantidad > 0 ? "+" : ""}{m.cantidad}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{m.stock_resultante}</td>
                  <td className="nt-muted">{m.usuarios?.nombre ?? "—"}</td>
                  <td className="nt-muted">{m.motivo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/* ─── Badge de estado de stock (reabastecimiento) ────────── */
function BadgeEstadoStock({ estado }) {
  const estilos = {
    ok:      { bg: "#dcfce7", fg: "#15803d", label: "✓ OK" },
    bajo:    { bg: "#fef3c7", fg: "#92400e", label: "⚠️ Reponer" },
    agotado: { bg: "#fee2e2", fg: "#b91c1c", label: "🔴 Agotado" },
  };
  const s = estilos[estado] ?? { bg: "#e2e8f0", fg: "#475569", label: estado };
  return (
    <span
      style={{
        background: s.bg,
        color: s.fg,
        padding: "2px 10px",
        borderRadius: "999px",
        fontSize: "0.74rem",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

const PERIODOS_REAB = [
  { id: "dia",     label: "Hoy" },
  { id: "semana",  label: "Semana" },
  { id: "mes",     label: "Mes" },
  { id: "personalizado", label: "Personalizado" },
];

/* ─── Modal: Reporte de Reabastecimiento ─────────────────── */
function ModalReabastecimiento({ open, onClose }) {
  const [periodo, setPeriodo] = useState("semana");
  const [fechaDesde, setFechaDesde] = useState(hoyLocal);
  const [fechaHasta, setFechaHasta] = useState(hoyLocal);
  const [busqueda, setBusqueda] = useState("");
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  // Ajusta el rango de fechas según el período elegido
  useEffect(() => {
    if (!open) return;
    if (periodo === "dia") {
      const hoy = hoyLocal();
      setFechaDesde(hoy);
      setFechaHasta(hoy);
    } else if (periodo === "semana") {
      const { desde, hasta } = rangoSemanaActual();
      setFechaDesde(desde);
      setFechaHasta(hasta);
    } else if (periodo === "mes") {
      const { desde, hasta } = rangoMesActual();
      setFechaDesde(desde);
      setFechaHasta(hasta);
    }
  }, [open, periodo]);

  async function cargarReporte() {
    setCargando(true);
    setError("");
    try {
      const datos = await obtenerReporteReabastecimiento(fechaDesde, fechaHasta);
      setReporte(datos);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (open) {
      setReporte(null);
      setError("");
      setBusqueda("");
      setPeriodo("semana");
    }
  }, [open]);

  const productosFiltrados = useMemo(() => {
    if (!reporte) return [];
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return reporte.productos;
    return reporte.productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(termino) ||
        p.categoria.toLowerCase().includes(termino)
    );
  }, [reporte, busqueda]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} titulo="📋 Reporte de reabastecimiento" size="xl">
      <div className="inv-form" style={{ gap: "1rem" }}>
        <p className="inv-help-text" style={{ margin: 0 }}>
          Productos que se agotaron o están en stock bajo, junto con lo que se vendió de
          cada uno en el período, para saber qué y cuánto volver a pedir al proveedor.
        </p>

        {error && <div className="nt-alert nt-alert-error">{error}</div>}

        <div className="inv-tipo-toggle" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {PERIODOS_REAB.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`inv-tipo-btn${periodo === p.id ? " is-active" : ""}`}
              onClick={() => setPeriodo(p.id)}
              disabled={cargando}
            >
              {p.label}
            </button>
          ))}
        </div>

        {periodo === "personalizado" && (
          <div className="inv-form-grid">
            <div className="inv-form-field">
              <label className="inv-label">Desde</label>
              <input
                className="nt-field"
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                max={fechaHasta}
              />
            </div>
            <div className="inv-form-field">
              <label className="inv-label">Hasta</label>
              <input
                className="nt-field"
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                min={fechaDesde}
                max={hoyLocal()}
              />
            </div>
          </div>
        )}

        <div className="inv-barcode-row">
          <button
            className="inv-btn inv-btn-primary"
            type="button"
            onClick={cargarReporte}
            disabled={cargando}
          >
            {cargando ? "Consultando..." : "📊 Generar reporte"}
          </button>
          {reporte && (
            <input
              className="nt-field inv-grow"
              placeholder="Buscar producto o categoría..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          )}
        </div>

        {cargando && (
          <div className="inv-loading">
            <div className="inv-spinner" />
            <span>Consultando ventas e inventario...</span>
          </div>
        )}

        {!cargando && reporte && (
          <>
            <div className="inv-stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              <StatCard
                icon="⚠️"
                label="Para reponer"
                value={reporte.resumen.totalParaReponer}
                sub="Stock bajo o agotado"
                variant={reporte.resumen.totalParaReponer > 0 ? "danger" : "green"}
              />
              <StatCard
                icon="🚫"
                label="Agotados"
                value={reporte.resumen.totalAgotados}
                sub="Sin unidades en stock"
                variant={reporte.resumen.totalAgotados > 0 ? "danger" : "green"}
              />
              <StatCard
                icon="📦"
                label="De esos, ya se vendieron"
                value={`${reporte.resumen.totalProductosConMovimiento} de ${reporte.resumen.totalParaReponer}`}
                sub="Productos por reponer que tuvieron ventas en el período"
                variant="blue"
              />
              <StatCard
                icon="🛒"
                label="Lo que vendiste de esos"
                value={`${reporte.resumen.totalUnidadesVendidas.toLocaleString("es-CO")} uds.`}
                sub={`${formatCOP(reporte.resumen.totalVendido)} en ventas de productos por reponer`}
                variant="teal"
              />
            </div>

            {productosFiltrados.length === 0 ? (
              <div className="inv-empty">
                <div className="inv-empty-icon">🎉</div>
                <div>
                  {busqueda
                    ? "Ningún producto por reponer coincide con la búsqueda."
                    : "¡Ningún producto está agotado o en stock bajo ahora mismo!"}
                </div>
              </div>
            ) : (
              <div className="nt-table-wrap">
                <table className="nt-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Categoría</th>
                      <th style={{ textAlign: "right" }}>Vendido</th>
                      <th style={{ textAlign: "right" }}>Stock actual</th>
                      <th style={{ textAlign: "right" }}>Stock mínimo</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosFiltrados.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                        <td>
                          <span
                            className="nt-pill"
                            style={{ textTransform: "capitalize", fontSize: 12 }}
                          >
                            {p.categoria}
                          </span>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>
                          {p.cantidadVendida.toLocaleString("es-CO")}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            color: p.estado !== "ok" ? "var(--nt-danger)" : undefined,
                          }}
                        >
                          {p.stock.toLocaleString("es-CO")}
                        </td>
                        <td style={{ textAlign: "right" }} className="nt-muted">
                          {p.stockMinimo.toLocaleString("es-CO")}
                        </td>
                        <td><BadgeEstadoStock estado={p.estado} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/* ─── Página principal ───────────────────────────────────── */
export default function InventarioPage() {
  const { rol } = useAuth();
  const esAdmin = rol === "administrador" || rol === "superadministrador";

  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("todas");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  // Estado de modales
  const [modalProducto, setModalProducto] = useState(false);
  const [modalEliminar, setModalEliminar] = useState(false);
  const [modalCategorias, setModalCategorias] = useState(false);
  const [modalAjustarStock, setModalAjustarStock] = useState(false);
  const [modalHistorial, setModalHistorial] = useState(false);
  const [modalReabastecimiento, setModalReabastecimiento] = useState(false);
  const [productoParaStock, setProductoParaStock] = useState(null);

  // Estado de formulario producto
  const [editandoId, setEditandoId] = useState(null);
  const [formulario, setFormulario] = useState(estadoInicial);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);

  // Estado de categorías
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [renombrandoCategoria, setRenombrandoCategoria] = useState(null);
  const [nuevoNombreCategoria, setNuevoNombreCategoria] = useState("");

  /* ── Carga de datos ──────────────────────────────────── */
  async function cargarProductos() {
    try {
      setCargando(true);
      const resultado = await conTimeout(obtenerProductos(), TIMEOUT_FETCH_MS, null);
      if (resultado === null) throw new Error("Tiempo de espera agotado al cargar productos.");
      setProductos(resultado ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function cargarCategorias() {
    try {
      const resultado = await conTimeout(obtenerCategorias(), TIMEOUT_FETCH_MS, null);
      if (resultado === null) throw new Error("Tiempo de espera agotado al cargar categorías.");
      setCategorias(resultado);
    } catch (err) {
      setError(`Categorías: ${err.message}`);
    }
  }

  useEffect(() => {
    cargarProductos();
    cargarCategorias();
  }, []);

  /* ── Datos computados ────────────────────────────────── */
  const productosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      const coincideCategoria = categoriaFiltro === "todas" || p.categoria === categoriaFiltro;
      const coincideBusqueda =
        !termino ||
        p.nombre.toLowerCase().includes(termino) ||
        (p.codigo_barras ?? "").toLowerCase().includes(termino);
      return coincideCategoria && coincideBusqueda;
    });
  }, [productos, busqueda, categoriaFiltro]);

  const categoriasDisponibles = useMemo(() => {
    const desdeTabla = categorias.map((c) => c.nombre);
    const dinamicas = productos.map((p) => p.categoria).filter(Boolean);
    return Array.from(new Set([...desdeTabla, ...dinamicas]));
  }, [categorias, productos]);

  const totalValorVenta = useMemo(
    () => productos.reduce((acc, p) => acc + (p.precio_venta ?? 0) * p.stock, 0),
    [productos],
  );

  const totalValorCompra = useMemo(
    () => productos.reduce((acc, p) => acc + (p.precio_compra ?? 0) * p.stock, 0),
    [productos],
  );
  const totalUnidades = useMemo(
    () => productos.reduce((acc, p) => acc + p.stock, 0),
    [productos],
  );
  const stockBajoCount = useMemo(
    () => productos.filter((p) => p.stock <= (p.stock_minimo ?? 2)).length,
    [productos],
  );

  /* ── Modal producto: abrir / cerrar ──────────────────── */
  function abrirNuevoProducto() {
    setEditandoId(null);
    setFormulario({ ...estadoInicial, categoria: categorias[0]?.nombre ?? "" });
    setError("");
    setMensaje("");
    setModalProducto(true);
  }

  function abrirEditarProducto(producto) {
    setEditandoId(producto.id);
    setFormulario({
      nombre: producto.nombre,
      categoria: producto.categoria ?? categorias[0]?.nombre ?? "",
      precio_compra: String(producto.precio_compra ?? 0),
      precio_venta: String(producto.precio_venta ?? producto.precio ?? 0),
      stock: String(producto.stock),
      stock_minimo: String(producto.stock_minimo ?? 2),
      codigo_barras: producto.codigo_barras ?? "",
    });
    setError("");
    setMensaje("");
    setModalProducto(true);
  }

  function cerrarModalProducto() {
    setModalProducto(false);
    setEditandoId(null);
    setError("");
  }

  function manejarCambioFormulario(e) {
    const { name, value } = e.target;
    setFormulario((prev) => ({ ...prev, [name]: value }));
  }

  function generarCodigoBarras() {
    const aleatorio = Math.floor(1000 + Math.random() * 9000);
    const codigo = `NT${Date.now()}${aleatorio}`.slice(0, 20);
    setFormulario((prev) => ({ ...prev, codigo_barras: codigo }));
  }

  async function manejarSubmit(e) {
    e.preventDefault();
    setError("");

    if (!esAdmin) {
      setError("No tienes permisos para crear o editar productos.");
      return;
    }

    const { nombre, categoria, precio_compra, precio_venta, stock, codigo_barras } = formulario;
    if (!nombre || !categoria || !precio_compra || !precio_venta || !stock || !codigo_barras) {
      setError("Completa todos los campos obligatorios.");
      return;
    }

    const payload = {
      nombre: nombre.trim(),
      categoria: categoria.trim().toLowerCase(),
      precio_compra: Number(precio_compra),
      precio_venta: Number(precio_venta),
      precio: Number(precio_venta),
      stock: Number(stock),
      stock_minimo: Number(formulario.stock_minimo) || 2,
      codigo_barras: codigo_barras.trim(),
    };

    if (isNaN(payload.precio_compra) || payload.precio_compra < 0) {
      setError("Precio de compra inválido.");
      return;
    }
    if (isNaN(payload.precio_venta) || payload.precio_venta < 0) {
      setError("Precio de venta inválido.");
      return;
    }
    if (isNaN(payload.stock) || payload.stock < 0) {
      setError("Stock inválido.");
      return;
    }

    try {
      setGuardando(true);
      if (editandoId) {
        // El stock no se envía al editar: se cambia únicamente desde el botón
        // "Ajustar stock" (deja registro en el historial). Evita sobrescribirlo
        // con un valor que pudo quedar desactualizado mientras el modal estaba abierto.
        const { stock: _stock, ...payloadSinStock } = payload;
        await actualizarProducto(editandoId, payloadSinStock);
        setMensaje("Producto actualizado correctamente.");
      } else {
        await crearProducto(payload);
        setMensaje("Producto creado correctamente.");
      }
      cerrarModalProducto();
      await cargarProductos();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  /* ── Modal eliminar ──────────────────────────────────── */
  function abrirEliminar(producto) {
    if (!esAdmin) return;
    setProductoSeleccionado(producto);
    setModalEliminar(true);
  }

  async function confirmarEliminar() {
    if (!productoSeleccionado) return;
    try {
      setGuardando(true);
      await eliminarProducto(productoSeleccionado.id);
      setMensaje("Producto eliminado correctamente.");
      setModalEliminar(false);
      setProductoSeleccionado(null);
      await cargarProductos();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  /* ── Modal ajustar stock / historial ─────────────────── */
  function abrirAjustarStock(producto) {
    if (!esAdmin) return;
    setProductoParaStock(producto);
    setModalAjustarStock(true);
  }

  function abrirHistorial(producto) {
    if (!esAdmin) return;
    setProductoParaStock(producto);
    setModalHistorial(true);
  }

  async function manejarAjusteGuardado() {
    setModalAjustarStock(false);
    setProductoParaStock(null);
    setMensaje("Stock actualizado correctamente.");
    await cargarProductos();
  }

  /* ── Modal categorías ────────────────────────────────── */
  function cerrarModalCategorias() {
    setModalCategorias(false);
    setRenombrandoCategoria(null);
    setNuevaCategoria("");
    setError("");
  }

  async function manejarCrearCategoria(e) {
    e.preventDefault();
    if (!esAdmin || !nuevaCategoria.trim()) return;
    try {
      const creada = await crearCategoria(nuevaCategoria);
      setNuevaCategoria("");
      setMensaje("Categoría creada.");
      await cargarCategorias();
      setFormulario((prev) => ({ ...prev, categoria: creada.nombre }));
    } catch (err) {
      setError(err.message);
    }
  }

  function iniciarRenombrado(cat) {
    setRenombrandoCategoria(cat);
    setNuevoNombreCategoria(cat.nombre);
  }

  async function confirmarRenombrado(e) {
    e.preventDefault();
    if (!renombrandoCategoria || !nuevoNombreCategoria.trim()) return;
    try {
      await renombrarCategoria({
        id: renombrandoCategoria.id,
        nombreActual: renombrandoCategoria.nombre,
        nuevoNombre: nuevoNombreCategoria,
      });
      setMensaje("Categoría renombrada.");
      setRenombrandoCategoria(null);
      await Promise.all([cargarCategorias(), cargarProductos()]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function manejarEliminarCategoria(cat) {
    if (!esAdmin || cat.nombre === "general") return;
    try {
      await eliminarCategoria({ id: cat.id, nombre: cat.nombre, categoriaDestino: "general" });
      setMensaje("Categoría eliminada.");
      await Promise.all([cargarCategorias(), cargarProductos()]);
    } catch (err) {
      setError(err.message);
    }
  }

  /* ── Render ──────────────────────────────────────────── */
  return (
    <AppShell
      title="Inventario de Productos"
      description={
        esAdmin
          ? "Gestión y control de productos y stock"
          : "Consulta de productos, precios y niveles de stock"
      }
      actions={
        esAdmin ? (
          <button
            className="inv-btn inv-btn-primary"
            type="button"
            onClick={abrirNuevoProducto}
          >
            + Nuevo Producto
          </button>
        ) : null
      }
    >
      <div className="inv-page">

        {/* ── Tarjetas de estadísticas ─────────────────── */}
        <div className="inv-stats-grid">
          <StatCard
            icon="📦"
            label="Total Productos"
            value={productos.length}
            sub={`${categoriasDisponibles.length} referencias distintas`}
            variant="blue"
          />
          <StatCard
            icon="⚠️"
            label="Stock Bajo"
            value={stockBajoCount}
            sub="Requieren reposición"
            variant={stockBajoCount > 0 ? "danger" : "green"}
            badge={stockBajoCount > 0 ? "¡ALERTA!" : null}
          />
          <StatCard
            icon="📥"
            label="Capital Invertido"
            value={formatCOP(totalValorCompra)}
            sub="Valor a precio de compra"
            variant="green"
          />
          <StatCard
            icon="💰"
            label="Valor a Precio Venta"
            value={formatCOP(totalValorVenta)}
            sub="Potencial si vendes todo"
            variant="teal"
          />
          <StatCard
            icon="🛒"
            label="Total Unidades"
            value={totalUnidades.toLocaleString("es-CO")}
            sub="Suma de todo el stock"
            variant="purple"
          />
        </div>

        {/* ── Barra de herramientas ────────────────────── */}
        <div className="inv-toolbar">
          <input
            className="nt-field inv-search"
            placeholder="Buscar productos..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <select
            className="nt-field inv-cat-select"
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value)}
          >
            <option value="todas">Todas las categorías</option>
            {categoriasDisponibles.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            className="inv-btn inv-btn-ghost"
            type="button"
            onClick={() => setModalReabastecimiento(true)}
          >
            📋 Reabastecimiento
          </button>
          {esAdmin ? (
            <button
              className="inv-btn inv-btn-ghost"
              type="button"
              onClick={() => setModalCategorias(true)}
            >
              ⚙ Categorías
            </button>
          ) : null}
        </div>

        {/* ── Alertas ──────────────────────────────────── */}
        {error && (
          <div className="nt-alert nt-alert-error">
            Error: {error}
            <button className="inv-alert-close" type="button" onClick={() => setError("")}>✕</button>
          </div>
        )}
        {mensaje && (
          <div className="nt-alert nt-alert-success">
            {mensaje}
            <button className="inv-alert-close" type="button" onClick={() => setMensaje("")}>✕</button>
          </div>
        )}

        {/* ── Grid de productos ────────────────────────── */}
        {cargando ? (
          <div className="inv-loading">
            <div className="inv-spinner" />
            <span>Cargando productos...</span>
          </div>
        ) : productosFiltrados.length === 0 ? (
          <div className="inv-empty">
            <div className="inv-empty-icon">📭</div>
            <div>No hay productos para mostrar.</div>
            {esAdmin && (
              <button
                className="inv-btn inv-btn-primary"
                type="button"
                onClick={abrirNuevoProducto}
              >
                + Crear primer producto
              </button>
            )}
          </div>
        ) : (
          <div className="inv-grid">
            {productosFiltrados.map((p) => (
              <ProductCard
                key={p.id}
                producto={p}
                esAdmin={esAdmin}
                onEditar={abrirEditarProducto}
                onEliminar={abrirEliminar}
                onAjustarStock={abrirAjustarStock}
                onVerHistorial={abrirHistorial}
              />
            ))}
          </div>
        )}
      </div>

      {/* ══ Modal: Crear / Editar Producto ═══════════════ */}
      <Modal
        open={modalProducto}
        onClose={cerrarModalProducto}
        titulo={editandoId ? "Editar Producto" : "Nuevo Producto"}
        size="lg"
      >
        <form className="inv-form" onSubmit={manejarSubmit}>
          {error && <div className="nt-alert nt-alert-error">{error}</div>}

          <div className="inv-form-grid">
            <div className="inv-form-field">
              <label className="inv-label">
                Nombre <span className="inv-required">*</span>
              </label>
              <input
                className="nt-field"
                name="nombre"
                placeholder="Nombre del producto"
                value={formulario.nombre}
                onChange={manejarCambioFormulario}
                disabled={guardando}
                autoFocus
              />
            </div>

            <div className="inv-form-field">
              <label className="inv-label">
                Categoría <span className="inv-required">*</span>
              </label>
              <select
                className="nt-field"
                name="categoria"
                value={formulario.categoria}
                onChange={manejarCambioFormulario}
                disabled={guardando}
              >
                <option value="">Selecciona categoría</option>
                {categorias.map((c) => (
                  <option key={c.nombre} value={c.nombre}>{c.nombre}</option>
                ))}
              </select>
            </div>

            <div className="inv-form-field">
              <label className="inv-label">
                Precio Compra <span className="inv-required">*</span>
              </label>
              <input
                className="nt-field"
                name="precio_compra"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={formulario.precio_compra}
                onChange={manejarCambioFormulario}
                disabled={guardando}
              />
            </div>

            <div className="inv-form-field">
              <label className="inv-label">
                Precio Venta <span className="inv-required">*</span>
              </label>
              <input
                className="nt-field"
                name="precio_venta"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={formulario.precio_venta}
                onChange={manejarCambioFormulario}
                disabled={guardando}
              />
            </div>

            <div className="inv-form-field">
              <label className="inv-label">
                Stock {editandoId ? "Actual" : "Inicial"} {!editandoId && <span className="inv-required">*</span>}
              </label>
              <input
                className="nt-field"
                name="stock"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={formulario.stock}
                onChange={manejarCambioFormulario}
                disabled={guardando || Boolean(editandoId)}
                title={editandoId ? "Usa el botón 'Ajustar stock' de la tarjeta para cambiar el stock." : undefined}
              />
              {editandoId && (
                <p className="inv-help-text">
                  Para cambiar el stock usa el botón <strong>📥 Ajustar stock</strong> de la tarjeta del
                  producto: así queda registrado en el historial.
                </p>
              )}
            </div>

            <div className="inv-form-field">
              <label className="inv-label">Stock Mínimo</label>
              <input
                className="nt-field"
                name="stock_minimo"
                type="number"
                min="0"
                step="1"
                placeholder="2"
                value={formulario.stock_minimo}
                onChange={manejarCambioFormulario}
                disabled={guardando}
              />
            </div>
          </div>

          <div className="inv-form-field">
            <label className="inv-label">
              Código de Barras <span className="inv-required">*</span>
            </label>
            <div className="inv-barcode-row">
              <input
                className="nt-field nt-mono inv-grow"
                name="codigo_barras"
                placeholder="Escanea, escribe o genera"
                value={formulario.codigo_barras}
                onChange={manejarCambioFormulario}
                disabled={guardando}
              />
              <button
                className="inv-btn inv-btn-ghost"
                type="button"
                onClick={generarCodigoBarras}
                disabled={guardando}
              >
                Generar
              </button>
            </div>
          </div>

          <div className="inv-form-actions">
            <button
              className="inv-btn inv-btn-ghost"
              type="button"
              onClick={cerrarModalProducto}
              disabled={guardando}
            >
              Cancelar
            </button>
            <button
              className="inv-btn inv-btn-primary"
              type="submit"
              disabled={guardando}
            >
              {guardando ? "Guardando..." : editandoId ? "Actualizar Producto" : "Crear Producto"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ══ Modal: Confirmar Eliminación ══════════════════ */}
      <Modal
        open={modalEliminar}
        onClose={() => setModalEliminar(false)}
        titulo="Eliminar Producto"
        size="sm"
      >
        <div className="inv-confirm">
          <div className="inv-confirm-icon">🗑️</div>
          <p className="inv-confirm-text">
            ¿Estás seguro que deseas eliminar{" "}
            <strong>{productoSeleccionado?.nombre}</strong>?
            <br />
            <span className="nt-muted">Esta acción no se puede deshacer.</span>
          </p>
          <div className="inv-form-actions" style={{ width: "100%", borderTop: "none", paddingTop: 0 }}>
            <button
              className="inv-btn inv-btn-ghost"
              type="button"
              onClick={() => setModalEliminar(false)}
              disabled={guardando}
            >
              Cancelar
            </button>
            <button
              className="inv-btn inv-btn-danger"
              type="button"
              onClick={confirmarEliminar}
              disabled={guardando}
            >
              {guardando ? "Eliminando..." : "Sí, eliminar"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ══ Modal: Gestionar Categorías ═══════════════════ */}
      <Modal
        open={modalCategorias}
        onClose={cerrarModalCategorias}
        titulo="Gestionar Categorías"
        size="md"
      >
        <div className="inv-cats">
          {error && (
            <div className="nt-alert nt-alert-error">
              {error}
              <button className="inv-alert-close" type="button" onClick={() => setError("")}>✕</button>
            </div>
          )}
          {mensaje && (
            <div className="nt-alert nt-alert-success">
              {mensaje}
              <button className="inv-alert-close" type="button" onClick={() => setMensaje("")}>✕</button>
            </div>
          )}

          {esAdmin && (
            <form className="inv-barcode-row" onSubmit={manejarCrearCategoria}>
              <input
                className="nt-field inv-grow"
                placeholder="Nueva categoría (ej: cargadores)"
                value={nuevaCategoria}
                onChange={(e) => setNuevaCategoria(e.target.value)}
              />
              <button className="inv-btn inv-btn-primary" type="submit">
                + Agregar
              </button>
            </form>
          )}

          <div className="inv-cats-list">
            {categorias.map((cat) => (
              <div key={cat.id} className="inv-cat-item">
                {renombrandoCategoria?.id === cat.id ? (
                  <form
                    className="inv-barcode-row inv-grow"
                    onSubmit={confirmarRenombrado}
                  >
                    <input
                      className="nt-field inv-grow"
                      value={nuevoNombreCategoria}
                      onChange={(e) => setNuevoNombreCategoria(e.target.value)}
                      autoFocus
                    />
                    <button className="inv-btn inv-btn-primary inv-btn-sm" type="submit">
                      ✓
                    </button>
                    <button
                      className="inv-btn inv-btn-ghost inv-btn-sm"
                      type="button"
                      onClick={() => setRenombrandoCategoria(null)}
                    >
                      ✕
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="nt-pill inv-cat-nombre">{cat.nombre}</span>
                    <div className="inv-cat-actions">
                      <button
                        className="inv-btn inv-btn-ghost inv-btn-sm"
                        type="button"
                        onClick={() => iniciarRenombrado(cat)}
                        disabled={!esAdmin}
                      >
                        Renombrar
                      </button>
                      <button
                        className="inv-btn inv-btn-danger inv-btn-sm"
                        type="button"
                        onClick={() => manejarEliminarCategoria(cat)}
                        disabled={!esAdmin || cat.nombre === "general"}
                      >
                        Eliminar
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {categorias.length === 0 && (
              <p className="nt-muted">No hay categorías creadas.</p>
            )}
          </div>
        </div>
      </Modal>

      {/* ══ Modal: Ajustar Stock ══════════════════════════ */}
      <ModalAjustarStock
        open={modalAjustarStock}
        producto={productoParaStock}
        onClose={() => { setModalAjustarStock(false); setProductoParaStock(null); }}
        onGuardado={manejarAjusteGuardado}
      />

      {/* ══ Modal: Historial de Stock (Kardex) ═══════════ */}
      <ModalHistorialStock
        open={modalHistorial}
        producto={productoParaStock}
        onClose={() => { setModalHistorial(false); setProductoParaStock(null); }}
      />

      {/* ══ Modal: Reporte de Reabastecimiento ═══════════ */}
      <ModalReabastecimiento
        open={modalReabastecimiento}
        onClose={() => setModalReabastecimiento(false)}
      />
    </AppShell>
  );
}
