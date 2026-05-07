import { useEffect, useRef, useState } from "react";
import AppShell from "../components/AppShell";
import { useAuth } from "../context/AuthContext";
import { actualizarPerfilPropio, cambiarContrasenaPropia } from "../services/usuariosServicio";
import "../styles/usuarios.css";

const ROL_LABEL = {
  superadministrador: "Super Administrador",
  administrador: "Administrador",
  cajero: "Cajero",
};

const ROL_CLASE = {
  superadministrador: "usr-pill-superadministrador",
  administrador: "usr-pill-administrador",
  cajero: "usr-pill-cajero",
};

function calcFuerza(pass) {
  if (!pass) return 0;
  let s = 0;
  if (pass.length >= 6)  s++;
  if (pass.length >= 10) s++;
  if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) s++;
  if (/[0-9]/.test(pass) && /[^A-Za-z0-9]/.test(pass)) s++;
  return s;
}

const FUERZA_LABEL = ["", "Débil", "Regular", "Buena", "Fuerte"];

export default function MiPerfilPage() {
  const { usuario, perfil, rol } = useAuth();
  const mainRef = useRef(null);

  const [nombre,   setNombre]   = useState("");
  const [apellido, setApellido] = useState("");
  const [guardandoPerfil,  setGuardandoPerfil]  = useState(false);
  const [errorPerfil,      setErrorPerfil]      = useState("");
  const [okPerfil,         setOkPerfil]         = useState(false);

  const [passNueva,     setPassNueva]     = useState("");
  const [passConfirmar, setPassConfirmar] = useState("");
  const [verNueva,      setVerNueva]      = useState(false);
  const [guardandoPass, setGuardandoPass] = useState(false);
  const [errorPass,     setErrorPass]     = useState("");
  const [okPass,        setOkPass]        = useState(false);

  useEffect(() => {
    if (perfil) {
      setNombre(perfil.nombre   || "");
      setApellido(perfil.apellido || "");
    }
  }, [perfil]);

  // Ocultar el nt-page-head que genera AppShell (solo en esta página)
  useEffect(() => {
    const el = mainRef.current?.closest(".nt-main")?.querySelector(".nt-page-head");
    if (el) el.style.display = "none";
    return () => { if (el) el.style.display = ""; };
  }, []);

  async function handleGuardarPerfil(e) {
    e.preventDefault();
    if (!nombre.trim())   return setErrorPerfil("El nombre es obligatorio.");
    if (!apellido.trim()) return setErrorPerfil("El apellido es obligatorio.");

    setGuardandoPerfil(true);
    setErrorPerfil("");
    setOkPerfil(false);
    try {
      await actualizarPerfilPropio(usuario.id, { nombre: nombre.trim(), apellido: apellido.trim() });
      setOkPerfil(true);
      setTimeout(() => setOkPerfil(false), 3000);
    } catch (err) {
      setErrorPerfil(err.message || "Error al actualizar el perfil.");
    } finally {
      setGuardandoPerfil(false);
    }
  }

  async function handleCambiarPass(e) {
    e.preventDefault();
    if (!passNueva.trim())           return setErrorPass("Ingresa la nueva contraseña.");
    if (passNueva.length < 6)        return setErrorPass("Mínimo 6 caracteres.");
    if (passNueva !== passConfirmar)  return setErrorPass("Las contraseñas no coinciden.");

    setGuardandoPass(true);
    setErrorPass("");
    setOkPass(false);
    try {
      await cambiarContrasenaPropia(passNueva);
      setPassNueva("");
      setPassConfirmar("");
      setOkPass(true);
      setTimeout(() => setOkPass(false), 3500);
    } catch (err) {
      setErrorPass(err.message || "Error al cambiar la contraseña.");
    } finally {
      setGuardandoPass(false);
    }
  }

  const avatarLetra = (nombre?.[0] || apellido?.[0] || "?").toUpperCase();
  const fuerza      = calcFuerza(passNueva);

  return (
    <AppShell title=" ">
      <div ref={mainRef} className="prf-page">

        {/* ══════════════════════════════════════════════════
            BANNER HERO — ocupa todo el ancho
        ══════════════════════════════════════════════════ */}
        <div className="prf-banner">
          {/* Orbes de fondo */}
          <div className="prf-banner-orb prf-banner-orb-1" />
          <div className="prf-banner-orb prf-banner-orb-2" />
          <div className="prf-banner-orb prf-banner-orb-3" />

          {/* Avatar */}
          <div className="prf-avatar-wrap">
            <div className="prf-avatar-ring" />
            <div className="prf-avatar-letter">{avatarLetra}</div>
          </div>

          {/* Info */}
          <div className="prf-banner-info">
            <h1 className="prf-banner-name">
              {nombre || "—"}{apellido ? ` ${apellido}` : ""}
            </h1>
            <p className="prf-banner-email">{usuario?.email}</p>
            <div className="prf-banner-meta">
              <span className={`usr-pill ${ROL_CLASE[rol] || "usr-pill-cajero"}`}>
                {ROL_LABEL[rol] || rol}
              </span>
              <span className="prf-status-dot">En línea</span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════
            CONTENIDO CENTRADO — formularios
        ══════════════════════════════════════════════════ */}
        <div className="prf-content">

          {/* ── Datos personales ─────────────────────────── */}
          <div className="prf-section">
            <div className="prf-section-head">
              <div className="prf-section-icon prf-section-icon-blue">👤</div>
              <div className="prf-section-head-text">
                <h3>Datos personales</h3>
                <p>Tu nombre visible en el sistema</p>
              </div>
            </div>

            <form className="prf-section-body" onSubmit={handleGuardarPerfil} noValidate>
              <div className="prf-grid-2">
                <div className="prf-field-wrap">
                  <label className="prf-field-label" htmlFor="prf-nombre">Nombre</label>
                  <div className="prf-input-box">
                    <span className="prf-input-icon">✏️</span>
                    <input
                      id="prf-nombre"
                      className="prf-input"
                      value={nombre}
                      onChange={(e) => { setNombre(e.target.value); setErrorPerfil(""); }}
                      placeholder="Tu nombre"
                      autoComplete="given-name"
                    />
                  </div>
                </div>

                <div className="prf-field-wrap">
                  <label className="prf-field-label" htmlFor="prf-apellido">Apellido</label>
                  <div className="prf-input-box">
                    <span className="prf-input-icon">✏️</span>
                    <input
                      id="prf-apellido"
                      className="prf-input"
                      value={apellido}
                      onChange={(e) => { setApellido(e.target.value); setErrorPerfil(""); }}
                      placeholder="Tu apellido"
                      autoComplete="family-name"
                    />
                  </div>
                </div>
              </div>

              <div className="prf-field-wrap">
                <label className="prf-field-label">Correo electrónico</label>
                <div className="prf-input-box">
                  <span className="prf-input-icon">📧</span>
                  <input
                    className="prf-input"
                    value={usuario?.email || ""}
                    disabled
                    title="Solo el superadministrador puede cambiar el correo"
                  />
                </div>
                <p className="prf-hint">🔒 Para cambiar el correo contacta al superadministrador.</p>
              </div>

              {errorPerfil && <div className="prf-alert prf-alert-error">⚠️ {errorPerfil}</div>}
              {okPerfil    && <div className="prf-alert prf-alert-success">✅ Datos actualizados correctamente.</div>}

              <button className="prf-save-btn" type="submit" disabled={guardandoPerfil}>
                {guardandoPerfil
                  ? <><span className="prf-spinner" /> Guardando...</>
                  : "💾 Guardar cambios"}
              </button>
            </form>
          </div>

          {/* ── Seguridad ─────────────────────────────────── */}
          <div className="prf-section">
            <div className="prf-section-head">
              <div className="prf-section-icon prf-section-icon-purple">🔐</div>
              <div className="prf-section-head-text">
                <h3>Seguridad</h3>
                <p>Actualiza tu contraseña de acceso</p>
              </div>
            </div>

            <form className="prf-section-body" onSubmit={handleCambiarPass} noValidate>
              <div className="prf-field-wrap">
                <label className="prf-field-label" htmlFor="prf-pass-nueva">Nueva contraseña</label>
                <div className="prf-input-box">
                  <span className="prf-input-icon">🔑</span>
                  <input
                    id="prf-pass-nueva"
                    className="prf-input prf-input-pass"
                    type={verNueva ? "text" : "password"}
                    value={passNueva}
                    onChange={(e) => { setPassNueva(e.target.value); setErrorPass(""); }}
                    placeholder="Mínimo 6 caracteres"
                    autoComplete="new-password"
                  />
                  <button
                    className="prf-eye-btn"
                    type="button"
                    onClick={() => setVerNueva((v) => !v)}
                    title={verNueva ? "Ocultar" : "Mostrar"}
                  >
                    {verNueva ? "🙈" : "👁️"}
                  </button>
                </div>

                {passNueva && (
                  <div className="prf-strength">
                    <div className="prf-strength-bars">
                      {[1, 2, 3, 4].map((n) => (
                        <div
                          key={n}
                          className={`prf-strength-bar${fuerza >= n ? ` active-${fuerza}` : ""}`}
                        />
                      ))}
                    </div>
                    <span className="prf-strength-label">Fuerza: {FUERZA_LABEL[fuerza]}</span>
                  </div>
                )}
              </div>

              <div className="prf-field-wrap">
                <label className="prf-field-label" htmlFor="prf-pass-confirmar">Confirmar contraseña</label>
                <div className="prf-input-box">
                  <span className="prf-input-icon">🔑</span>
                  <input
                    id="prf-pass-confirmar"
                    className="prf-input"
                    type="password"
                    value={passConfirmar}
                    onChange={(e) => { setPassConfirmar(e.target.value); setErrorPass(""); }}
                    placeholder="Repite la contraseña"
                    autoComplete="new-password"
                  />
                </div>
                {passConfirmar && (
                  <p className="prf-hint">
                    {passNueva === passConfirmar
                      ? "✅ Las contraseñas coinciden"
                      : "❌ No coinciden"}
                  </p>
                )}
              </div>

              {errorPass && <div className="prf-alert prf-alert-error">⚠️ {errorPass}</div>}
              {okPass    && <div className="prf-alert prf-alert-success">✅ Contraseña actualizada correctamente.</div>}

              <button className="prf-save-btn" type="submit" disabled={guardandoPass}>
                {guardandoPass
                  ? <><span className="prf-spinner" /> Actualizando...</>
                  : "🔒 Actualizar contraseña"}
              </button>
            </form>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
