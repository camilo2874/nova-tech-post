import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabaseCliente";
import { obtenerTurnoActivo } from "../services/cajaServicio";
import { useAuth } from "./AuthContext";

/**
 * CajaContext — estado global del turno de caja.
 *
 * Expone:
 *   turnoActivo   — { caja_id, usuario_id, abierto_en, monto_apertura, operador_nombre, operador_rol } | null
 *   cargandoTurno — boolean
 *   soyElOperador — true si el usuario actual es quien tiene el turno abierto
 *   modoVisor     — true si hay turno activo pero es de otro usuario (solo lectura)
 *   refrescarTurno— función para forzar una actualización manual
 *
 * Se actualiza automáticamente via Supabase Realtime cuando la tabla `caja` cambia.
 */

const CajaContext = createContext(null);

export function CajaProvider({ children }) {
  const { usuario } = useAuth();
  const [turnoActivo, setTurnoActivo] = useState(null);
  const [cargandoTurno, setCargandoTurno] = useState(true);
  const canalRef = useRef(null);

  const refrescarTurno = useCallback(async () => {
    try {
      const data = await obtenerTurnoActivo();
      setTurnoActivo(data ?? null);
    } catch {
      setTurnoActivo(null);
    } finally {
      setCargandoTurno(false);
    }
  }, []);

  useEffect(() => {
    if (!usuario) {
      setTurnoActivo(null);
      setCargandoTurno(false);
      if (canalRef.current) {
        supabase.removeChannel(canalRef.current);
        canalRef.current = null;
      }
      return;
    }

    setCargandoTurno(true);
    refrescarTurno();

    // Suscripción Realtime: refresca cuando INSERT o UPDATE en tabla caja
    const canal = supabase
      .channel("caja-turno-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "caja" },
        () => { refrescarTurno(); }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "caja" },
        () => { refrescarTurno(); }
      )
      .subscribe();

    canalRef.current = canal;

    return () => {
      supabase.removeChannel(canal);
      canalRef.current = null;
    };
  }, [usuario, refrescarTurno]);

  const soyElOperador = Boolean(
    turnoActivo && usuario && turnoActivo.usuario_id === usuario.id
  );
  const modoVisor = Boolean(turnoActivo && !soyElOperador);

  return (
    <CajaContext.Provider
      value={{ turnoActivo, cargandoTurno, refrescarTurno, soyElOperador, modoVisor }}
    >
      {children}
    </CajaContext.Provider>
  );
}

export function useCaja() {
  const ctx = useContext(CajaContext);
  if (!ctx) throw new Error("useCaja debe usarse dentro de CajaProvider");
  return ctx;
}
