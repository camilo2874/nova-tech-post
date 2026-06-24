import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCaja } from "../context/CajaContext";
import AppShell from "../components/AppShell";
import { useCajaAbierta } from "../hooks/useCajaAbierta";
import { imprimirFacturaTicket } from "../utils/imprimirFacturaTicket";
import { obtenerCategorias } from "../services/categoriasServicio";
import {
  buscarProductoPorCodigo,
  buscarProductosPorNombre,
  obtenerConteosProductosPorCategoria,
  obtenerProductosPorCategoria,
  registrarVenta,
} from "../services/ventasServicio";
import "../styles/pos.css";
import { abrirCajon, conectarCajon, desconectarCajon, cajonConectado, cajonMetodoConexion } from "../utils/cajonMonedero";

/** Evita filtrar por nombre mientras se tipea un código largo solo numérico (se confirma con Enter). */
function debeBusquedaEnVivoCatalogo(raw) {
  const t = String(raw ?? "").trim();
  if (t.length === 0) return true;
  if (/^\d+$/.test(t) && t.length >= 8) return false;
  return true;
}

function urlImagenProducto(p) {
  const u = p?.imagen_url ?? p?.url_imagen ?? p?.foto_url ?? p?.image_url;
  if (typeof u !== "string") return null;
  const s = u.trim();
  if (!s || (!s.startsWith("http") && !s.startsWith("data:"))) return null;
  return s;
}

function inicialesNombre(nombre) {
  const w = String(nombre ?? "").trim().split(/\s+/).filter(Boolean);
  const a = w[0]?.[0] ?? "?";
  const b = w.length > 1 ? w[1][0] : w[0]?.[1] ?? "";
  return `${a}${b}`.toUpperCase().slice(0, 2);
}

function matizParaTexto(s) {
  let h = 216;
  const str = String(s ?? "");
  for (let i = 0; i < str.length; i++) {
    h = (h * 33 + str.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

/* ─────────────────────────────────────────────────────────────
   Modal de Éxito
   ───────────────────────────────────────────────────────────── */
function ModalExito({ datos, onImprimir, onCerrar }) {
  const { ventaId, total, metodoPago, items, montoRecibido, vuelto } = datos;
  const totalFmt = `$${Number(total).toFixed(2)}`;
  const tieneEfectivoDetalle = metodoPago === "efectivo" && montoRecibido > 0;

  return (
    <div className="pos-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
      <div className="pos-modal">
        <div className="pos-modal-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="pos-modal-title" id="modal-titulo">Venta Registrada</h2>
        <p className="pos-modal-sub">ID #{ventaId}</p>

        <div className="pos-modal-grid">
          <div className="pos-modal-stat">
            <span className="pos-modal-stat-label">Total cobrado</span>
            <span className="pos-modal-stat-value">{totalFmt}</span>
          </div>
          <div className="pos-modal-stat">
            <span className="pos-modal-stat-label">Método de pago</span>
            <span className="pos-modal-stat-value pos-modal-stat-cap">{metodoPago}</span>
          </div>
          <div className="pos-modal-stat">
            <span className="pos-modal-stat-label">Líneas</span>
            <span className="pos-modal-stat-value">{items.length}</span>
          </div>
          <div className="pos-modal-stat">
            <span className="pos-modal-stat-label">Estado</span>
            <span className="pos-modal-stat-value pos-modal-ok">Completada ✓</span>
          </div>
          {tieneEfectivoDetalle && (
            <>
              <div className="pos-modal-stat">
                <span className="pos-modal-stat-label">Recibido</span>
                <span className="pos-modal-stat-value">${Number(montoRecibido).toFixed(2)}</span>
              </div>
              <div className="pos-modal-stat pos-modal-stat-vuelto">
                <span className="pos-modal-stat-label">Cambio / Vuelto</span>
                <span className="pos-modal-stat-value pos-modal-ok pos-modal-vuelto-val">
                  ${Number(vuelto ?? 0).toFixed(2)}
                </span>
              </div>
            </>
          )}
        </div>

        {items.length > 0 && (
          <ul className="pos-modal-items" aria-label="Artículos vendidos">
            {items.map((item) => (
              <li key={item.id} className="pos-modal-item">
                <span className="pos-modal-item-name">{item.nombre}</span>
                <span className="pos-modal-item-qty">×{item.cantidad}</span>
                <span className="pos-modal-item-price">
                  ${(Number(item.precio_final) * Number(item.cantidad)).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="pos-modal-actions">
          <button className="pos-btn pos-btn-ghost" type="button" onClick={onImprimir}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="15" height="15">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M9 14h6v8H9v-8z"
              />
            </svg>
            Imprimir
          </button>
          <button className="pos-btn pos-btn-primary" type="button" onClick={onCerrar}>
            Nueva Venta →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   VentasPage
   ───────────────────────────────────────────────────────────── */
export default function VentasPage() {
  const { usuario, perfil } = useAuth();
  const { modoVisor, turnoActivo } = useCaja();
  const { cajaAbierta, cargandoCaja, refrescarCajaAbierta } = useCajaAbierta();

  const [consultaCatalogo, setConsultaCatalogo] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("todas");
  const [categorias, setCategorias] = useState([]);
  const [conteoPorCategoria, setConteoPorCategoria] = useState({});
  const [conteoTotalProductos, setConteoTotalProductos] = useState(null);
  const [resultados, setResultados] = useState([]);
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [carrito, setCarrito] = useState([]);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [modalExito, setModalExito] = useState(null);
  const [montoRecibido, setMontoRecibido] = useState("");
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [cajonActivo, setCajonActivo] = useState(false);
  /** Borrador por línea para poder borrar el campo y escribir otra cantidad sin que el input «rebote». */
  const [cantidadBorrador, setCantidadBorrador] = useState({});

  const catalogoQueryRef = useRef(consultaCatalogo);
  catalogoQueryRef.current = consultaCatalogo;

  /* ── Cálculos ─────────────────────────────────────────── */
  const subtotalLista = useMemo(
    () => carrito.reduce((acc, item) => acc + Number(item.precio_lista) * Number(item.cantidad), 0),
    [carrito],
  );

  const total = useMemo(
    () => carrito.reduce((acc, item) => acc + Number(item.precio_final) * Number(item.cantidad), 0),
    [carrito],
  );

  const descuentoTotal = useMemo(() => Math.max(0, subtotalLista - total), [subtotalLista, total]);

  const totalUnidadesCarrito = useMemo(
    () => carrito.reduce((acc, item) => acc + Number(item.cantidad), 0),
    [carrito],
  );

  const vuelto = useMemo(() => {
    if (metodoPago !== "efectivo") return null;
    const recibido = Number(montoRecibido);
    if (!recibido || Number.isNaN(recibido) || recibido <= 0) return null;
    return recibido - total;
  }, [metodoPago, montoRecibido, total]);

  useEffect(() => {
    setMontoRecibido("");
  }, [metodoPago]);

  const limpiarError = useCallback(() => setError(""), []);

  const refrescarConteosCatalogo = useCallback(async () => {
    try {
      const { porCategoria, total } = await obtenerConteosProductosPorCategoria();
      setConteoPorCategoria(porCategoria);
      setConteoTotalProductos(total);
    } catch {
      setConteoPorCategoria({});
      setConteoTotalProductos(null);
    }
  }, []);

  /* ── Carga de productos ───────────────────────────────── */
  const aplicarVistaProductos = useCallback(
    async (terminoBusqueda) => {
      try {
        limpiarError();
        const termino = String(terminoBusqueda ?? "").trim();
        const data = termino
          ? await buscarProductosPorNombre(termino, categoriaFiltro)
          : await obtenerProductosPorCategoria(categoriaFiltro);
        setResultados(data);
      } catch (err) {
        setError(err.message);
      }
    },
    [categoriaFiltro, limpiarError],
  );

  const refrescarCategorias = useCallback(async () => {
    try {
      limpiarError();
      const data = await obtenerCategorias();
      const nombres = Array.from(new Set((data ?? []).map((item) => item.nombre)));
      setCategorias(nombres);
      if (categoriaFiltro !== "todas" && !nombres.includes(categoriaFiltro)) {
        setCategoriaFiltro("todas");
      }
      await refrescarConteosCatalogo();
    } catch (err) {
      setError(`Categorías: ${err.message}`);
      setCategorias([]);
    }
  }, [categoriaFiltro, limpiarError, refrescarConteosCatalogo]);

  const inicializado = useRef(false);
  const categoriaAnterior = useRef(categoriaFiltro);

  useEffect(() => {
    let activo = true;
    async function iniciar() {
      try {
        await refrescarCategorias();
        if (!activo) return;
        await aplicarVistaProductos("");
        inicializado.current = true;
        categoriaAnterior.current = categoriaFiltro;
      } catch (err) {
        if (activo) setError(err.message ?? "Error al cargar datos iniciales.");
      } finally {
        if (activo) setCargandoInicial(false);
      }
    }
    iniciar();
    return () => {
      activo = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!inicializado.current) return;
    if (categoriaAnterior.current === categoriaFiltro) return;
    categoriaAnterior.current = categoriaFiltro;
    const texto = catalogoQueryRef.current;
    aplicarVistaProductos(texto.trim() ? texto : "");
  }, [categoriaFiltro, aplicarVistaProductos]);

  useEffect(() => {
    if (!inicializado.current) return;
    if (!debeBusquedaEnVivoCatalogo(consultaCatalogo)) return;
    const handle = window.setTimeout(() => {
      aplicarVistaProductos(consultaCatalogo.trim());
    }, 320);
    return () => window.clearTimeout(handle);
  }, [consultaCatalogo, aplicarVistaProductos]);

  useEffect(() => {
    const alEnfocarVentana = () => refrescarCategorias();
    window.addEventListener("focus", alEnfocarVentana);
    return () => window.removeEventListener("focus", alEnfocarVentana);
  }, [refrescarCategorias]);

  useEffect(() => {
    const ids = new Set(carrito.map((item) => item.id));
    setCantidadBorrador((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next)) {
        if (!ids.has(key)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [carrito]);

  async function refrescarListaActual(terminoExplicito) {
    const termino =
      terminoExplicito !== undefined ? String(terminoExplicito).trim() : consultaCatalogo.trim();
    await aplicarVistaProductos(termino);
  }

  /* ── Carrito ──────────────────────────────────────────── */
  function agregarAlCarrito(producto) {
    limpiarError();
    setCantidadBorrador((prev) => {
      if (!(producto.id in prev)) return prev;
      const next = { ...prev };
      delete next[producto.id];
      return next;
    });
    setCarrito((prev) => {
      const existente = prev.find((item) => item.id === producto.id);
      if (existente) {
        if (existente.cantidad >= producto.stock) {
          setError(`Stock insuficiente para "${producto.nombre}".`);
          return prev;
        }
        return prev.map((item) =>
          item.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item,
        );
      }
      const precioVenta = Number(producto.precio_venta ?? producto.precio ?? 0);
      return [
        ...prev,
        { ...producto, cantidad: 1, precio_lista: precioVenta, precio_final: precioVenta },
      ];
    });
  }

  function actualizarCantidad(id, valor) {
    const n = parseInt(valor, 10);
    if (Number.isNaN(n) || n < 0) return;
    if (n === 0) {
      setCarrito((prev) => prev.filter((item) => item.id !== id));
      return;
    }
    setCarrito((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (n > item.stock) {
          setError(`Stock máximo para "${item.nombre}": ${item.stock}.`);
          return item;
        }
        return { ...item, cantidad: n };
      }),
    );
  }

  function confirmarCantidadBorrador(id) {
    limpiarError();
    const item = carrito.find((linea) => linea.id === id);
    if (!item) return;

    const raw = cantidadBorrador[id];
    const texto = raw !== undefined ? String(raw).trim() : String(item.cantidad);

    if (texto === "") {
      actualizarCantidad(id, item.cantidad);
      setCantidadBorrador((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    const n = parseInt(texto.replace(/\D/g, ""), 10);
    if (Number.isNaN(n) || n < 1) {
      actualizarCantidad(id, item.cantidad);
      setCantidadBorrador((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    if (n > item.stock) {
      setError(`Stock máximo para "${item.nombre}": ${item.stock}.`);
      setCantidadBorrador((prev) => ({ ...prev, [id]: String(item.stock) }));
      actualizarCantidad(id, item.stock);
      return;
    }

    actualizarCantidad(id, n);
    setCantidadBorrador((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function cambiarCantidadPorDelta(id, delta) {
    limpiarError();
    setCantidadBorrador((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setCarrito((prev) => {
      const linea = prev.find((item) => item.id === id);
      if (!linea) return prev;
      const siguiente = linea.cantidad + delta;
      if (siguiente <= 0) return prev.filter((item) => item.id !== id);
      if (siguiente > linea.stock) {
        setError(`Stock máximo para "${linea.nombre}": ${linea.stock}.`);
        return prev;
      }
      return prev.map((item) =>
        item.id === id ? { ...item, cantidad: siguiente } : item,
      );
    });
  }

  function actualizarPrecioFinal(id, nuevoPrecio) {
    const valor = Number(nuevoPrecio);
    if (Number.isNaN(valor) || valor < 0) return;
    setCarrito((prev) =>
      prev.map((item) => (item.id === id ? { ...item, precio_final: valor } : item)),
    );
  }

  function quitarItem(id) {
    limpiarError();
    setCarrito((prev) => prev.filter((item) => item.id !== id));
  }

  /* ── Búsqueda unificada (nombre en vivo + código con Enter) ── */
  async function manejarCatalogoEnter() {
    const q = consultaCatalogo.trim();
    if (!q) {
      await aplicarVistaProductos("");
      return;
    }
    try {
      limpiarError();
      const producto = await buscarProductoPorCodigo(q);
      if (producto) {
        if (producto.stock <= 0) {
          setError("El producto no tiene stock disponible.");
          return;
        }
        agregarAlCarrito(producto);
        setConsultaCatalogo("");
        await refrescarListaActual("");
        return;
      }
    } catch (err) {
      setError(err.message);
      return;
    }
    await aplicarVistaProductos(q);
  }

  /* ── resetModule — limpia todo para nueva venta ───────── */
  function resetModule() {
    setCarrito([]);
    setCantidadBorrador({});
    setConsultaCatalogo("");
    setCategoriaFiltro("todas");
    setError("");
    setMontoRecibido("");
    setConfirmandoCancelar(false);
    setModalExito(null);
    aplicarVistaProductos("");
  }

  /* ── Cancelar venta ─────────────────────────────────── */
  function cancelarVenta() {
    setCarrito([]);
    setCantidadBorrador({});
    setMontoRecibido("");
    setConfirmandoCancelar(false);
    limpiarError();
  }

  /* ── Cajón monedero ─────────────────────────────────── */
  async function handleConectarCajon() {
    try {
      await conectarCajon();
      const conectado = cajonConectado();
      setCajonActivo(conectado);
      if (!conectado) {
        setError("No se pudo conectar al cajón. Verifica el puerto o la impresora.");
        return;
      }
      // Probar apertura al conectar para confirmar que la impresora responde
      const prueba = await abrirCajon();
      if (!prueba.success) {
        setCajonActivo(false);
        setError(prueba.message || "El cajón no respondió. Revisa el cable RJ11 y el nombre de la impresora.");
      }
    } catch (err) {
      setError(err.message);
      setCajonActivo(false);
    }
  }

  /* ── Cobro ────────────────────────────────────────────── */
  async function cobrarVenta() {
    if (!usuario?.id) {
      setError("No hay sesión activa.");
      return;
    }
    if (carrito.length === 0) {
      setError("El carrito está vacío.");
      return;
    }
    if (!cajaAbierta?.id) {
      setError("Abre un turno de caja antes de cobrar.");
      return;
    }
    const montoNum = Number(montoRecibido) || 0;
    if (metodoPago === "efectivo" && montoNum > 0 && montoNum < total) {
      setError(
        `El monto recibido ($${montoNum.toFixed(2)}) es insuficiente. Total: $${total.toFixed(2)}.`,
      );
      return;
    }

    try {
      setProcesando(true);
      limpiarError();

      const itemsSnapshot = [...carrito];
      const vueltoFinal = montoNum > 0 ? montoNum - total : null;

      const resultado = await registrarVenta({
        usuarioId: usuario.id,
        cajaId: cajaAbierta.id,
        metodoPago,
        items: carrito,
      });

      if (metodoPago === "efectivo" && cajonActivo) {
        abrirCajon()
          .then((result) => {
            if (!result.success) {
              console.warn("No se pudo abrir el cajón:", result.message);
            }
          })
          .catch((err) => console.error("Error abriendo cajón:", err));
      }

      setModalExito({
        factura: resultado.factura,
        ventaId: resultado.ventaId,
        total: resultado.total,
        metodoPago,
        items: itemsSnapshot,
        montoRecibido: montoNum > 0 ? montoNum : null,
        vuelto: vueltoFinal,
      });

      setCarrito([]);
      setCantidadBorrador({});
      setMontoRecibido("");
      await refrescarListaActual();
      await refrescarCajaAbierta();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  /* ── Header pills ─────────────────────────────────────── */
  const turnoLabel = cargandoCaja
    ? "Verificando…"
    : cajaAbierta?.id
      ? "Turno abierto"
      : modoVisor
        ? `Visor · ${turnoActivo?.operador_nombre ?? "..."}`
        : "Sin turno";

  const turnoClass = cajaAbierta?.id
    ? "nt-pill nt-pill-ok"
    : modoVisor
      ? "nt-pill nt-pill-info"
      : "nt-pill nt-pill-warn";

  return (
    <AppShell
      title="Ventas"
      description="Punto de venta · busca, agrega y cobra en segundos"
      actions={
        <div className="nt-row">
          <span className={turnoClass}>{turnoLabel}</span>
          <span className="nt-pill">Método: {metodoPago}</span>
          {carrito.length > 0 && (
            <span className="nt-pill nt-pill-accent" title="Unidades en carrito">
              {totalUnidadesCarrito} uds · {carrito.length}{" "}
              línea{carrito.length !== 1 ? "s" : ""}
            </span>
          )}
          <button
            className={`nt-btn ${cajonActivo ? "nt-btn-cajon-on" : "nt-btn-ghost"}`}
            type="button"
            onClick={handleConectarCajon}
            title={cajonActivo ? `Cajón conectado (${cajonMetodoConexion()})` : "Conectar cajón monedero"}
          >
            🗄 {cajonActivo ? "Cajón ✓" : "Cajón"}
          </button>
          <Link className="nt-btn nt-btn-ghost" to="/caja">
            Caja
          </Link>
        </div>
      }
    >
      {/* ── Modal de Éxito ─────────────────────────────── */}
      {modalExito && (
        <ModalExito
          datos={modalExito}
          onImprimir={() =>
            imprimirFacturaTicket({
              factura: modalExito.factura,
              vendedor: { nombre: perfil?.nombre ?? null },
              tienda: null,
              montoRecibido: modalExito.montoRecibido,
              vuelto: modalExito.vuelto,
            })
          }
          onCerrar={resetModule}
        />
      )}

      <div className="pos-root">
        {/* ── Alertas ───────────────────────────────────── */}
        {!cargandoCaja && !cajaAbierta?.id && modoVisor && (
          <div className="pos-alert" style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a" }}>
            👁 Modo visor — La caja está siendo operada por <strong>{turnoActivo?.operador_nombre}</strong>.
            {" "}No puedes registrar ventas hasta que cierre su turno.
          </div>
        )}
        {!cargandoCaja && !cajaAbierta?.id && !modoVisor && (
          <div className="pos-alert pos-alert-warn">
            ⚠ Sin turno de caja activo.{" "}
            <Link className="nt-link" to="/caja">
              Abre un turno en Caja
            </Link>{" "}
            para registrar ventas.
          </div>
        )}
        {error && (
          <div className="pos-alert pos-alert-error">
            <span>⚠ {error}</span>
            <button className="pos-alert-close" type="button" onClick={limpiarError}>
              ✕
            </button>
          </div>
        )}

        {/* ── Layout 2 columnas ─────────────────────────── */}
        <div className="pos-layout">
          {/* ═══ Columna Izquierda: Búsqueda + Productos ═══ */}
          <div className="pos-col-left">
            {/* Panel de búsqueda */}
            <div className="pos-search-panel pos-search-panel-unified">
              <div className="pos-search-unified-head">
                <label className="pos-label" htmlFor="catalogo-buscar">
                  Buscar o escanear
                </label>
                <p className="pos-search-sub">
                  Escribí para filtrar por nombre. Con{" "}
                  <kbd className="pos-kbd">Enter</kbd>: si el texto es un código de barras registrado, se agrega al carrito; si no, se busca por nombre.
                </p>
              </div>
              <div className="pos-search-field pos-search-field-hero">
                <span className="pos-search-icon" aria-hidden="true">⌕</span>
                <input
                  className="pos-input pos-input-scan"
                  id="catalogo-buscar"
                  placeholder="Nombre del producto o código de barras…"
                  value={consultaCatalogo}
                  onChange={(e) => setConsultaCatalogo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      manejarCatalogoEnter();
                    }
                  }}
                  autoComplete="off"
                  autoFocus
                />
                {consultaCatalogo ? (
                  <button
                    className="pos-input-clear"
                    type="button"
                    onClick={() => {
                      setConsultaCatalogo("");
                      aplicarVistaProductos("");
                    }}
                    aria-label="Limpiar búsqueda"
                  >
                    ✕
                  </button>
                ) : null}
                <button className="pos-btn pos-btn-accent" type="button" onClick={() => manejarCatalogoEnter()}>
                  Buscar / Agregar
                </button>
              </div>
            </div>

            {/* Filtros de categoría */}
            <div className="pos-cats" role="toolbar" aria-label="Filtrar por categoría">
              <button
                className={`pos-cat${categoriaFiltro === "todas" ? " is-active" : ""}`}
                type="button"
                onClick={() => setCategoriaFiltro("todas")}
              >
                <span className="pos-cat-text">Todas</span>
                {conteoTotalProductos != null && (
                  <span className="pos-cat-badge">{conteoTotalProductos}</span>
                )}
              </button>
              {categorias.map((cat) => (
                <button
                  key={cat}
                  className={`pos-cat${categoriaFiltro === cat ? " is-active" : ""}`}
                  type="button"
                  onClick={() => setCategoriaFiltro(cat)}
                >
                  <span className="pos-cat-text">{cat}</span>
                  {conteoTotalProductos != null && (
                    <span className="pos-cat-badge">
                      {conteoPorCategoria[cat.trim().toLowerCase()] ?? 0}
                    </span>
                  )}
                </button>
              ))}
              <button
                className="pos-cat pos-cat-refresh"
                type="button"
                onClick={refrescarCategorias}
                title="Actualizar categorías y conteos"
              >
                ↺
              </button>
            </div>

            {/* Grid de productos (scroll independiente para catálogos grandes) */}
            <div className="pos-catalog-body">
              {cargandoInicial ? (
                <div className="pos-loading">Cargando productos…</div>
              ) : resultados.length === 0 ? (
                <div className="pos-empty">No se encontraron productos para ese filtro.</div>
              ) : (
                <>
                  <p className="pos-catalog-hint" aria-live="polite">
                    {resultados.length} producto{resultados.length !== 1 ? "s" : ""} · Toca una tarjeta o usa el escáner
                  </p>
                  <div className="pos-products-scroll">
                    <div className="pos-products">
                      {resultados.map((item) => {
                        const imgUrl = urlImagenProducto(item);
                        const hue = matizParaTexto(item.nombre);
                        return (
                          <button
                            key={item.id}
                            className="pos-product-card"
                            type="button"
                            onClick={() => agregarAlCarrito(item)}
                            disabled={item.stock <= 0}
                          >
                            <div
                              className="pos-product-thumb"
                              style={{ "--pos-thumb-h": hue }}
                              aria-hidden={imgUrl ? undefined : true}
                            >
                              {imgUrl ? (
                                <img
                                  className="pos-product-thumb-img"
                                  src={imgUrl}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <span className="pos-product-thumb-fallback">
                                  {inicialesNombre(item.nombre)}
                                </span>
                              )}
                            </div>
                            <div className="pos-product-name">{item.nombre}</div>
                            <div className="pos-product-meta">
                              <span className="pos-product-cat">{item.categoria}</span>
                              <span className={`pos-product-stock${item.stock <= 3 ? " low" : ""}`}>
                                Stock: {item.stock}
                              </span>
                            </div>
                            <div className="pos-product-price">
                              ${Number(item.precio_venta ?? item.precio).toFixed(2)}
                            </div>
                            {item.stock <= 0 && (
                              <div className="pos-product-no-stock">Sin stock</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ═══ Columna Derecha: Carrito + Cobro ═══ */}
          <aside className="pos-col-right">
            {/* ── Carrito ─────────────────────────────── */}
            <div className="pos-cart-card">
              <div className="pos-cart-header">
                <span className="pos-cart-title">Carrito</span>
                {carrito.length > 0 && (
                  <div className="pos-cart-header-stats">
                    <span className="pos-cart-badge" title="Unidades totales">
                      {totalUnidadesCarrito}
                    </span>
                    <span className="pos-cart-header-stats-text">
                      uds · {carrito.length} línea{carrito.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
                {carrito.length > 0 && (
                  <button
                    className="pos-cart-clear"
                    type="button"
                    onClick={() => {
                      setCarrito([]);
                      setCantidadBorrador({});
                    }}
                  >
                    Vaciar
                  </button>
                )}
              </div>

              {carrito.length === 0 ? (
                <div className="pos-cart-empty">
                  <span className="pos-cart-empty-icon" aria-hidden="true">🛒</span>
                  <p>Agrega productos para comenzar</p>
                </div>
              ) : (
                <div className="pos-cart-list">
                  <div className="pos-cart-list-head" aria-hidden="true">
                    <span>Producto</span>
                    <span>Lista</span>
                    <span>P.Final</span>
                    <span>Cant.</span>
                    <span>Subt.</span>
                    <span />
                  </div>
                  {carrito.map((item) => (
                    <div key={item.id} className="pos-cart-row">
                      <div className="pos-cart-row-name" title={item.nombre}>
                        {item.nombre}
                      </div>
                      <div className="pos-cart-row-list">
                        ${Number(item.precio_lista).toFixed(2)}
                      </div>
                      <div>
                        <input
                          className="pos-inline-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.precio_final}
                          aria-label={`Precio final de ${item.nombre}`}
                          onChange={(e) => actualizarPrecioFinal(item.id, e.target.value)}
                        />
                      </div>
                      <div className="pos-cart-qty-cell">
                        <div className="pos-qty-stepper">
                          <button
                            className="pos-qty-btn"
                            type="button"
                            aria-label={`Quitar una unidad de ${item.nombre}`}
                            onClick={() => cambiarCantidadPorDelta(item.id, -1)}
                          >
                            −
                          </button>
                          <input
                            className="pos-inline-input pos-qty-input"
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={6}
                            value={
                              cantidadBorrador[item.id] !== undefined
                                ? cantidadBorrador[item.id]
                                : String(item.cantidad)
                            }
                            aria-label={`Cantidad de ${item.nombre}`}
                            title={`Máx. stock: ${item.stock}`}
                            onFocus={() =>
                              setCantidadBorrador((d) => ({
                                ...d,
                                [item.id]: String(item.cantidad),
                              }))
                            }
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, "");
                              setCantidadBorrador((d) => ({ ...d, [item.id]: digits }));
                            }}
                            onBlur={() => confirmarCantidadBorrador(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                confirmarCantidadBorrador(item.id);
                                e.currentTarget.blur();
                              }
                            }}
                          />
                          <button
                            className="pos-qty-btn"
                            type="button"
                            aria-label={`Agregar una unidad de ${item.nombre}`}
                            disabled={item.cantidad >= item.stock}
                            onClick={() => cambiarCantidadPorDelta(item.id, 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="pos-cart-row-sub">
                        ${(Number(item.precio_final) * Number(item.cantidad)).toFixed(2)}
                      </div>
                      <div>
                        <button
                          className="pos-cart-remove"
                          type="button"
                          aria-label={`Quitar ${item.nombre}`}
                          onClick={() => quitarItem(item.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Cobro ───────────────────────────────── */}
            <div className="pos-checkout-card">
              {/* Totales */}
              <div className="pos-totals">
                <div className="pos-total-row">
                  <span>Subtotal lista</span>
                  <span>${subtotalLista.toFixed(2)}</span>
                </div>
                {descuentoTotal > 0 && (
                  <div className="pos-total-row pos-total-discount">
                    <span>Descuento aplicado</span>
                    <span>−${descuentoTotal.toFixed(2)}</span>
                  </div>
                )}
                <div className="pos-total-row pos-total-main">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>

              {/* Método de pago */}
              <div>
                <span className="pos-label">Método de pago</span>
                <div className="pos-payment-options">
                  {[
                    { id: "efectivo", emoji: "💵" },
                    { id: "tarjeta", emoji: "💳" },
                    { id: "transferencia", emoji: "📲" },
                    { id: "mixto", emoji: "⚡" },
                  ].map(({ id, emoji }) => (
                    <button
                      key={id}
                      className={`pos-payment-opt${metodoPago === id ? " is-active" : ""}`}
                      type="button"
                      onClick={() => setMetodoPago(id)}
                    >
                      {emoji} {id}
                    </button>
                  ))}
                </div>
              </div>

              {/* Monto recibido + vuelto (solo efectivo) */}
              {metodoPago === "efectivo" && carrito.length > 0 && (
                <div className="pos-monto-section">
                  <label className="pos-label" htmlFor="monto-recibido">
                    Monto recibido (opcional)
                  </label>
                  <div className="pos-monto-field">
                    <span className="pos-monto-prefix">$</span>
                    <input
                      id="monto-recibido"
                      className="pos-monto-input"
                      type="number"
                      min="0"
                      step="100"
                      placeholder={`Mínimo ${total.toFixed(2)}`}
                      value={montoRecibido}
                      onChange={(e) => setMontoRecibido(e.target.value)}
                    />
                    {montoRecibido && (
                      <button
                        className="pos-input-clear"
                        type="button"
                        onClick={() => setMontoRecibido("")}
                        aria-label="Limpiar monto"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {vuelto !== null && (
                    <div className={`pos-vuelto${vuelto < 0 ? " is-negativo" : ""}`}>
                      <span className="pos-vuelto-label">
                        {vuelto < 0 ? "⚠ Falta" : "Vuelto / Cambio"}
                      </span>
                      <span className="pos-vuelto-monto">
                        ${Math.abs(vuelto).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Botón cobrar */}
              <button
                className="pos-btn-cobrar"
                type="button"
                onClick={cobrarVenta}
                disabled={procesando || carrito.length === 0 || !cajaAbierta?.id}
              >
                {procesando ? (
                  <>
                    <span className="pos-spinner" aria-hidden="true" />
                    Procesando…
                  </>
                ) : (
                  <>
                    Cobrar · {totalUnidadesCarrito} uds · ${total.toFixed(2)}
                  </>
                )}
              </button>

              {/* Cancelar venta */}
              {carrito.length > 0 && !procesando && (
                confirmandoCancelar ? (
                  <div className="pos-cancelar-confirm">
                    <p className="pos-cancelar-confirm-msg">
                      ¿Cancelar la venta? Se vaciará el carrito.
                    </p>
                    <div className="pos-cancelar-confirm-btns">
                      <button
                        className="pos-btn pos-btn-ghost"
                        type="button"
                        onClick={() => setConfirmandoCancelar(false)}
                      >
                        No, continuar
                      </button>
                      <button
                        className="pos-btn pos-btn-danger"
                        type="button"
                        onClick={cancelarVenta}
                      >
                        Sí, cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="pos-btn-cancelar-venta"
                    type="button"
                    onClick={() => setConfirmandoCancelar(true)}
                  >
                    Cancelar venta
                  </button>
                )
              )}

              {!cajaAbierta?.id && !cargandoCaja && !modoVisor && (
                <p className="pos-hint">
                  <Link className="nt-link" to="/caja">
                    Abre un turno en Caja
                  </Link>{" "}
                  para poder cobrar.
                </p>
              )}
              {!cajaAbierta?.id && !cargandoCaja && modoVisor && (
                <p className="pos-hint" style={{ color: "#3b82f6" }}>
                  👁 Solo lectura — <Link className="nt-link" to="/caja">Ver estado de caja</Link>
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
