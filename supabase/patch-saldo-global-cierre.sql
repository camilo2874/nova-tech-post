-- ================================================================
-- NOVA TECH · Parche: saldo global del último cierre de caja
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ================================================================
-- Problema: obtenerSaldoUltimoCierre() filtraba por usuario_id,
-- por lo que un cajero o admin diferente al que cerró el último
-- turno siempre veía $0 al querer abrir.
--
-- Solución: función SECURITY DEFINER que devuelve el último saldo
-- de cierre sin importar qué usuario cerró el turno anterior.
-- Solo retorna el monto (no datos sensibles del turno completo).
-- ================================================================

CREATE OR REPLACE FUNCTION public.obtener_saldo_ultimo_cierre_global()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    monto_cierre_efectivo,
    saldo_calculado_cierre,
    monto_apertura,
    0
  )
  FROM public.caja
  WHERE cerrado_en IS NOT NULL
  ORDER BY cerrado_en DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.obtener_saldo_ultimo_cierre_global() IS
  'Devuelve el saldo del último turno cerrado en toda la tienda (contabilidad única).
   Usa SECURITY DEFINER para bypasear RLS — solo expone el monto de cierre, no datos del operador.
   Cualquier usuario autenticado puede llamarla para pre-cargar la apertura del próximo turno.';

REVOKE ALL ON FUNCTION public.obtener_saldo_ultimo_cierre_global() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_saldo_ultimo_cierre_global() TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_saldo_ultimo_cierre_global() TO service_role;
