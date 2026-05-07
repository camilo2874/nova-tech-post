-- NOVA TECH — RPC atómica: venta + detalle_venta + stock + movimiento de caja (efectivo)
-- Ejecutar en Supabase → SQL Editor (después de tener tablas ventas, detalle_venta, productos, caja, movimientos_caja).
--
-- Transacción: PostgREST/Supabase ejecuta cada llamada rpc() en UNA transacción. Cualquier RAISE EXCEPTION
-- o error en INSERT/UPDATE revierte todo (no queda venta a medias).
--
-- Llamada desde JS (ejemplo):
--   const { data, error } = await supabase.rpc('registrar_venta_pos', {
--     p_usuario_id: usuario.id,
--     p_caja_id: cajaAbierta.id,
--     p_metodo_pago: 'efectivo',
--     p_items: carrito.map((item) => ({
--       producto_id: item.id,
--       cantidad: item.cantidad,
--       precio: item.precio_final,
--       precio_lista: item.precio_lista ?? item.precio_venta ?? item.precio,
--     })),
--   });

-- Fecha de la venta para factura (ajusta el nombre si ya usas otro, p. ej. solo created_at)
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS creado_en timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.ventas.creado_en IS 'Momento en que se registró la venta (factura / reportes).';

-- ---------------------------------------------------------------------------
-- Función principal
-- ---------------------------------------------------------------------------
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
  -- Sesión: si hay JWT de usuario, debe coincidir con p_usuario_id (evita registrar ventas a nombre de otro).
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

  -- Líneas normalizadas (orden del carrito = orden en factura)
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
  'Registra venta + detalle, descuenta stock con bloqueo, ingreso de caja si metodo_pago=efectivo. Entrada p_items: [{producto_id, cantidad, precio, precio_lista?}]. Devuelve JSON para factura.';

REVOKE ALL ON FUNCTION public.registrar_venta_pos(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_venta_pos(uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_venta_pos(uuid, uuid, text, jsonb) TO service_role;
