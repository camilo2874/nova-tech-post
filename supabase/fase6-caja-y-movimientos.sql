-- NOVA TECH — Fase 6: turno de caja, movimientos y enlace a ventas
-- Ejecutar en Supabase → SQL Editor.
--
-- Si tu tabla public.caja ya existia con otro esquema (ej. solo creado_en),
-- este script la completa sin borrar datos.

-- 1) Tabla nueva solo si no existe
CREATE TABLE IF NOT EXISTS public.caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE CASCADE,
  abierto_en timestamptz NOT NULL DEFAULT now(),
  cerrado_en timestamptz,
  monto_apertura numeric(14, 2) NOT NULL DEFAULT 0,
  monto_cierre_efectivo numeric(14, 2),
  notas_cierre text
);

-- 2) Completar columnas en caja ya existente (ADD COLUMN IF NOT EXISTS es seguro)
ALTER TABLE public.caja ADD COLUMN IF NOT EXISTS cerrado_en timestamptz;
ALTER TABLE public.caja ADD COLUMN IF NOT EXISTS abierto_en timestamptz;
ALTER TABLE public.caja ADD COLUMN IF NOT EXISTS monto_apertura numeric(14, 2);
ALTER TABLE public.caja ADD COLUMN IF NOT EXISTS monto_cierre_efectivo numeric(14, 2);
ALTER TABLE public.caja ADD COLUMN IF NOT EXISTS notas_cierre text;

-- 3) Rellenar desde creado_en si venias de un esquema viejo
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'caja' AND column_name = 'creado_en'
  ) THEN
    UPDATE public.caja
    SET abierto_en = creado_en
    WHERE abierto_en IS NULL AND creado_en IS NOT NULL;
  END IF;
END $$;

UPDATE public.caja SET abierto_en = COALESCE(abierto_en, now()) WHERE abierto_en IS NULL;
UPDATE public.caja SET monto_apertura = 0 WHERE monto_apertura IS NULL;

ALTER TABLE public.caja ALTER COLUMN abierto_en SET DEFAULT now();
ALTER TABLE public.caja ALTER COLUMN monto_apertura SET DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE public.caja ALTER COLUMN abierto_en SET NOT NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'abierto_en NOT NULL: %', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER TABLE public.caja ALTER COLUMN monto_apertura SET NOT NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'monto_apertura NOT NULL: %', SQLERRM;
END $$;

-- 4) Regla de fechas (opcional; ignora error si ya existe o hay conflicto)
DO $$
BEGIN
  ALTER TABLE public.caja ADD CONSTRAINT caja_fechas_ok CHECK (cerrado_en IS NULL OR cerrado_en >= abierto_en);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 5) Un solo turno abierto por cajero (requiere cerrado_en)
DROP INDEX IF EXISTS idx_caja_una_abierta_por_usuario;
CREATE UNIQUE INDEX idx_caja_una_abierta_por_usuario
  ON public.caja (usuario_id)
  WHERE cerrado_en IS NULL;

DROP INDEX IF EXISTS idx_caja_usuario_abierto;
CREATE INDEX idx_caja_usuario_abierto ON public.caja (usuario_id, abierto_en DESC);

-- Movimientos de efectivo durante el turno
CREATE TABLE IF NOT EXISTS public.movimientos_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caja_id uuid NOT NULL REFERENCES public.caja (id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ingreso', 'retiro')),
  monto numeric(14, 2) NOT NULL CHECK (monto > 0),
  concepto text NOT NULL DEFAULT '',
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_caja ON public.movimientos_caja (caja_id, creado_en DESC);

-- Enlace ventas → caja
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS caja_id uuid REFERENCES public.caja (id);

CREATE INDEX IF NOT EXISTS idx_ventas_caja ON public.ventas (caja_id);

-- RLS
ALTER TABLE public.caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_caja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS caja_select_mio_o_admin ON public.caja;
CREATE POLICY caja_select_mio_o_admin ON public.caja
  FOR SELECT
  USING (
    usuario_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.rol = 'administrador' AND COALESCE(u.activo, true)
    )
  );

DROP POLICY IF EXISTS caja_insert_propio ON public.caja;
CREATE POLICY caja_insert_propio ON public.caja
  FOR INSERT
  WITH CHECK (usuario_id = auth.uid());

DROP POLICY IF EXISTS caja_update_cerrar_propio ON public.caja;
CREATE POLICY caja_update_cerrar_propio ON public.caja
  FOR UPDATE
  USING (usuario_id = auth.uid() AND cerrado_en IS NULL)
  WITH CHECK (usuario_id = auth.uid());

DROP POLICY IF EXISTS mov_select_turno ON public.movimientos_caja;
CREATE POLICY mov_select_turno ON public.movimientos_caja
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.caja c
      WHERE c.id = movimientos_caja.caja_id
        AND (
          c.usuario_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.usuarios u
            WHERE u.id = auth.uid() AND u.rol = 'administrador' AND COALESCE(u.activo, true)
          )
        )
    )
  );

DROP POLICY IF EXISTS mov_insert_turno_abierto ON public.movimientos_caja;
CREATE POLICY mov_insert_turno_abierto ON public.movimientos_caja
  FOR INSERT
  WITH CHECK (
    usuario_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.caja c
      WHERE c.id = caja_id AND c.usuario_id = auth.uid() AND c.cerrado_en IS NULL
    )
  );

-- La app usa tipo 'ingreso' y 'retiro'. Si la tabla ya existia con otros valores (entrada/salida, etc.),
-- sustituye el CHECK para que coincidan con el front y con datos viejos.
ALTER TABLE public.movimientos_caja DROP CONSTRAINT IF EXISTS movimientos_caja_tipo_check;
ALTER TABLE public.movimientos_caja ADD CONSTRAINT movimientos_caja_tipo_check
  CHECK (tipo IN (
    'ingreso', 'retiro',
    'entrada', 'salida',
    'ENTRADA', 'SALIDA',
    'egreso', 'EGRESO'
  ));
