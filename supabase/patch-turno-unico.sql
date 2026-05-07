-- ================================================================
-- NOVA TECH · Parche: turno único global de caja
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ================================================================
-- Problema: múltiples usuarios podían abrir turnos simultáneos,
-- generando doble contabilidad.
--
-- Solución:
--   1. Índice único parcial → solo 1 fila con cerrado_en IS NULL
--   2. RPC obtener_turno_activo() → devuelve el turno abierto
--      con nombre y rol del operador (para el modo visor)
-- ================================================================

-- ── 1. Índice único parcial ──────────────────────────────────────────────────
-- Indexa la expresión constante (true) sobre las filas con cerrado_en IS NULL.
-- Esto garantiza que como máximo UNA fila tenga cerrado_en IS NULL en toda
-- la tabla, independientemente del usuario_id.
--
-- Si alguien intenta insertar un segundo turno abierto, Postgres lanza:
--   ERROR: duplicate key value violates unique constraint "caja_una_sola_abierta"
--
-- PRECAUCIÓN: Si ya existen varios turnos abiertos, este índice fallará.
-- Limpiar con: UPDATE public.caja SET cerrado_en = now() WHERE cerrado_en IS NULL
-- y luego dejar solo el turno que corresponda antes de ejecutar este script.

CREATE UNIQUE INDEX IF NOT EXISTS caja_una_sola_abierta
  ON public.caja ((true))
  WHERE cerrado_en IS NULL;

COMMENT ON INDEX public.caja_una_sola_abierta IS
  'Garantiza que solo puede existir UN turno de caja abierto (cerrado_en IS NULL) en toda la tienda.';

-- ── 2. RPC: obtener el turno activo global con info del operador ─────────────
-- Devuelve una fila con los datos de la caja abierta + nombre y rol del operador.
-- Si no hay ningún turno abierto, devuelve un conjunto vacío (data = []).
--
-- Uso desde JS:
--   const { data } = await supabase.rpc("obtener_turno_activo");
--   const turno = data?.[0] ?? null;  // null si no hay turno activo

CREATE OR REPLACE FUNCTION public.obtener_turno_activo()
RETURNS TABLE (
  caja_id         uuid,
  usuario_id      uuid,
  abierto_en      timestamptz,
  monto_apertura  numeric,
  operador_nombre text,
  operador_rol    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    c.id                                              AS caja_id,
    c.usuario_id,
    COALESCE(c.abierto_en, c.creado_en)               AS abierto_en,
    COALESCE(c.monto_apertura, c.monto_inicial, 0)    AS monto_apertura,
    u.nombre                                          AS operador_nombre,
    u.rol                                             AS operador_rol
  FROM public.caja c
  JOIN public.usuarios u ON u.id = c.usuario_id
  WHERE c.cerrado_en IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.obtener_turno_activo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_turno_activo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_turno_activo() TO service_role;

COMMENT ON FUNCTION public.obtener_turno_activo() IS
  'Devuelve el turno de caja activo (cerrado_en IS NULL) con nombre y rol del operador. Máximo 1 fila. Si no hay turno, devuelve conjunto vacío.';
