-- NOVA TECH — Kardex de inventario: historial de entradas, ventas y ajustes de stock
-- ─────────────────────────────────────────────────────────────────────────────
-- Ejecutar en Supabase → SQL Editor.
--
-- Problema que resuelve:
--   `productos.stock` es un solo número que se sobrescribe. No había forma de
--   saber cuánto stock había al inicio, cuánto entró después (reposiciones),
--   cuánto se vendió, ni quién hizo cada cambio — solo se veía el número final.
--
-- Solución:
--   Tabla `movimientos_inventario` (igual filosofía que `movimientos_caja`) que
--   registra CADA cambio de stock con su tipo, cantidad, stock antes/después,
--   usuario y motivo. El registro es 100% automático vía triggers sobre
--   `productos` — así ninguna vía de cambio de stock puede quedar sin loguear
--   (ni siquiera un UPDATE manual hecho fuera de la app).
--
--   Para evitar el bug de doble-descuento que ya sufrimos una vez
--   (ver fix-doble-descuento-stock.sql), SOLO el trigger inserta en
--   movimientos_inventario. Las funciones (registrar_venta_pos,
--   ajustar_stock_producto) únicamente ETIQUETAN el tipo de movimiento
--   (con `set_config`, local a la transacción) antes de actualizar
--   `productos.stock`; el trigger hace el resto.
--
-- Qué NO afecta:
--   `limpiar_datos_financieros()` sigue sin tocar esta tabla — el Kardex de
--   inventario sobrevive intacto a una limpieza de historial financiero
--   (por eso `venta_id` es una referencia informativa SIN foreign key: si
--   usáramos FK, un TRUNCATE ... CASCADE sobre `ventas` borraría también
--   todo el Kardex, no solo los movimientos ligados a ventas).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Tabla ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.movimientos_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos (id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  venta_id uuid, -- referencia informativa a ventas.id, SIN FK (ver nota arriba)
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'venta', 'ajuste')),
  cantidad integer NOT NULL CHECK (cantidad <> 0), -- delta con signo: + entra, - sale
  stock_anterior integer NOT NULL CHECK (stock_anterior >= 0),
  stock_resultante integer NOT NULL CHECK (stock_resultante >= 0),
  motivo text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (stock_resultante = stock_anterior + cantidad)
);

CREATE INDEX IF NOT EXISTS idx_mov_inv_producto ON public.movimientos_inventario (producto_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_mov_inv_fecha ON public.movimientos_inventario (creado_en DESC);

-- ── 2) RLS: solo admin/superadmin pueden leer el Kardex ──────────────────
-- Nadie inserta/actualiza/borra directamente esta tabla — todo pasa por los
-- triggers (SECURITY DEFINER) definidos abajo, que bypasean RLS.
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mov_inv_select_admin ON public.movimientos_inventario;
CREATE POLICY mov_inv_select_admin ON public.movimientos_inventario
  FOR SELECT
  USING (public.es_admin_o_superadmin());

-- ── 3) Trigger: registra CUALQUIER cambio de productos.stock ─────────────
-- Lee variables de sesión (transacción) que las funciones de más abajo
-- configuran ANTES de actualizar el stock, para saber el tipo/motivo/venta.
-- Si nadie configuró nada (p. ej. alguien hizo un UPDATE manual fuera de la
-- app), se registra como 'ajuste' sin motivo — así el Kardex nunca pierde un
-- cambio, sea cual sea el camino que lo produjo.
CREATE OR REPLACE FUNCTION public.fn_log_movimiento_inventario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_tipo text;
  v_motivo text;
  v_venta_id text;
  v_usuario_id text;
BEGIN
  IF NEW.stock IS DISTINCT FROM OLD.stock THEN
    v_tipo := current_setting('app.mov_tipo', true);
    IF v_tipo IS NULL OR btrim(v_tipo) = '' THEN
      v_tipo := 'ajuste';
    END IF;

    v_motivo    := current_setting('app.mov_motivo', true);
    v_venta_id  := current_setting('app.mov_venta_id', true);
    v_usuario_id := current_setting('app.mov_usuario_id', true);

    INSERT INTO public.movimientos_inventario
      (producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_resultante, motivo, venta_id)
    VALUES (
      NEW.id,
      CASE WHEN v_usuario_id IS NULL OR btrim(v_usuario_id) = '' THEN auth.uid() ELSE v_usuario_id::uuid END,
      v_tipo,
      NEW.stock - OLD.stock,
      OLD.stock,
      NEW.stock,
      NULLIF(btrim(COALESCE(v_motivo, '')), ''),
      CASE WHEN v_venta_id IS NULL OR btrim(v_venta_id) = '' THEN NULL ELSE v_venta_id::uuid END
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_productos_log_stock ON public.productos;
CREATE TRIGGER trg_productos_log_stock
AFTER UPDATE ON public.productos
FOR EACH ROW
EXECUTE FUNCTION public.fn_log_movimiento_inventario();

-- ── 4) Trigger: registra el stock inicial al crear un producto ───────────
CREATE OR REPLACE FUNCTION public.fn_log_stock_inicial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NEW.stock > 0 THEN
    INSERT INTO public.movimientos_inventario
      (producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_resultante, motivo)
    VALUES (NEW.id, auth.uid(), 'entrada', NEW.stock, 0, NEW.stock, 'Stock inicial al crear el producto');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_productos_log_stock_inicial ON public.productos;
CREATE TRIGGER trg_productos_log_stock_inicial
AFTER INSERT ON public.productos
FOR EACH ROW
EXECUTE FUNCTION public.fn_log_stock_inicial();

-- ── 5) RPC: ajustar stock manualmente (entrada de mercancía o corrección) ─
-- Solo admin/superadmin. p_cantidad es el DELTA con signo:
--   tipo='entrada' → siempre positivo (llegó mercancía nueva).
--   tipo='ajuste'  → positivo (sobrante de conteo) o negativo (pérdida, daño, faltante).
CREATE OR REPLACE FUNCTION public.ajustar_stock_producto(
  p_producto_id uuid,
  p_tipo text,
  p_cantidad integer,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $func$
DECLARE
  v_stock_actual integer;
  v_stock_nuevo integer;
  v_nombre text;
BEGIN
  IF NOT public.es_admin_o_superadmin() THEN
    RAISE EXCEPTION 'No tienes permisos para ajustar el stock.';
  END IF;

  IF p_tipo NOT IN ('entrada', 'ajuste') THEN
    RAISE EXCEPTION 'Tipo de movimiento invalido: %', p_tipo;
  END IF;

  IF p_cantidad IS NULL OR p_cantidad = 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser distinta de cero.';
  END IF;

  IF p_tipo = 'entrada' AND p_cantidad < 0 THEN
    RAISE EXCEPTION 'Una entrada de stock debe ser una cantidad positiva.';
  END IF;

  IF p_tipo = 'ajuste' AND (p_motivo IS NULL OR btrim(p_motivo) = '') THEN
    RAISE EXCEPTION 'Debes indicar un motivo para el ajuste de stock.';
  END IF;

  SELECT stock, nombre INTO v_stock_actual, v_nombre
  FROM public.productos
  WHERE id = p_producto_id
  FOR UPDATE;

  IF v_stock_actual IS NULL THEN
    RAISE EXCEPTION 'Producto no encontrado.';
  END IF;

  v_stock_nuevo := v_stock_actual + p_cantidad;

  IF v_stock_nuevo < 0 THEN
    RAISE EXCEPTION 'El ajuste dejaria el stock en negativo (actual: %, cambio: %).', v_stock_actual, p_cantidad;
  END IF;

  PERFORM set_config('app.mov_tipo', p_tipo, true);
  PERFORM set_config('app.mov_motivo', COALESCE(p_motivo, ''), true);
  PERFORM set_config('app.mov_usuario_id', COALESCE(auth.uid()::text, ''), true);

  UPDATE public.productos
  SET stock = v_stock_nuevo
  WHERE id = p_producto_id;

  RETURN jsonb_build_object(
    'producto_id', p_producto_id,
    'nombre', v_nombre,
    'stock_anterior', v_stock_actual,
    'stock_nuevo', v_stock_nuevo
  );
END;
$func$;

COMMENT ON FUNCTION public.ajustar_stock_producto(uuid, text, integer, text) IS
  'Ajusta el stock de un producto (entrada o ajuste manual) y deja registro en movimientos_inventario via trigger. Solo admin/superadmin.';

REVOKE ALL ON FUNCTION public.ajustar_stock_producto(uuid, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ajustar_stock_producto(uuid, text, integer, text) TO authenticated;

-- ── 6) registrar_venta_pos: etiqueta el tipo 'venta' antes de descontar stock ─
-- Copia exacta de registrar-venta-pos-rpc.sql + 3 líneas nuevas (set_config)
-- justo antes del UPDATE de stock, para que el trigger de la sección 3
-- registre automáticamente la salida por venta. NO se agrega ningún INSERT
-- manual a movimientos_inventario aquí — eso es justo lo que causó el bug
-- de doble-descuento la vez pasada (ver fix-doble-descuento-stock.sql).
CREATE OR REPLACE FUNCTION public.registrar_venta_pos(
  p_usuario_id uuid,
  p_caja_id uuid,
  p_metodo_pago text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $func$
DECLARE
  v_venta_id uuid;
  v_subtotal numeric(14, 2);
  v_total numeric(14, 2);
  v_descuento numeric(14, 2);
  v_fecha timestamptz;
  v_mp text;
  r record;
BEGIN
  IF auth.uid() IS NOT NULL AND p_usuario_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'usuario_id no coincide con la sesion autenticada';
  END IF;

  IF p_caja_id IS NULL THEN
    RAISE EXCEPTION 'caja_id es obligatorio';
  END IF;

  IF p_metodo_pago IS NULL OR btrim(p_metodo_pago) = '' THEN
    RAISE EXCEPTION 'metodo_pago es obligatorio';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items debe ser un array JSON con al menos una linea de venta';
  END IF;

  v_mp := lower(btrim(p_metodo_pago));

  IF NOT EXISTS (
    SELECT 1
    FROM public.caja c
    WHERE c.id = p_caja_id
      AND c.usuario_id = p_usuario_id
      AND c.cerrado_en IS NULL
  ) THEN
    RAISE EXCEPTION 'Caja invalida, cerrada o no pertenece al usuario';
  END IF;

  CREATE TEMP TABLE tmp_lineas ON COMMIT DROP AS
  SELECT
    e.ord::integer AS n,
    (e.elem->>'producto_id')::uuid AS producto_id,
    (e.elem->>'cantidad')::integer AS cantidad,
    (e.elem->>'precio')::numeric(14, 2) AS precio,
    COALESCE(
      NULLIF(e.elem->>'precio_lista', '')::numeric(14, 2),
      (e.elem->>'precio')::numeric(14, 2)
    ) AS precio_lista
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(elem, ord);

  IF EXISTS (SELECT 1 FROM tmp_lineas WHERE producto_id IS NULL) THEN
    RAISE EXCEPTION 'Cada linea debe incluir producto_id (uuid) valido';
  END IF;

  IF EXISTS (SELECT 1 FROM tmp_lineas WHERE cantidad IS NULL OR cantidad <= 0) THEN
    RAISE EXCEPTION 'Cada linea debe tener cantidad entera mayor a cero';
  END IF;

  IF EXISTS (SELECT 1 FROM tmp_lineas WHERE precio IS NULL OR precio < 0) THEN
    RAISE EXCEPTION 'Cada linea debe tener precio (numeric) mayor o igual a cero';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_lineas l
    WHERE NOT EXISTS (SELECT 1 FROM public.productos p WHERE p.id = l.producto_id)
  ) THEN
    RAISE EXCEPTION 'Uno o mas producto_id no existen en el catalogo';
  END IF;

  SELECT
    COALESCE(SUM(precio_lista * cantidad::numeric), 0)::numeric(14, 2),
    COALESCE(SUM(precio * cantidad::numeric), 0)::numeric(14, 2)
  INTO v_subtotal, v_total
  FROM tmp_lineas;

  v_descuento := GREATEST(0, v_subtotal - v_total)::numeric(14, 2);

  -- Bloqueo por producto y validación de stock (suma cantidades si el mismo SKU va en varias lineas)
  FOR r IN
    SELECT
      q.producto_id,
      q.need,
      p.stock,
      p.nombre
    FROM (
      SELECT producto_id, SUM(cantidad)::integer AS need
      FROM tmp_lineas
      GROUP BY producto_id
    ) q
    INNER JOIN public.productos p ON p.id = q.producto_id
    FOR UPDATE OF p
  LOOP
    IF r.stock < r.need THEN
      RAISE EXCEPTION 'Stock insuficiente para "%" (disponible: %, solicitado: %)',
        r.nombre, r.stock, r.need;
    END IF;
  END LOOP;

  INSERT INTO public.ventas (
    usuario_id,
    caja_id,
    subtotal,
    descuento,
    total,
    metodo_pago
  )
  VALUES (
    p_usuario_id,
    p_caja_id,
    v_subtotal,
    v_descuento,
    v_total,
    p_metodo_pago
  )
  RETURNING id, creado_en
  INTO v_venta_id, v_fecha;

  INSERT INTO public.detalle_venta (venta_id, producto_id, cantidad, precio_unitario)
  SELECT
    v_venta_id,
    l.producto_id,
    l.cantidad,
    l.precio
  FROM tmp_lineas l
  ORDER BY l.n;

  -- Kardex de inventario: etiqueta el tipo de movimiento (transaccional, vía
  -- set_config local) para que el trigger fn_log_movimiento_inventario
  -- registre automáticamente la salida por venta, ligada a esta venta_id.
  PERFORM set_config('app.mov_tipo', 'venta', true);
  PERFORM set_config('app.mov_venta_id', v_venta_id::text, true);
  PERFORM set_config('app.mov_usuario_id', p_usuario_id::text, true);

  UPDATE public.productos p
  SET stock = p.stock - agg.need
  FROM (
    SELECT producto_id, SUM(cantidad)::integer AS need
    FROM tmp_lineas
    GROUP BY producto_id
  ) agg
  WHERE p.id = agg.producto_id;

  -- Solo efectivo incrementa el cajón físico (arqueo coherente).
  IF v_mp = 'efectivo' THEN
    INSERT INTO public.movimientos_caja (caja_id, usuario_id, tipo, monto, concepto)
    VALUES (
      p_caja_id,
      p_usuario_id,
      'ingreso',
      v_total,
      (
        SELECT string_agg(pr.nombre || ' ×' || l.cantidad::text, ', ' ORDER BY l.n)
        FROM tmp_lineas l
        INNER JOIN public.productos pr ON pr.id = l.producto_id
      )
    );
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'venta_id', v_venta_id,
      'fecha', v_fecha,
      'subtotal', v_subtotal,
      'descuento', v_descuento,
      'total', v_total,
      'metodo_pago', p_metodo_pago,
      'lineas', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'producto_id', l.producto_id,
              'nombre', pr.nombre,
              'codigo_barras', pr.codigo_barras,
              'cantidad', l.cantidad,
              'precio_unitario', l.precio,
              'precio_lista', l.precio_lista,
              'importe_linea', round((l.precio * l.cantidad::numeric)::numeric, 2)
            )
            ORDER BY l.n
          )
          FROM tmp_lineas l
          INNER JOIN public.productos pr ON pr.id = l.producto_id
        ),
        '[]'::jsonb
      )
    )
  );
END;
$func$;

COMMENT ON FUNCTION public.registrar_venta_pos(uuid, uuid, text, jsonb) IS
  'Registra venta + detalle, descuenta stock con bloqueo, ingreso de caja si metodo_pago=efectivo, y etiqueta el movimiento para el Kardex de inventario. Entrada p_items: [{producto_id, cantidad, precio, precio_lista?}]. Devuelve JSON para factura.';

REVOKE ALL ON FUNCTION public.registrar_venta_pos(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_venta_pos(uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_venta_pos(uuid, uuid, text, jsonb) TO service_role;
