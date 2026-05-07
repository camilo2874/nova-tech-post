import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { CajaProvider } from "./context/CajaContext";
import AdminPage from "./pages/AdminPage";
import GestionUsuariosPage from "./pages/GestionUsuariosPage";
import MiPerfilPage from "./pages/MiPerfilPage";
import CajeroPage from "./pages/CajeroPage";
import VentasPage from "./pages/VentasPage";
import InicioPage from "./pages/InicioPage";
import InventarioPage from "./pages/InventarioPage";
import LoginPage from "./pages/LoginPage";
import NoAutorizadoPage from "./pages/NoAutorizadoPage";
import ReportesPage from "./pages/ReportesPage";

function RutaPrivada({ children }) {
  const { usuario, cargandoAuth } = useAuth();

  if (cargandoAuth) {
    return <div className="nt-loading-screen">Verificando sesion...</div>;
  }

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function RutaPorRol({ rolesPermitidos, children }) {
  const { rol, cargandoAuth } = useAuth();

  if (cargandoAuth) {
    return <div className="nt-loading-screen">Verificando permisos...</div>;
  }

  if (!rol || !rolesPermitidos.includes(rol)) {
    return <Navigate to="/no-autorizado" replace />;
  }

  return children;
}

function RutasApp() {
  const { usuario } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={usuario ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/"
        element={
          <RutaPrivada>
            <InicioPage />
          </RutaPrivada>
        }
      />
      <Route
        path="/admin"
        element={
          <RutaPrivada>
            <RutaPorRol rolesPermitidos={["superadministrador"]}>
              <AdminPage />
            </RutaPorRol>
          </RutaPrivada>
        }
      />
      <Route
        path="/admin/usuarios"
        element={
          <RutaPrivada>
            <RutaPorRol rolesPermitidos={["superadministrador"]}>
              <GestionUsuariosPage />
            </RutaPorRol>
          </RutaPrivada>
        }
      />
      <Route
        path="/mi-perfil"
        element={
          <RutaPrivada>
            <MiPerfilPage />
          </RutaPrivada>
        }
      />
      <Route
        path="/ventas"
        element={
          <RutaPrivada>
            <RutaPorRol rolesPermitidos={["superadministrador", "administrador", "cajero"]}>
              <VentasPage />
            </RutaPorRol>
          </RutaPrivada>
        }
      />
      <Route
        path="/caja"
        element={
          <RutaPrivada>
            <RutaPorRol rolesPermitidos={["superadministrador", "administrador", "cajero"]}>
              <CajeroPage />
            </RutaPorRol>
          </RutaPrivada>
        }
      />
      <Route
        path="/inventario"
        element={
          <RutaPrivada>
            <RutaPorRol rolesPermitidos={["superadministrador", "administrador", "cajero"]}>
              <InventarioPage />
            </RutaPorRol>
          </RutaPrivada>
        }
      />
      <Route
        path="/reportes"
        element={
          <RutaPrivada>
            <RutaPorRol rolesPermitidos={["superadministrador", "administrador"]}>
              <ReportesPage />
            </RutaPorRol>
          </RutaPrivada>
        }
      />
      <Route path="/no-autorizado" element={<NoAutorizadoPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <CajaProvider>
          <BrowserRouter>
            <RutasApp />
          </BrowserRouter>
        </CajaProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
