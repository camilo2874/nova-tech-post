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
