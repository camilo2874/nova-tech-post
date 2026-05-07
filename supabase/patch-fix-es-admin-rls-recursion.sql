-- ================================================================
-- NOVA TECH · Parche: evitar recursión RLS en es_admin_o_superadmin
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ================================================================
-- Síntoma: "stack depth limit exceeded" al cargar Inicio / reportes
-- con joins anidados tipo ventas(..., usuarios(nombre)).
--
-- Causa: la política usuarios_select_propio usa es_admin_o_superadmin(),
-- y esa función lee public.usuarios → la política vuelve a evaluar la
-- función → recursión infinita.
--
-- Solución: la función SECURITY DEFINER desactiva row_security solo
-- dentro de su ejecución al consultar usuarios.
-- ================================================================

CREATE OR REPLACE FUNCTION public.es_admin_o_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = auth.uid()
      AND u.rol IN ('administrador', 'superadministrador')
      AND COALESCE(u.activo, true)
  );
$$;
