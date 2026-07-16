import { supabase } from "./supabaseCliente";

function normalizarProducto(producto) {
  const precioVenta = producto.precio_venta ?? producto.precio ?? 0;
  return {
    ...producto,
    categoria: producto.categoria ?? "general",
    precio_compra: producto.precio_compra ?? 0,
    precio_venta: precioVenta,
    precio: precioVenta,
  };
}

export async function obtenerProductos() {
  const { data, error } = await supabase
    .from("productos")
    .select("*")
    .order("creado_en", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(normalizarProducto);
}

export async function crearProducto(payload) {
  const { data, error } = await supabase
    .from("productos")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizarProducto(data);
}

export async function actualizarProducto(id, payload) {
  const { data, error } = await supabase
    .from("productos")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizarProducto(data);
}

export async function eliminarProducto(id) {
  const { error } = await supabase.from("productos").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Ajusta el stock de un producto (entrada de mercancía o corrección manual) vía la
 * RPC `ajustar_stock_producto`. Deja registro automático en el Kardex de inventario
 * (tabla movimientos_inventario) a través de un trigger en la base de datos.
 *
 * @param {object} params
 * @param {string} params.productoId
 * @param {"entrada"|"ajuste"} params.tipo
 * @param {number} params.cantidad  Delta con signo: "entrada" siempre positivo,
 *   "ajuste" puede ser positivo (sobrante de conteo) o negativo (pérdida/faltante).
 * @param {string} [params.motivo]  Obligatorio para "ajuste".
 *
 * REQUIERE ejecutar supabase/kardex-inventario.sql en el SQL Editor de Supabase.
 */
export async function ajustarStock({ productoId, tipo, cantidad, motivo }) {
  const { data, error } = await supabase.rpc("ajustar_stock_producto", {
    p_producto_id: productoId,
    p_tipo: tipo,
    p_cantidad: Number(cantidad),
    p_motivo: motivo?.trim() || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Historial de movimientos de stock (Kardex) de un producto: entradas, ventas y
 * ajustes, más reciente primero. Solo accesible para admin/superadmin (RLS).
 */
export async function obtenerMovimientosInventario(productoId) {
  const { data, error } = await supabase
    .from("movimientos_inventario")
    .select("id, tipo, cantidad, stock_anterior, stock_resultante, motivo, creado_en, usuarios(nombre)")
    .eq("producto_id", productoId)
    .order("creado_en", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
