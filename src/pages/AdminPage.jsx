import { Link } from "react-router-dom";
import AppShell from "../components/AppShell";
import "../styles/usuarios.css";

const MODULOS = [
  {
    to: "/admin/usuarios",
    icon: "👥",
    titulo: "Gestión de Usuarios",
    descripcion:
      "Crea y administra cuentas de administradores y cajeros. Modifica datos, correo, contraseña y rol.",
  },
  {
    to: "/reportes",
    icon: "📊",
    titulo: "Reportes",
    descripcion:
      "Consulta el historial de ventas, cierres de caja y movimientos del negocio.",
  },
];

export default function AdminPage() {
  return (
    <AppShell
      title="Administración"
      description="Panel exclusivo para administradores del sistema."
    >
      <div className="nt-stack nt-stack-spacious">
        <div className="nt-grid-2">
          {MODULOS.map(({ to, icon, titulo, descripcion }) => (
            <Link key={to} to={to} style={{ textDecoration: "none" }}>
              <div className="nt-card adm-module-card">
                <div className="adm-module-icon">{icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ margin: "0 0 6px", fontSize: 17 }}>{titulo}</h2>
                  <p className="nt-muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                    {descripcion}
                  </p>
                </div>
                <div className="adm-module-arrow">→</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
