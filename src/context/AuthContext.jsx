import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabaseCliente";

const AuthContext = createContext(null);

const USUARIO_CACHE = "nova-tech-usuario";
const PERFIL_CACHE = "nova-tech-perfil";

function leerCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function escribirCache(key, data) {
  try {
    if (data != null) {
      localStorage.setItem(key, JSON.stringify(data));
    } else {
      localStorage.removeItem(key);
    }
  } catch { /* noop */ }
}

function borrarCaches() {
  escribirCache(USUARIO_CACHE, null);
  escribirCache(PERFIL_CACHE, null);
}

async function limpiarSesionLocal() {
  borrarCaches();
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("sb-"))
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* noop */ }
  }
}

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(() => leerCache(USUARIO_CACHE));
  const [perfil, setPerfil] = useState(() => {
    const cached = leerCache(PERFIL_CACHE);
    // Si el caché no tiene apellido (versión anterior), descartarlo para forzar recarga
    if (cached && cached.apellido === undefined) {
      escribirCache(PERFIL_CACHE, null);
      return null;
    }
    return cached;
  });
  // Siempre arranca en true: esperamos confirmacion real de Supabase antes de
  // renderizar rutas protegidas, evitando el flash de contenido + redireccion
  const [cargandoAuth, setCargandoAuth] = useState(true);
  const montado = useRef(true);
  const inicializado = useRef(false);

  function setUsuarioCache(user) {
    // Only store the fields the app actually uses to keep the cache minimal
    const datos = user ? { id: user.id, email: user.email } : null;
    setUsuario(datos);
    escribirCache(USUARIO_CACHE, datos);
  }

  function setPerfilCache(data) {
    setPerfil(data);
    escribirCache(PERFIL_CACHE, data);
  }

  async function cargarPerfil(userId) {
    try {
      const { data, error } = await Promise.race([
        supabase
          .from("usuarios")
          .select("id, nombre, apellido, rol, activo")
          .eq("id", userId)
          .maybeSingle(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Tiempo agotado al cargar perfil")),
            8000,
          ),
        ),
      ]);
      if (error) throw error;
      if (montado.current) setPerfilCache(data ?? null);
    } catch {
      // On transient errors keep the existing cached profile so the user
      // isn't kicked out due to a momentary network hiccup.
      if (montado.current && !leerCache(PERFIL_CACHE)) {
        setPerfilCache(null);
      }
    }
  }

  useEffect(() => {
    montado.current = true;
    inicializado.current = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!montado.current) return;

      // After the first successful verification, a token refresh only needs to
      // update the in-memory user reference — profile and role remain valid.
      if (event === "TOKEN_REFRESHED" && inicializado.current) {
        if (session?.user) setUsuarioCache(session.user);
        return;
      }

      if (event === "SIGNED_OUT") {
        borrarCaches();
        setUsuario(null);
        setPerfil(null);
        inicializado.current = true;
        if (montado.current) setCargandoAuth(false);
        return;
      }

      const user = session?.user ?? null;

      if (!user) {
        // Si era el primer evento y habia cache, Supabase puede haber disparado
        // INITIAL_SESSION antes de terminar el auto-refresh del token. Hacemos
        // un getSession() directo para confirmar antes de cerrar la sesion.
        if (!inicializado.current && leerCache(USUARIO_CACHE)) {
          try {
            const { data: { session: sesionActual } } = await supabase.auth.getSession();
            if (sesionActual?.user && montado.current) {
              setUsuarioCache(sesionActual.user);
              await cargarPerfil(sesionActual.user.id);
              inicializado.current = true;
              if (montado.current) setCargandoAuth(false);
              return;
            }
          } catch { /* noop: si falla, seguimos al clear normal */ }
        }
        // Sesion realmente terminada — limpiar y mandar al login
        borrarCaches();
        setUsuario(null);
        setPerfil(null);
        inicializado.current = true;
        if (montado.current) setCargandoAuth(false);
        return;
      }

      // Valid session confirmed
      setUsuarioCache(user);

      const perfilEnCache = leerCache(PERFIL_CACHE);

      if (!perfilEnCache) {
        // First visit or cache was cleared: block on profile load
        if (montado.current) setCargandoAuth(true);
        await cargarPerfil(user.id);
        inicializado.current = true;
        if (montado.current) setCargandoAuth(false);
      } else {
        // Cache hit: render immediately, refresh profile silently in background
        inicializado.current = true;
        if (montado.current) setCargandoAuth(false);
        cargarPerfil(user.id); // fire-and-forget
      }
    });

    return () => {
      montado.current = false;
      subscription.unsubscribe();
    };
  }, []);

  async function iniciarSesion(email, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }

  async function cerrarSesion() {
    borrarCaches();
    try {
      await supabase.auth.signOut();
    } catch {
      await limpiarSesionLocal();
      setUsuario(null);
      setPerfil(null);
      setCargandoAuth(false);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        usuario,
        perfil,
        rol: perfil?.rol ?? null,
        cargandoAuth,
        iniciarSesion,
        cerrarSesion,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return contexto;
}
