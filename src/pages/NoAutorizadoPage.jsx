import { Link } from "react-router-dom";
import AppShell from "../components/AppShell";

export default function NoAutorizadoPage() {
  return (
    <AppShell
      title="No autorizado"
      description="Tu usuario no tiene permisos para abrir esta seccion. Si crees que es un error, revisa tu rol en Supabase."
      actions={
        <Link className="nt-btn nt-btn-primary" to="/">
          Volver al inicio
        </Link>
      }
    >
      <section className="nt-card nt-stack">
        <h2>Que hacer</h2>
        <ul className="nt-list nt-muted">
          <li>Verifica que tu perfil en `public.usuarios` tenga el rol correcto.</li>
          <li>Si eres cajero, no podras entrar a zonas de administrador.</li>
        </ul>
      </section>
    </AppShell>
  );
}
