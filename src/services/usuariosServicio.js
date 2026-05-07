import { supabase } from "./supabaseCliente";
import { supabaseAdmin, verificarAdmin } from "./supabaseAdmin";

/**
 * Devuelve todos los perfiles de public.usuarios combinados con el email
 * de auth.users (via admin API).
 * Usa supabaseAdmin en todas las operaciones para evitar bloqueos de RLS.
 */
export async function listarUsuarios() {
  verificarAdmin();

  const [perfilesRes, authRes] = await Promise.all([
    supabaseAdmin
      .from("usuarios")
      .select("id, nombre, apellido, rol, activo")
      .order("nombre"),
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  if (perfilesRes.error) throw perfilesRes.error;
  if (authRes.error) throw authRes.error;

  const emailMap = Object.fromEntries(
    (authRes.data.users || []).map((u) => [u.id, u.email])
  );

  return (perfilesRes.data || []).map((p) => ({
    ...p,
    apellido: p.apellido || "",
    email: emailMap[p.id] || "",
  }));
}

/**
 * Crea un usuario en auth.users y su perfil en public.usuarios.
 * Si falla el insert del perfil, elimina el auth user para evitar huérfanos.
 */
export async function crearUsuario({ nombre, apellido, email, password, rol }) {
  verificarAdmin();

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError) throw authError;

  const { error: perfilError } = await supabaseAdmin
    .from("usuarios")
    .insert({ id: user.id, nombre, apellido, rol, activo: true });

  if (perfilError) {
    await supabaseAdmin.auth.admin.deleteUser(user.id).catch(() => {});
    throw perfilError;
  }

  return user;
}

/**
 * Actualiza nombre, apellido y rol en public.usuarios.
 * Si se provee email, también lo actualiza en auth.users.
 */
export async function actualizarUsuario(id, { nombre, apellido, email, rol }) {
  verificarAdmin();

  const promesas = [
    supabaseAdmin
      .from("usuarios")
      .update({ nombre, apellido, rol })
      .eq("id", id),
  ];

  if (email) {
    promesas.push(supabaseAdmin.auth.admin.updateUserById(id, { email }));
  }

  const resultados = await Promise.all(promesas);
  for (const res of resultados) {
    if (res.error) throw res.error;
  }
}

/**
 * Cambia la contraseña de cualquier usuario (requiere admin).
 */
export async function cambiarContrasena(userId, nuevaContrasena) {
  verificarAdmin();

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: nuevaContrasena,
  });
  if (error) throw error;
}

/**
 * Actualiza nombre y apellido del usuario actualmente autenticado.
 * Usa la sesión propia (clave anon) — requiere política RLS de auto-update.
 */
export async function actualizarPerfilPropio(userId, { nombre, apellido }) {
  const { error } = await supabase
    .from("usuarios")
    .update({ nombre, apellido })
    .eq("id", userId);
  if (error) throw error;
}

/**
 * Cambia la contraseña del usuario actualmente autenticado.
 * No requiere admin — usa supabase.auth.updateUser de la sesión activa.
 */
export async function cambiarContrasenaPropia(nuevaContrasena) {
  const { error } = await supabase.auth.updateUser({ password: nuevaContrasena });
  if (error) throw error;
}

/**
 * Activa o desactiva un usuario:
 * - actualiza el campo activo en public.usuarios
 * - aplica/quita ban en auth (bloquea el inicio de sesión)
 */
export async function toggleActivoUsuario(userId, nuevoEstado) {
  verificarAdmin();

  const [perfilRes, authRes] = await Promise.all([
    supabaseAdmin
      .from("usuarios")
      .update({ activo: nuevoEstado })
      .eq("id", userId),
    supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: nuevoEstado ? "none" : "876600h",
    }),
  ]);

  if (perfilRes.error) throw perfilRes.error;
  if (authRes.error) throw authRes.error;
}
