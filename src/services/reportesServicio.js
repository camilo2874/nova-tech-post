import { supabase } from "./supabaseCliente";

// ── Helpers de fecha ────────────────────────────────────────────────────────

/** Devuelve la fecha local en formato YYYY-MM-DD */
export function hoyLocal() {
  return new Date().toLocaleDateString("en-CA");
}

/** Devuelve el rango de la semana actual (lunes–hoy) */
export function rangoSemanaActual() {
  const hoy = new Date();
  const dia = hoy.getDay();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - (dia === 0 ? 6 : dia - 1));
  return { desde: lunes.toLocaleDateString("en-CA"), hasta: hoy.toLocaleDateString("en-CA") };
}

/** Devuelve el rango del mes actual (día 1 – hoy) */
export function rangoMesActual() {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  return { desde: inicio.toLocaleDateString("en-CA"), hasta: hoy.toLocaleDateString("en-CA") };
}

/** Etiqueta legible de período */
export function etiquetaPeriodo(tipo, desde, hasta) {
  const fmt = (f) =>
    new Date(f + "T12:00:00").toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  if (tipo === "dia") return `Día ${fmt(desde)}`;
  if (tipo === "semana") return `Semana del ${fmt(desde)} al ${fmt(hasta)}`;
  if (tipo === "mes") {
    const d = new Date(desde + "T12:00:00");
    return `Mes de ${d.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}`;
  }
  if (tipo === "general") return "Reporte General — Todo el historial";
  return `${fmt(desde)} al ${fmt(hasta)}`;
}

// ── Consultas ──────────────────────────────────────────────────────────────

/** Lista de turnos disponibles (para el selector de turno en la UI) */
export async function obtenerTurnosDisponibles() {
  const { data, error } = await supabase
    .from("caja")
    .select(
      "id, abierto_en, cerrado_en, monto_apertura, monto_cierre_efectivo, saldo_calculado_cierre, usuarios(nombre)"
    )
    .order("abierto_en", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Reporte completo de un turno específico */
export async function obtenerReporteTurno(cajaId) {
  const [cajaRes, ventasRes, movsRes] = await Promise.all([
    supabase
      .from("caja")
      .select(
        "id, abierto_en, cerrado_en, monto_apertura, monto_cierre_efectivo, saldo_calculado_cierre, notas_cierre, usuarios(nombre)"
      )
      .eq("id", cajaId)
      .single(),
    supabase
      .from("ventas")
      .select(
        "id, total, subtotal, descuento, metodo_pago, creado_en, usuarios(nombre), detalle_venta(cantidad, precio_unitario, productos(nombre))"
      )
      .eq("caja_id", cajaId)
      .order("creado_en", { ascending: true }),
    supabase
      .from("movimientos_caja")
      .select("id, tipo, monto, concepto, creado_en, usuarios(nombre)")
      .eq("caja_id", cajaId)
      .order("creado_en", { ascending: true }),
  ]);

  if (cajaRes.error) throw new Error(cajaRes.error.message);
  if (ventasRes.error) throw new Error(ventasRes.error.message);
  if (movsRes.error) throw new Error(movsRes.error.message);

  const turno = cajaRes.data;
  return _construirReporte({
    tipo: "turno",
    label: `Turno — ${_fechaCorta(turno.abierto_en)} — ${turno.usuarios?.nombre ?? ""}`,
    turno,
    ventas: ventasRes.data ?? [],
    movimientos: movsRes.data ?? [],
    turnos: [],
  });
}

/** Reporte por rango de fechas (día, semana, mes o personalizado) */
export async function obtenerReportePorRango(fechaDesde, fechaHasta, tipo = "personalizado") {
  // Convertir los límites de la fecha local a UTC para que Supabase/PostgreSQL
  // compare correctamente las columnas timestamptz sin perder datos de usuarios
  // en zonas horarias detrás de UTC (e.g. UTC-5: datos después de 7 PM local
  // caerían en "mañana" UTC si se usan strings sin zona horaria).
  const desdeUTC = new Date(`${fechaDesde}T00:00:00`).toISOString();
  const hastaUTC = new Date(`${fechaHasta}T23:59:59`).toISOString();

  const CAMPOS_CAJA =
    "id, abierto_en, cerrado_en, monto_apertura, monto_cierre_efectivo, saldo_calculado_cierre, usuarios(nombre)";

  const [ventasRes, movsRes, turnosEnRangoRes, turnosAbiertosAntesRes] = await Promise.all([
    supabase
      .from("ventas")
      .select(
        "id, total, subtotal, descuento, metodo_pago, creado_en, caja_id, usuarios(nombre), detalle_venta(cantidad, precio_unitario, productos(nombre))"
      )
      .gte("creado_en", desdeUTC)
      .lte("creado_en", hastaUTC)
      .order("creado_en", { ascending: true })
      .limit(500),
    supabase
      .from("movimientos_caja")
      .select("id, tipo, monto, concepto, creado_en, caja_id, usuarios(nombre)")
      .gte("creado_en", desdeUTC)
      .lte("creado_en", hastaUTC)
      .order("creado_en", { ascending: true })
      .limit(500),
    // Turnos abiertos DENTRO del rango de fechas (caso normal)
    supabase
      .from("caja")
      .select(CAMPOS_CAJA)
      .gte("abierto_en", desdeUTC)
      .lte("abierto_en", hastaUTC)
      .order("abierto_en", { ascending: false })
      .limit(100),
    // Turnos aún ABIERTOS que iniciaron ANTES del rango (turno multidía)
    supabase
      .from("caja")
      .select(CAMPOS_CAJA)
      .is("cerrado_en", null)
      .lt("abierto_en", desdeUTC)
      .order("abierto_en", { ascending: false })
      .limit(10),
  ]);

  if (ventasRes.error) throw new Error(ventasRes.error.message);
  if (movsRes.error) throw new Error(movsRes.error.message);
  if (turnosEnRangoRes.error) throw new Error(turnosEnRangoRes.error.message);
  if (turnosAbiertosAntesRes.error) throw new Error(turnosAbiertosAntesRes.error.message);

  // Combinar turnos: los del rango primero, luego los multidía (evitar duplicados por id)
  const idsVistos = new Set((turnosEnRangoRes.data ?? []).map((t) => t.id));
  const turnosMultidia = (turnosAbiertosAntesRes.data ?? []).filter(
    (t) => !idsVistos.has(t.id)
  );
  const turnos = [...(turnosEnRangoRes.data ?? []), ...turnosMultidia].sort(
    (a, b) => new Date(b.abierto_en) - new Date(a.abierto_en)
  );

  return _construirReporte({
    tipo,
    label: etiquetaPeriodo(tipo, fechaDesde, fechaHasta),
    ventas: ventasRes.data ?? [],
    movimientos: movsRes.data ?? [],
    turnos,
    turnosMultidia,
  });
}

/** Reporte general con todo el historial disponible */
export async function obtenerReporteGeneral() {
  const [ventasRes, movsRes, turnosRes] = await Promise.all([
    supabase
      .from("ventas")
      .select(
        "id, total, subtotal, descuento, metodo_pago, creado_en, caja_id, usuarios(nombre), detalle_venta(cantidad, precio_unitario, productos(nombre))"
      )
      .order("creado_en", { ascending: true })
      .limit(2000),
    supabase
      .from("movimientos_caja")
      .select("id, tipo, monto, concepto, creado_en, caja_id, usuarios(nombre)")
      .order("creado_en", { ascending: true })
      .limit(2000),
    supabase
      .from("caja")
      .select(
        "id, abierto_en, cerrado_en, monto_apertura, monto_cierre_efectivo, saldo_calculado_cierre, usuarios(nombre)"
      )
      .order("abierto_en", { ascending: false })
      .limit(200),
  ]);

  if (ventasRes.error) throw new Error(ventasRes.error.message);
  if (movsRes.error) throw new Error(movsRes.error.message);
  if (turnosRes.error) throw new Error(turnosRes.error.message);

  return _construirReporte({
    tipo: "general",
    label: "Reporte General — Todo el historial",
    ventas: ventasRes.data ?? [],
    movimientos: movsRes.data ?? [],
    turnos: turnosRes.data ?? [],
  });
}

// ── Construcción del objeto reporte ───────────────────────────────────────

function _construirReporte({ tipo, label, turno = null, ventas, movimientos, turnos, turnosMultidia = [] }) {
  const totalVentas = ventas.reduce((s, v) => s + Number(v.total), 0);
  const cantidadVentas = ventas.length;
  const totalEfectivo = ventas
    .filter((v) => v.metodo_pago === "efectivo")
    .reduce((s, v) => s + Number(v.total), 0);
  const totalOtrosMedios = totalVentas - totalEfectivo;
  const totalIngresos = movimientos
    .filter((m) => m.tipo === "ingreso")
    .reduce((s, m) => s + Number(m.monto), 0);
  const totalEgresos = movimientos
    .filter((m) => m.tipo === "retiro")
    .reduce((s, m) => s + Number(m.monto), 0);
  const ticketPromedio = cantidadVentas > 0 ? totalVentas / cantidadVentas : 0;
  const totalDescuentos = ventas.reduce((s, v) => s + Number(v.descuento ?? 0), 0);

  // Saldo inicial: monto_apertura del turno específico, o del turno más antiguo
  // del período en reportes de rango/general.
  // En días con varios turnos, cada apertura posterior hereda el cierre anterior,
  // por lo que sumar todos duplicaría el dinero. Solo cuenta el primer arranque
  // del período (el turno con fecha de apertura más temprana).
  // turnos viene ordenado DESC por abierto_en → el más antiguo es el último elemento.
  const saldoInicial = (() => {
    if (tipo === "turno" && turno) {
      return Number(turno.monto_apertura ?? turno.monto_inicial ?? 0);
    }
    const lista = turnos ?? [];
    if (lista.length === 0) return 0;
    const primerTurno = lista[lista.length - 1];
    return Number(primerTurno.monto_apertura ?? primerTurno.monto_inicial ?? 0);
  })();

  // Efectivo real en caja = saldo apertura + ingresos − egresos
  const efectivoEnCaja = saldoInicial + totalIngresos - totalEgresos;

  // Métodos de pago únicos
  const metodosPago = {};
  for (const v of ventas) {
    const mp = v.metodo_pago ?? "otro";
    metodosPago[mp] = (metodosPago[mp] ?? 0) + Number(v.total);
  }

  // Top productos más vendidos
  const productosMapa = {};
  for (const venta of ventas) {
    for (const item of venta.detalle_venta ?? []) {
      const nombre = item.productos?.nombre ?? "Producto desconocido";
      if (!productosMapa[nombre]) productosMapa[nombre] = { nombre, cantidad: 0, total: 0 };
      productosMapa[nombre].cantidad += Number(item.cantidad);
      productosMapa[nombre].total += Number(item.cantidad) * Number(item.precio_unitario);
    }
  }
  const productosMasVendidos = Object.values(productosMapa)
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 15);

  return {
    tipo,
    label,
    turno,
    turnos,
    turnosMultidia,
    ventas,
    movimientos,
    productosMasVendidos,
    metodosPago,
    resumen: {
      totalVentas,
      cantidadVentas,
      totalEfectivo,
      totalOtrosMedios,
      totalIngresos,
      totalEgresos,
      ticketPromedio,
      totalDescuentos,
      saldoInicial,
      efectivoEnCaja,
    },
  };
}

function _fechaCorta(fecha) {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── Limpieza de datos financieros ─────────────────────────────────────────

/**
 * Verifica si existe algún turno de caja abierto (cerrado_en IS NULL).
 * Usado para bloquear el botón de limpieza en el frontend antes de abrir el modal.
 */
export async function hayTurnosAbiertos() {
  const { data, error } = await supabase
    .from("caja")
    .select("id")
    .is("cerrado_en", null)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/**
 * Llama a la RPC `limpiar_datos_financieros` que corre con SECURITY DEFINER
 * para saltarse el RLS y borrar todos los datos financieros en el orden correcto.
 *
 * La RPC también valida que no haya turnos abiertos — si los hay, lanza una excepción.
 *
 * REQUIERE ejecutar supabase/limpiar-datos-financieros-rpc.sql en el SQL Editor de Supabase.
 *
 * El inventario (productos, categorias, usuarios) NO se toca.
 * Esta operación es IRREVERSIBLE.
 */
export async function limpiarDatosFinancieros() {
  const { data, error } = await supabase.rpc("limpiar_datos_financieros");

  if (error) {
    // El mensaje de RAISE EXCEPTION llega en error.message
    throw new Error(error.message);
  }

  // data es el JSON devuelto por la RPC
  const resultado = data ?? {};
  const etiquetas = {
    detalle_venta:    "Líneas de venta",
    ventas:           "Ventas",
    movimientos_caja: "Movimientos de caja",
    caja:             "Turnos de caja",
  };

  const resumen = Object.entries(etiquetas).map(([tabla, label]) => ({
    tabla,
    label,
    filas: Number(resultado[tabla] ?? 0),
  }));

  const totalFilas = resumen.reduce((s, r) => s + r.filas, 0);
  return { resumen, totalFilas };
}
