-- ================================================================
-- NOVA TECH · Parche: acceso completo del superadministrador
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ================================================================
-- Problema: las políticas RLS solo verificaban el rol 'administrador',
-- dejando al 'superadministrador' sin acceso a caja y movimientos.
-- ================================================================

-- Helper: función interna que devuelve true si el usuario actual
-- tiene rol administrador O superadministrador (y está activo).
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

-- ================================================================
-- TABLA: caja
-- ================================================================

DROP POLICY IF EXISTS caja_select_mio_o_admin ON public.caja;
CREATE POLICY caja_select_mio_o_admin ON public.caja
  FOR SELECT
  USING (
    usuario_id = auth.uid()
    OR public.es_admin_o_superadmin()
  );

-- El superadmin también puede abrir su propia caja
DROP POLICY IF EXISTS caja_insert_propio ON public.caja;
CREATE POLICY caja_insert_propio ON public.caja
  FOR INSERT
  WITH CHECK (usuario_id = auth.uid());

-- El superadmin puede cerrar cualquier caja (útil para gestión)
DROP POLICY IF EXISTS caja_update_cerrar_propio ON public.caja;
CREATE POLICY caja_update_cerrar_propio ON public.caja
  FOR UPDATE
  USING (
    (usuario_id = auth.uid() AND cerrado_en IS NULL)
    OR public.es_admin_o_superadmin()
  )
  WITH CHECK (
    usuario_id = auth.uid()
    OR public.es_admin_o_superadmin()
  );

-- ================================================================
-- TABLA: movimientos_caja
-- ================================================================

DROP POLICY IF EXISTS mov_select_turno ON public.movimientos_caja;
CREATE POLICY mov_select_turno ON public.movimientos_caja
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.caja c
      WHERE c.id = movimientos_caja.caja_id
        AND (
          c.usuario_id = auth.uid()
          OR public.es_admin_o_superadmin()
        )
    )
  );

-- ================================================================
-- TABLA: ventas (política de lectura para reportes)
-- ================================================================
-- Si RLS está activo en ventas, asegurarse de que admin y superadmin
-- puedan leer todas las ventas para los reportes.

ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ventas_select_propio_o_admin ON public.ventas;
CREATE POLICY ventas_select_propio_o_admin ON public.ventas
  FOR SELECT
  USING (
    usuario_id = auth.uid()
    OR public.es_admin_o_superadmin()
  );

DROP POLICY IF EXISTS ventas_insert_propio ON public.ventas;
CREATE POLICY ventas_insert_propio ON public.ventas
  FOR INSERT
  WITH CHECK (usuario_id = auth.uid());

-- ================================================================
-- TABLA: detalle_venta
-- ================================================================

ALTER TABLE public.detalle_venta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS detalle_select_admin ON public.detalle_venta;
CREATE POLICY detalle_select_admin ON public.detalle_venta
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ventas v
      WHERE v.id = detalle_venta.venta_id
        AND (
          v.usuario_id = auth.uid()
          OR public.es_admin_o_superadmin()
        )
    )
  );

DROP POLICY IF EXISTS detalle_insert_propio ON public.detalle_venta;
CREATE POLICY detalle_insert_propio ON public.detalle_venta
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ventas v
      WHERE v.id = detalle_venta.venta_id AND v.usuario_id = auth.uid()
    )
  );

-- ================================================================
-- TABLA: usuarios (lectura para todos los roles autenticados)
-- ================================================================
-- El service_role ya bypasea RLS. Esto es para que la app pueda
-- leer perfiles propios con la anon key.

DROP POLICY IF EXISTS "usuarios_select_propio" ON public.usuarios;
CREATE POLICY "usuarios_select_propio"
  ON public.usuarios
  FOR SELECT
  USING (auth.uid() = id OR public.es_admin_o_superadmin());

-- ================================================================
-- TABLA: productos (lectura y escritura para todos los autenticados)
-- ================================================================
-- Todos los roles necesitan leer productos (ventas, inventario).
-- Solo admin y superadmin pueden crear/editar/eliminar.

ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS productos_select_autenticado ON public.productos;
CREATE POLICY productos_select_autenticado ON public.productos
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS productos_insert_admin ON public.productos;
CREATE POLICY productos_insert_admin ON public.productos
  FOR INSERT
  WITH CHECK (public.es_admin_o_superadmin());

DROP POLICY IF EXISTS productos_update_admin ON public.productos;
CREATE POLICY productos_update_admin ON public.productos
  FOR UPDATE
  USING (public.es_admin_o_superadmin());

DROP POLICY IF EXISTS productos_delete_admin ON public.productos;
CREATE POLICY productos_delete_admin ON public.productos
  FOR DELETE
  USING (public.es_admin_o_superadmin());

-- ================================================================
-- TABLA: categorias (lectura para todos, escritura solo admin)
-- ================================================================

ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categorias_select_autenticado ON public.categorias;
CREATE POLICY categorias_select_autenticado ON public.categorias
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS categorias_insert_admin ON public.categorias;
CREATE POLICY categorias_insert_admin ON public.categorias
  FOR INSERT
  WITH CHECK (public.es_admin_o_superadmin());

DROP POLICY IF EXISTS categorias_update_admin ON public.categorias;
CREATE POLICY categorias_update_admin ON public.categorias
  FOR UPDATE
  USING (public.es_admin_o_superadmin());

DROP POLICY IF EXISTS categorias_delete_admin ON public.categorias;
CREATE POLICY categorias_delete_admin ON public.categorias
  FOR DELETE
  USING (public.es_admin_o_superadmin());
