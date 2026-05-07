import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { IconMoon, IconSun, IconEye, IconEyeOff } from "../components/NavIcons";

export default function LoginPage() {
  const { iniciarSesion } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function manejarSubmit(evento) {
    evento.preventDefault();
    setError("");
    setCargando(true);
    try {
      await iniciarSesion(email, password);
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesion");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="nt-login-bg">
      {/* Orbes de fondo animados */}
      <div className="nt-login-orb nt-login-orb-1" aria-hidden />
      <div className="nt-login-orb nt-login-orb-2" aria-hidden />
      <div className="nt-login-orb nt-login-orb-3" aria-hidden />

      <button
        className="nt-btn nt-btn-ghost nt-login-theme-btn"
        type="button"
        onClick={toggleTheme}
        title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
      >
        {theme === "dark" ? <IconSun /> : <IconMoon />}
      </button>

      <div className="nt-login-card">
        {/* Borde animado superior */}
        <div className="nt-login-card-glow" aria-hidden />

        <div className="nt-login-header">
          <div className="nt-login-logo-wrap">
            <div className="nt-login-logo-ring" aria-hidden />
            <img
              src="/logo.png"
              alt="Nova Tech"
              className="nt-login-logo"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>

          <div className="nt-login-brand">
            <span className="nt-brand-nova">NOVA</span>
            <span className="nt-brand-tech"> TECH</span>
          </div>
          <p className="nt-login-tagline">Punto de venta · Celulares y accesorios</p>
        </div>

        <div className="nt-login-body">
          <div className="nt-login-welcome">
            <h1 className="nt-login-title">Bienvenido</h1>
            <p className="nt-login-subtitle">Ingresa tus credenciales para acceder al sistema</p>
          </div>

          <form className="nt-login-form" onSubmit={manejarSubmit}>
            <div className="nt-login-field-wrap">
              <label className="nt-login-label" htmlFor="login-email">
                Correo electrónico
              </label>
              <input
                id="login-email"
                className="nt-field nt-login-field"
                type="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="nt-login-field-wrap">
              <label className="nt-login-label" htmlFor="login-password">
                Contraseña
              </label>
              <div className="nt-login-password-wrap">
                <input
                  id="login-password"
                  className="nt-field nt-login-field nt-login-field-password"
                  type={verPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="nt-login-eye"
                  onClick={() => setVerPassword((v) => !v)}
                  title={verPassword ? "Ocultar contraseña" : "Ver contraseña"}
                  tabIndex={-1}
                >
                  {verPassword ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>

            {error && (
              <div className="nt-alert nt-alert-error nt-login-error">
                {error}
              </div>
            )}

            <button
              className="nt-login-submit"
              type="submit"
              disabled={cargando}
            >
              {cargando ? <span className="nt-login-spinner" aria-hidden /> : null}
              {cargando ? "Ingresando..." : "Iniciar sesión"}
            </button>
          </form>
        </div>

        <div className="nt-login-footer">
          <span className="nt-login-lock-icon" aria-hidden>🔒</span>
          Acceso exclusivo para personal autorizado
        </div>
      </div>
    </div>
  );
}
