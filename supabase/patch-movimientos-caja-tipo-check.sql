-- Parche: la app guarda tipo = 'ingreso' | 'retiro'.
-- Si tu tabla tenia otro CHECK (ej. solo 'entrada'/'salida'), ejecuta esto en SQL Editor.

ALTER TABLE public.movimientos_caja DROP CONSTRAINT IF EXISTS movimientos_caja_tipo_check;

ALTER TABLE public.movimientos_caja ADD CONSTRAINT movimientos_caja_tipo_check
  CHECK (tipo IN (
    'ingreso', 'retiro',
    'entrada', 'salida',
    'ENTRADA', 'SALIDA',
    'egreso', 'EGRESO'
  ));
