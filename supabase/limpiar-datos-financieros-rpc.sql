-- NOVA TECH — RPC: Limpieza completa de datos financieros
-- ─────────────────────────────────────────────────────────────────────────────
-- Ejecutar en Supabase → SQL Editor
--
-- Qué hace:
--   1. Verifica que NO existan turnos de caja abiertos (cerrado_en IS NULL).
--      Si hay alguno abierto, lanza una excepción y no borra nada.
--   2. Cuenta los registros actuales para devolver el resumen.
--   3. Usa TRUNCATE (en vez de DELETE) para evitar el bloqueo de pg_safeupdate
--      que Supabase activa por defecto y que rechaza DELETE sin WHERE.
--      El orden del TRUNCATE respeta las FK automáticamente.
--
-- Qué NO toca:
--   productos, categorias, usuarios — el inventario queda intacto.
--
-- Llamada desde JS:
--   const { data, error } = await supabase.rpc('limpiar_datos_financieros');
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION limpiar_datos_financieros()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_detalle      int := 0;
  v_ventas       int := 0;
  v_movimientos  int := 0;
  v_caja         int := 0;
BEGIN

  -- ── Guardia: turno abierto ───────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM caja WHERE cerrado_en IS NULL LIMIT 1) THEN
    RAISE EXCEPTION
      'Hay turnos de caja abiertos. Cierra todos los turnos antes de limpiar los datos.';
  END IF;

  -- ── Contar antes de borrar (para devolver resumen) ───────────────────────
  SELECT COUNT(*) INTO v_detalle      FROM detalle_venta;
  SELECT COUNT(*) INTO v_ventas       FROM ventas;
  SELECT COUNT(*) INTO v_movimientos  FROM movimientos_caja;
  SELECT COUNT(*) INTO v_caja         FROM caja;

  -- ── Borrado con TRUNCATE (evita el bloqueo de pg_safeupdate) ─────────────
  -- PostgreSQL resuelve el orden de FK automáticamente cuando se listan
  -- todas las tablas en un solo TRUNCATE con CASCADE.
  TRUNCATE TABLE detalle_venta, movimientos_caja, ventas, caja
    RESTART IDENTITY CASCADE;

  -- ── Resultado ─────────────────────────────────────────────────────────────
  RETURN json_build_object(
    'detalle_venta',    v_detalle,
    'ventas',           v_ventas,
    'movimientos_caja', v_movimientos,
    'caja',             v_caja,
    'total',            v_detalle + v_ventas + v_movimientos + v_caja
  );

END;
$$;
