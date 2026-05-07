import { supabase } from "./supabaseCliente";

export async function obtenerCategorias() {
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nombre")
    .order("nombre", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function crearCategoria(nombre) {
  const nombreLimpio = nombre.trim().toLowerCase();
  const { data, error } = await supabase
    .from("categorias")
    .insert({ nombre: nombreLimpio })
    .select("id, nombre")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function renombrarCategoria({ id, nombreActual, nuevoNombre }) {
  const nombreNuevoLimpio = nuevoNombre.trim().toLowerCase();
  const nombreActualLimpio = nombreActual.trim().toLowerCase();

  const { error: errorUpdateCategoria } = await supabase
    .from("categorias")
    .update({ nombre: nombreNuevoLimpio })
    .eq("id", id);

  if (errorUpdateCategoria) {
    throw new Error(errorUpdateCategoria.message);
  }

  const { error: errorUpdateProductos } = await supabase
    .from("productos")
    .update({ categoria: nombreNuevoLimpio })
    .eq("categoria", nombreActualLimpio);

  if (errorUpdateProductos) {
    throw new Error(errorUpdateProductos.message);
  }
}

export async function eliminarCategoria({ id, nombre, categoriaDestino = "general" }) {
  const nombreLimpio = nombre.trim().toLowerCase();
  const destinoLimpio = categoriaDestino.trim().toLowerCase();

  if (nombreLimpio === destinoLimpio) {
    throw new Error("La categoria destino debe ser diferente.");
  }

  const { error: errorUpsertDestino } = await supabase
    .from("categorias")
    .upsert({ nombre: destinoLimpio }, { onConflict: "nombre" });

  if (errorUpsertDestino) {
    throw new Error(errorUpsertDestino.message);
  }

  const { error: errorReasignar } = await supabase
    .from("productos")
    .update({ categoria: destinoLimpio })
    .eq("categoria", nombreLimpio);

  if (errorReasignar) {
    throw new Error(errorReasignar.message);
  }

  const { error: errorEliminar } = await supabase.from("categorias").delete().eq("id", id);
  if (errorEliminar) {
    throw new Error(errorEliminar.message);
  }
}
