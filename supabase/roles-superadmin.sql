-- ================================================================
-- NOVA TECH · Jerarquía de Roles
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ================================================================

-- 1. Actualizar el CHECK constraint para incluir superadministrador
--    (primero eliminar el existente, luego recrear)
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('superadministrador', 'administrador', 'cajero'));


-- 2. Política RLS: cada usuario puede actualizar su propio perfil
--    (nombre y apellido — el rol lo protege el CHECK + la app)
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_update_propio" ON public.usuarios;
CREATE POLICY "usuarios_update_propio"
  ON public.usuarios
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "usuarios_select_propio" ON public.usuarios;
CREATE POLICY "usuarios_select_propio"
  ON public.usuarios
  FOR SELECT
  USING (auth.uid() = id);


-- 3. Asignar rol superadministrador a tu usuario principal
--    Reemplaza el email por el tuyo:
--
-- UPDATE public.usuarios
-- SET rol = 'superadministrador'
-- WHERE id = (
--   SELECT id FROM auth.users WHERE email = 'tu_correo@aqui.com'
-- );


-- ================================================================
-- JERARQUÍA DE ROLES — Resumen
-- ================================================================
--
--  superadministrador
--    ✔ Ve todos los usuarios (superadmin, admin, cajeros)
--    ✔ Crea administradores y cajeros
--    ✔ Edita cualquier usuario
--    ✔ Cambia contraseña de cualquier usuario
--    ✔ Activa / desactiva cualquier usuario (excepto a sí mismo)
--
--  administrador
--    ✔ Ve solo cajeros
--    ✔ Crea cajeros (no puede crear admins)
--    ✔ Edita solo cajeros
--    ✔ Cambia contraseña de cajeros
--    ✔ Activa / desactiva cajeros
--    ✘ No puede tocar otros admins ni al superadmin
--
--  cajero
--    ✔ Edita su propio perfil (/mi-perfil)
--    ✔ Cambia su propia contraseña
--    ✘ Sin acceso al módulo de usuarios
-- ================================================================
