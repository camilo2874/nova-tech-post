import { useCaja } from "../context/CajaContext";

/**
 * Hook de conveniencia que expone la caja abierta del usuario actual.
 * Si el usuario es el operador del turno activo, devuelve los datos de la caja.
 * Si otro usuario tiene el turno (modoVisor), devuelve cajaAbierta = null.
 *
 * Mantiene la misma interfaz que la versión anterior para no romper
 * los componentes que ya lo usan (VentasPage, etc.).
 */
export function useCajaAbierta() {
  const { turnoActivo, cargandoTurno, soyElOperador, refrescarTurno } = useCaja();

  const cajaAbierta = soyElOperador
    ? {
        id: turnoActivo.caja_id,
        usuario_id: turnoActivo.usuario_id,
        abierto_en: turnoActivo.abierto_en,
        monto_apertura: turnoActivo.monto_apertura,
      }
    : null;

  return {
    cajaAbierta,
    cargandoCaja: cargandoTurno,
    refrescarCajaAbierta: refrescarTurno,
  };
}
