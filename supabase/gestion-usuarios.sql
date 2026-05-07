-- ================================================================
-- NOVA TECH · Gestión de Usuarios
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ================================================================

-- 1. Agregar columna apellido a public.usuarios
--    (si la tabla ya existe desde fases anteriores)
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS apellido text NOT NULL DEFAULT '';

-- 2. (Opcional) Migrar datos existentes: si antes guardaste el apellido
--    dentro del campo "nombre" separado por espacio, puedes separarlo aquí.
--    Descomenta y ajusta según tu caso:
--
-- UPDATE public.usuarios
-- SET
--   apellido = split_part(nombre, ' ', 2),
--   nombre   = split_part(nombre, ' ', 1)
-- WHERE apellido = '' AND nombre LIKE '% %';


-- ================================================================
-- NOTAS SOBRE SEGURIDAD Y OPERACIÓN
-- ================================================================
--
-- La gestión de usuarios (crear cuenta, cambiar contraseña, banear)
-- se realiza vía Supabase Admin API desde el frontend.
-- Para habilitarla agrega al .env del proyecto:
--
--   VITE_SUPABASE_SERVICE_KEY=<tu_service_role_key>
--
-- Encuéntrala en: Supabase Dashboard → Settings → API → service_role
--
-- ¡Nunca compartas ni expongas esta clave públicamente!
-- Es segura en una herramienta interna de punto de venta en red local.
--
-- ================================================================
-- POLÍTICAS RLS recomendadas para public.usuarios
-- ================================================================

-- Asegúrate de que RLS esté activo
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- Permitir que cada usuario lea su propio perfil
CREATE POLICY IF NOT EXISTS "usuarios_select_propio"
  ON public.usuarios
  FOR SELECT
  USING (auth.uid() = id);

-- Permitir que el service_role (admin) lea/escriba todo
-- (las operaciones admin del frontend usan el service_role key,
--  que bypasea RLS por defecto en Supabase)
