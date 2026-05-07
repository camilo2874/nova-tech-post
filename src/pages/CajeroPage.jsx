import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AppShell from "../components/AppShell";
import CajaTurnoPanel from "../components/CajaTurnoPanel";

export default function CajeroPage() {
  const { usuario } = useAuth();
  const [cajaTurno, setCajaTurno] = useState(null);

  return (
    <AppShell
      title="Sistema de Caja"
      description="Control y gestión de turnos y efectivo"
      actions={
        <div className="nt-row">
          <span className={`nt-pill${cajaTurno?.id ? " nt-pill-success" : ""}`}>
            {cajaTurno?.id ? "Turno activo" : "Sin turno"}
          </span>
          <Link className="nt-btn nt-btn-primary" to="/ventas">
            Ir a Ventas
          </Link>
        </div>
      }
    >
      <CajaTurnoPanel usuarioId={usuario?.id} onCajaAbiertaChange={setCajaTurno} />
    </AppShell>
  );
}
