import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/AppShell";
import { useAuth } from "../context/AuthContext";
import {
  actualizarUsuario,
  cambiarContrasena,
  crearUsuario,
  listarUsuarios,
  toggleActivoUsuario,
} from "../services/usuariosServicio";
import "../styles/usuarios.css";

const ROL_LABELS = {
  superadministrador: "Super Admin",
  administrador: "Administrador",
  cajero: "Cajero",
};

const FORM_VACIO = {
  nombre: "",
  apellido: "",
  email: "",
  password: "",
  rol: "cajero",
};

const PASS_VACIO = { nueva: "", confirmar: "" };

/* ─── Modal genérico ─────────────────────────────────────── */
function Modal({ open, onClose, titulo, children }) {
  useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="usr-overlay" onClick={onClose}>
      <div className="usr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="usr-modal-head">
          <h2 className="usr-modal-title">{titulo}</h2>
          <button className="usr-modal-close" type="button" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="usr-modal-body">{children}</div>
      </div>
    </div>
  );
}

function Avatar({ nombre, apellido }) {
  const inicial = ((nombre?.[0] || apellido?.[0] || "?")).toUpperCase();
  return <span className="usr-avatar">{inicial}</span>;
}

function RolPill({ rol }) {
  const clase = rol === "superadministrador" ? "usr-pill-superadministrador" : `usr-pill-${rol}`;
  return <span className={`usr-pill ${clase}`}>{ROL_LABELS[rol] || rol}</span>;
}

function EstadoPill({ activo }) {
  return (
    <span className={`usr-pill ${activo ? "usr-pill-activo" : "usr-pill-inactivo"}`}>
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}

/* ─── Página (solo accesible por superadministrador) ────── */
export default function GestionUsuariosPage() {
  const { usuario: usuarioActual } = useAuth();

  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorGlobal, setErrorGlobal] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  // Modal crear / editar
  const [modalForm, setModalForm] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [errorForm, setErrorForm] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [verPassCrear, setVerPassCrear] = useState(false);

  // Modal contraseña
  const [modalPass, setModalPass] = useState(false);
  const [usuarioPass, setUsuarioPass] = useState(null);
  const [passForm, setPassForm] = useState(PASS_VACIO);
  const [errorPass, setErrorPass] = useState("");
  const [guardandoPass, setGuardandoPass] = useState(false);
  const [verPassNueva, setVerPassNueva] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);

  const mostrarToast = useCallback((msg, tipo = "success") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorGlobal(null);
    try {
      const data = await listarUsuarios();
      setUsuarios(data);
    } catch (e) {
      setErrorGlobal(e.message || "Error al cargar usuarios.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const totalAdmins  = usuarios.filter((u) => u.rol === "administrador").length;
  const totalCajeros = usuarios.filter((u) => u.rol === "cajero").length;
  const totalActivos = usuarios.filter((u) => u.activo).length;

  const usuariosFiltrados = usuarios.filter((u) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return (
      (u.nombre   || "").toLowerCase().includes(q) ||
      (u.apellido || "").toLowerCase().includes(q) ||
      (u.email    || "").toLowerCase().includes(q) ||
      (u.rol      || "").toLowerCase().includes(q)
    );
  });

  // ── Modales ────────────────────────────────────────────────

  function abrirCrear() {
    setModoEdicion(false);
    setUsuarioEditando(null);
    setForm(FORM_VACIO);
    setErrorForm("");
    setVerPassCrear(false);
    setModalForm(true);
  }

  function abrirEditar(u) {
    setModoEdicion(true);
    setUsuarioEditando(u);
    setForm({
      nombre: u.nombre || "",
      apellido: u.apellido || "",
      email: u.email || "",
      password: "",
      rol: u.rol || "cajero",
    });
    setErrorForm("");
    setVerPassCrear(false);
    setModalForm(true);
  }

  function abrirCambiarPass(u) {
    setUsuarioPass(u);
    setPassForm(PASS_VACIO);
    setErrorPass("");
    setVerPassNueva(false);
    setModalPass(true);
  }

  function cerrarForm() { setModalForm(false); }
  function cerrarPass() { setModalPass(false); }

  // ── Handlers ───────────────────────────────────────────────

  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function guardarUsuario(e) {
    e.preventDefault();
    const { nombre, apellido, email, password, rol } = form;

    if (!nombre.trim())  return setErrorForm("El nombre es obligatorio.");
    if (!apellido.trim()) return setErrorForm("El apellido es obligatorio.");
    if (!email.trim())   return setErrorForm("El correo es obligatorio.");
    if (!modoEdicion && !password.trim()) return setErrorForm("La contrasena es obligatoria.");
    if (!modoEdicion && password.length < 6)
      return setErrorForm("La contrasena debe tener al menos 6 caracteres.");

    setGuardando(true);
    setErrorForm("");
    try {
      if (modoEdicion) {
        // Proteger: si edita su propio usuario, conservar el rol actual
        const rolFinal =
          usuarioEditando.id === usuarioActual?.id ? usuarioEditando.rol : rol;
        await actualizarUsuario(usuarioEditando.id, {
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          email: email.trim(),
          rol: rolFinal,
        });
        mostrarToast("Usuario actualizado correctamente.");
      } else {
        await crearUsuario({
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          email: email.trim(),
          password,
          rol,
        });
        mostrarToast("Usuario creado correctamente.");
      }
      cerrarForm();
      await cargar();
    } catch (err) {
      setErrorForm(err.message || "Error al guardar el usuario.");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarContrasena(e) {
    e.preventDefault();
    const { nueva, confirmar } = passForm;

    if (!nueva.trim())    return setErrorPass("Ingresa la nueva contrasena.");
    if (nueva.length < 6) return setErrorPass("Minimo 6 caracteres.");
    if (nueva !== confirmar) return setErrorPass("Las contrasenas no coinciden.");

    setGuardandoPass(true);
    setErrorPass("");
    try {
      await cambiarContrasena(usuarioPass.id, nueva);
      mostrarToast("Contrasena actualizada correctamente.");
      cerrarPass();
    } catch (err) {
      setErrorPass(err.message || "Error al cambiar la contrasena.");
    } finally {
      setGuardandoPass(false);
    }
  }

  async function handleToggleActivo(u) {
    if (u.id === usuarioActual?.id) {
      return mostrarToast("No puedes desactivar tu propia cuenta.", "error");
    }
    try {
      await toggleActivoUsuario(u.id, !u.activo);
      mostrarToast(u.activo ? "Usuario desactivado." : "Usuario activado.");
      await cargar();
    } catch (err) {
      mostrarToast(err.message || "Error al cambiar estado.", "error");
    }
  }

  // ── Render ─────────────────────────────────────────────────

  const esErrorConfig = errorGlobal?.includes("VITE_SUPABASE_SERVICE_KEY");

  return (
    <AppShell
      title="Gestion de Usuarios"
      description="Crea y administra todas las cuentas del sistema."
      actions={
        <button
          className="nt-btn nt-btn-primary"
          type="button"
          onClick={abrirCrear}
          disabled={!!esErrorConfig}
        >
          + Nuevo usuario
        </button>
      }
    >
      <div className="usr-page">

        {/* ── Estadísticas ─────────────────────────────── */}
        <div className="usr-stats-grid">
          {[
            { icon: "👥", label: "Total usuarios",  value: usuarios.length, variant: "blue"   },
            { icon: "🛡️", label: "Administradores", value: totalAdmins,     variant: "purple" },
            { icon: "🏪", label: "Cajeros",          value: totalCajeros,    variant: "teal"   },
            { icon: "✅", label: "Activos",          value: totalActivos,    variant: "green"  },
          ].map(({ icon, label, value, variant }) => (
            <div key={label} className={`usr-stat-card usr-stat-${variant}`}>
              <div className="usr-stat-icon">{icon}</div>
              <div>
                <div className="usr-stat-label">{label}</div>
                <div className="usr-stat-value">{value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Alerta: service key no configurada ──────── */}
        {esErrorConfig && (
          <div className="nt-card usr-config-card">
            <h2>Configuracion requerida</h2>
            <p>Agrega la <strong>Service Role Key</strong> al archivo <code>.env</code>:</p>
            <div className="usr-code-block">
              <code>VITE_SUPABASE_SERVICE_KEY=tu_service_role_key</code>
            </div>
            <p className="nt-muted">Supabase Dashboard → Settings → API → service_role</p>
          </div>
        )}

        {/* ── Error general ────────────────────────────── */}
        {errorGlobal && !esErrorConfig && (
          <div className="nt-alert nt-alert-error">{errorGlobal}</div>
        )}

        {/* ── Tabla ────────────────────────────────────── */}
        <div className="nt-card nt-stack">
          <div className="nt-row nt-justify-between" style={{ flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ margin: 0 }}>Todos los usuarios</h2>
            <input
              className="nt-field usr-search"
              type="search"
              placeholder="Buscar por nombre, correo o rol..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          {cargando ? (
            <p className="nt-muted">Cargando usuarios...</p>
          ) : !errorGlobal && usuariosFiltrados.length === 0 ? (
            <p className="nt-muted">
              {busqueda ? "Ningun usuario coincide." : "No hay usuarios registrados."}
            </p>
          ) : !errorGlobal ? (
            <div className="nt-table-wrap">
              <table className="nt-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Correo</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuariosFiltrados.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="usr-user-cell">
                          <Avatar nombre={u.nombre} apellido={u.apellido} />
                          <div>
                            <div className="usr-user-name">
                              {u.nombre} {u.apellido}
                            </div>
                            {u.id === usuarioActual?.id && (
                              <span className="usr-you-badge">Tu</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="usr-email">{u.email}</td>
                      <td><RolPill rol={u.rol} /></td>
                      <td><EstadoPill activo={u.activo} /></td>
                      <td>
                        <div className="nt-row usr-actions">
                          <button
                            className="nt-btn nt-btn-compact"
                            type="button"
                            onClick={() => abrirEditar(u)}
                          >
                            Editar
                          </button>
                          <button
                            className="nt-btn nt-btn-compact"
                            type="button"
                            onClick={() => abrirCambiarPass(u)}
                          >
                            Contrasena
                          </button>
                          <button
                            className={`nt-btn nt-btn-compact${u.activo ? " nt-btn-danger" : ""}`}
                            type="button"
                            onClick={() => handleToggleActivo(u)}
                            disabled={u.id === usuarioActual?.id}
                            title={
                              u.id === usuarioActual?.id
                                ? "No puedes desactivar tu propia cuenta"
                                : u.activo ? "Desactivar acceso" : "Activar acceso"
                            }
                          >
                            {u.activo ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div>
          <Link to="/admin" className="nt-link">Volver a Administracion</Link>
        </div>
      </div>

      {/* ════ Modal crear / editar ════ */}
      <Modal
        open={modalForm}
        onClose={cerrarForm}
        titulo={modoEdicion ? "Editar usuario" : "Nuevo usuario"}
      >
        <form className="usr-form" onSubmit={guardarUsuario} noValidate>
          <div className="usr-form-grid">
            <div className="nt-stack">
              <label className="nt-label" htmlFor="u-nombre">Nombre *</label>
              <input
                id="u-nombre"
                className="nt-field"
                name="nombre"
                value={form.nombre}
                onChange={handleFormChange}
                placeholder="Ej: Carlos"
                autoComplete="given-name"
              />
            </div>
            <div className="nt-stack">
              <label className="nt-label" htmlFor="u-apellido">Apellido *</label>
              <input
                id="u-apellido"
                className="nt-field"
                name="apellido"
                value={form.apellido}
                onChange={handleFormChange}
                placeholder="Ej: Ramirez"
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className="nt-stack">
            <label className="nt-label" htmlFor="u-email">Correo electronico *</label>
            <input
              id="u-email"
              className="nt-field"
              name="email"
              type="email"
              value={form.email}
              onChange={handleFormChange}
              placeholder="correo@empresa.com"
              autoComplete="email"
            />
          </div>

          {!modoEdicion && (
            <div className="nt-stack">
              <label className="nt-label" htmlFor="u-password">Contrasena *</label>
              <div className="usr-pass-wrap">
                <input
                  id="u-password"
                  className="nt-field usr-pass-field"
                  name="password"
                  type={verPassCrear ? "text" : "password"}
                  value={form.password}
                  onChange={handleFormChange}
                  placeholder="Minimo 6 caracteres"
                  autoComplete="new-password"
                />
                <button
                  className="usr-eye-btn"
                  type="button"
                  onClick={() => setVerPassCrear((v) => !v)}
                >
                  {verPassCrear ? "🙈" : "👁️"}
                </button>
              </div>
            </div>
          )}

          <div className="nt-stack">
            <label className="nt-label" htmlFor="u-rol">Rol *</label>
            {/* Si edita su propio usuario, bloquear el rol */}
            {modoEdicion && usuarioEditando?.id === usuarioActual?.id ? (
              <div>
                <div
                  className="nt-field"
                  style={{ color: "var(--nt-muted)", cursor: "not-allowed", opacity: 0.7 }}
                >
                  {ROL_LABELS[form.rol] || form.rol}
                </div>
                <p className="nt-muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
                  No puedes cambiar tu propio rol.
                </p>
              </div>
            ) : (
              <select
                id="u-rol"
                className="nt-field"
                name="rol"
                value={form.rol}
                onChange={handleFormChange}
              >
                <option value="cajero">Cajero</option>
                <option value="administrador">Administrador</option>
              </select>
            )}
          </div>

          {errorForm && (
            <p className="nt-alert nt-alert-error usr-form-error">{errorForm}</p>
          )}

          <div className="nt-row usr-form-actions">
            <button className="nt-btn" type="button" onClick={cerrarForm}>
              Cancelar
            </button>
            <button className="nt-btn nt-btn-primary" type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Crear usuario"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ════ Modal contraseña ════ */}
      <Modal open={modalPass} onClose={cerrarPass} titulo="Cambiar contrasena">
        {usuarioPass && (
          <div
            className="nt-stack"
            style={{ gap: 6, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--nt-border)" }}
          >
            <p className="nt-muted" style={{ margin: 0, fontSize: 13 }}>
              Cambiando contrasena de:
            </p>
            <div className="usr-user-cell">
              <Avatar nombre={usuarioPass.nombre} apellido={usuarioPass.apellido} />
              <div>
                <div className="usr-user-name">
                  {usuarioPass.nombre} {usuarioPass.apellido}
                </div>
                <div style={{ fontSize: 13, color: "var(--nt-muted)" }}>
                  {usuarioPass.email}
                </div>
              </div>
            </div>
          </div>
        )}

        <form className="usr-form" onSubmit={guardarContrasena} noValidate>
          <div className="nt-stack">
            <label className="nt-label" htmlFor="mp-nueva">Nueva contrasena *</label>
            <div className="usr-pass-wrap">
              <input
                id="mp-nueva"
                className="nt-field usr-pass-field"
                type={verPassNueva ? "text" : "password"}
                value={passForm.nueva}
                onChange={(e) => setPassForm((p) => ({ ...p, nueva: e.target.value }))}
                placeholder="Minimo 6 caracteres"
                autoComplete="new-password"
              />
              <button
                className="usr-eye-btn"
                type="button"
                onClick={() => setVerPassNueva((v) => !v)}
              >
                {verPassNueva ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <div className="nt-stack">
            <label className="nt-label" htmlFor="mp-confirmar">Confirmar contrasena *</label>
            <input
              id="mp-confirmar"
              className="nt-field"
              type="password"
              value={passForm.confirmar}
              onChange={(e) => setPassForm((p) => ({ ...p, confirmar: e.target.value }))}
              placeholder="Repite la contrasena"
              autoComplete="new-password"
            />
          </div>

          {errorPass && (
            <p className="nt-alert nt-alert-error usr-form-error">{errorPass}</p>
          )}

          <div className="nt-row usr-form-actions">
            <button className="nt-btn" type="button" onClick={cerrarPass}>
              Cancelar
            </button>
            <button className="nt-btn nt-btn-primary" type="submit" disabled={guardandoPass}>
              {guardandoPass ? "Actualizando..." : "Actualizar contrasena"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Toast ─────────────────────────────────────── */}
      {toast && (
        <div className={`usr-toast usr-toast-${toast.tipo}`} role="status">
          {toast.msg}
        </div>
      )}
    </AppShell>
  );
}
