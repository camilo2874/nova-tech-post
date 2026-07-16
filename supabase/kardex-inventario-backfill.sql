-- NOVA TECH — Kardex de inventario: backfill del "stock inicial" para productos
-- que ya existían ANTES de instalar kardex-inventario.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Ejecutar en Supabase → SQL Editor, UNA SOLA VEZ, después de kardex-inventario.sql.
--
-- Por qué hace falta:
--   El trigger `fn_log_stock_inicial` solo se dispara cuando se CREA un producto
--   nuevo (INSERT). Los productos que ya existían antes de correr
--   kardex-inventario.sql nunca dispararon ese trigger, así que su historial
--   arranca "a medias" (solo se ven ventas/ajustes hechos DESPUÉS de instalar
--   el Kardex, sin el punto de partida).
--
-- Qué hace:
--   Para cada producto que no tenga ya un movimiento "Stock inicial...", calcula
--   cuál era su stock ANTES de sus movimientos ya registrados:
--     stock_base = stock_actual − suma(cantidad de sus movimientos ya registrados)
--   e inserta una "entrada" retroactiva con ese valor, fechada un segundo antes de
--   su primer movimiento real (o "ahora" si el producto no tiene ningún
--   movimiento todavía) — así aparece primero en el historial, en orden
--   cronológico correcto.
--
-- Es seguro ejecutarlo más de una vez: si un producto ya tiene un movimiento con
-- motivo que empieza por "Stock inicial", se salta (no duplica).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r record;
  v_base integer;
  v_fecha timestamptz;
BEGIN
  FOR r IN
    SELECT
      p.id,
      p.stock,
      COALESCE(
        (SELECT SUM(mi.cantidad) FROM public.movimientos_inventario mi WHERE mi.producto_id = p.id),
        0
      ) AS suma_movimientos,
      (SELECT MIN(mi.creado_en) FROM public.movimientos_inventario mi WHERE mi.producto_id = p.id) AS primer_movimiento
    FROM public.productos p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.movimientos_inventario mi2
      WHERE mi2.producto_id = p.id AND mi2.motivo ILIKE 'Stock inicial%'
    )
  LOOP
    v_base := r.stock - r.suma_movimientos;

    IF v_base > 0 THEN
      v_fecha := COALESCE(r.primer_movimiento, now()) - interval '1 second';

      INSERT INTO public.movimientos_inventario
        (producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_resultante, motivo, creado_en)
      VALUES (
        r.id, NULL, 'entrada', v_base, 0, v_base,
        'Stock inicial registrado retroactivamente (backfill)',
        v_fecha
      );
    ELSIF v_base < 0 THEN
      RAISE NOTICE 'Producto % : inconsistencia (stock_base=%), se omite el backfill.', r.id, v_base;
    END IF;
    -- v_base = 0: nada que registrar (producto sin stock, sin backfill necesario).
  END LOOP;
END $$;
