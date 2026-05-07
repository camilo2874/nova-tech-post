import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useCaja } from "../context/CajaContext";
import { IconCart, IconCash, IconChart, IconHome, IconMoon, IconShield, IconBox, IconSun, IconUser } from "./NavIcons";
import SidebarClock from "./SidebarClock";

const enlaces = [
  { to: "/", end: true, label: "Inicio", Icon: IconHome },
  { to: "/ventas", label: "Ventas", Icon: IconCart },
  { to: "/caja", label: "Caja", Icon: IconCash },
  { to: "/inventario", label: "Inventario", Icon: IconBox },
  {
    to: "/reportes",
    label: "Reportes",
    Icon: IconChart,
    soloRoles: ["superadministrador", "administrador"],
  },
  { to: "/mi-perfil", label: "Mi Perfil", Icon: IconUser },
  {
    to: "/admin",
    label: "Administracion",
    Icon: IconShield,
    soloRoles: ["superadministrador"],
  },
];

export default function AppShell({ title, description, children, actions = null, mainClassName = "" }) {
  const { usuario, perfil, rol, cerrarSesion } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { turnoActivo, soyElOperador, modoVisor, cargandoTurno } = useCaja();

  const inicial =
    (perfil?.nombre?.trim()?.charAt(0) || usuario?.email?.charAt(0) || "?").toUpperCase();

  const enlacesVisibles = enlaces.filter((item) => {
    if (!item.soloRoles) return true;
    return rol && item.soloRoles.includes(rol);
  });

  return (
    <div className="nt-app nt-app--shell">
      <aside className="nt-sidebar">
        <div className="nt-sidebar-brand">
          <div className="nt-sidebar-logo-wrap">
            <img
              src="/logo.png"
              alt="Nova Tech"
              className="nt-sidebar-logo"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>
          <div className="nt-sidebar-brand-name">
            <span className="nt-brand-nova">NOVA</span>
            <span className="nt-brand-tech"> TECH</span>
          </div>
          <div className="nt-sidebar-accent" aria-hidden />
          <div className="nt-sidebar-tagline">Punto de venta · Celulares y accesorios</div>
        </div>

        <SidebarClock />

        <nav className="nt-sidebar-nav" aria-label="Menu principal">
          {enlacesVisibles.map(({ to, end, label, Icon }) => (
            <NavLink
              key={to + (end ? "-root" : "")}
              to={to}
              end={end}
              className={({ isActive }) => `nt-sidebar-link${isActive ? " is-active" : ""}`}
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Indicador de estado de caja */}
        {!cargandoTurno && (soyElOperador || modoVisor) && (
          <div className="nt-sidebar-turno" style={{
            margin: "0 12px 8px",
            padding: "9px 12px",
            borderRadius: "10px",
            fontSize: "0.75rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: soyElOperador
              ? "rgba(16, 185, 129, 0.12)"
              : "rgba(59, 130, 246, 0.12)",
            border: soyElOperador
              ? "1px solid rgba(16, 185, 129, 0.3)"
              : "1px solid rgba(59, 130, 246, 0.3)",
            color: soyElOperador ? "#059669" : "#3b82f6",
          }}>
            <span style={{
              width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0,
              background: soyElOperador ? "#10b981" : "#3b82f6",
              boxShadow: soyElOperador
                ? "0 0 0 2px rgba(16,185,129,0.25)"
                : "0 0 0 2px rgba(59,130,246,0.25)",
            }} />
            {soyElOperador
              ? "Tu turno activo"
              : `Visor · ${turnoActivo?.operador_nombre ?? "..."}`}
          </div>
        )}

        <div className="nt-sidebar-footer">
          <div className="nt-sidebar-user">
            <div className="nt-sidebar-user-avatar" aria-hidden>
              {inicial}
            </div>
            <div className="nt-sidebar-user-text">
              <div className="nt-sidebar-user-name" title={perfil?.nombre || usuario?.email}>
                {perfil?.nombre || "Usuario"}
              </div>
              <div className="nt-sidebar-user-email" title={usuario?.email}>
                {usuario?.email}
              </div>
            </div>
          </div>

          <div className="nt-sidebar-actions">
            <button
              className="nt-btn nt-btn-ghost nt-btn-theme"
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            >
              {theme === "dark" ? <IconSun /> : <IconMoon />}
              {theme === "dark" ? "Tema claro" : "Tema oscuro"}
            </button>
            <button
              className="nt-btn nt-btn-danger"
              type="button"
              onClick={() => cerrarSesion().catch(() => { /* signOut ya limpia internamente */ })}
            >
              Cerrar sesion
            </button>
          </div>
        </div>
      </aside>

      <div className="nt-shell-main">
        <main className={["nt-main", mainClassName].filter(Boolean).join(" ")}>
          <div className="nt-page-head">
            <div>
              <h1 className="nt-page-title">{title}</h1>
              {description ? <p className="nt-page-desc">{description}</p> : null}
            </div>
            {actions ? <div className="nt-row">{actions}</div> : null}
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
