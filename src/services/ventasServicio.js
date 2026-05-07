import { supabase } from "./supabaseCliente";

function mensajeRpc(error) {
  if (!error) return "Error desconocido al registrar la venta.";
  const base = error.message || "Error al registrar la venta.";
  const detalle = [error.details, error.hint].filter(Boolean).join(" ");
  return detalle ? `${base} ${detalle}`.trim() : base;
}

function normalizarProducto(producto) {
  const precioVenta = producto.precio_venta ?? producto.precio ?? 0;
  return {
    ...producto,
    categoria: producto.categoria ?? "general",
    precio_venta: precioVenta,
    precio: precioVenta,
  };
}

export async function buscarProductoPorCodigo(codigoBarras) {
  const { data, error } = await supabase
    .from("productos")
    .select("*")
    .eq("codigo_barras", codigoBarras)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? normalizarProducto(data) : null;
}

export async function buscarProductosPorNombre(termino, categoria = "todas") {
  let query = supabase.from("productos").select("*").order("nombre", { ascending: true }).limit(100);
  query = query.ilike("nombre", `%${termino}%`);
  if (categoria !== "todas") {
    query = query.eq("categoria", categoria);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(normalizarProducto);
}

export async function obtenerProductosPorCategoria(categoria = "todas") {
  let query = supabase.from("productos").select("*").order("nombre", { ascending: true }).limit(100);
  if (categoria !== "todas") {
    query = query.eq("categoria", categoria);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(normalizarProducto);
}

/** Solo columna `categoria`: sirve para badges de conteo en el POS sin traer filas completas. */
export async function obtenerConteosProductosPorCategoria() {
  const { data, error } = await supabase.from("productos").select("categoria");
  if (error) {
    throw new Error(error.message);
  }

  const porCategoria = {};
  let total = 0;
  for (const row of data ?? []) {
    const c = String(row.categoria ?? "general").trim().toLowerCase();
    porCategoria[c] = (porCategoria[c] ?? 0) + 1;
    total += 1;
  }

  return { porCategoria, total };
}

/**
 * Registra la venta en una sola transacción (RPC): ventas, detalle, stock y movimiento de caja si aplica.
 * Requiere la función `registrar_venta_pos` ejecutada en Supabase (ver supabase/registrar-venta-pos-rpc.sql).
 */
export async function registrarVenta({ usuarioId, cajaId, metodoPago, items }) {
  if (!cajaId) {
    throw new Error("Abre un turno de caja antes de registrar la venta.");
  }

  if (!usuarioId) {
    throw new Error("No hay usuario para registrar la venta.");
  }

  if (!items?.length) {
    throw new Error("El carrito está vacío.");
  }

  const p_items = items.map((item) => ({
    producto_id: item.producto_id ?? item.id,
    cantidad: Number(item.cantidad),
    precio: Number(item.precio_final ?? item.precio),
    precio_lista: Number(item.precio_lista ?? item.precio_venta ?? item.precio ?? item.precio_final),
  }));

  const { data, error } = await supabase.rpc("registrar_venta_pos", {
    p_usuario_id: usuarioId,
    p_caja_id: cajaId,
    p_metodo_pago: metodoPago,
    p_items,
  });

  if (error) {
    throw new Error(mensajeRpc(error));
  }

  const payload = data && typeof data === "object" ? data : null;
  if (!payload?.venta_id) {
    throw new Error("La venta no devolvió un identificador.");
  }

  const total = Number(payload.total);

  return {
    ventaId: payload.venta_id,
    total,
    /** Mismo JSON que devuelve la RPC (fecha, lineas, subtotal, descuento, metodo_pago, …) */
    factura: payload,
  };
}
