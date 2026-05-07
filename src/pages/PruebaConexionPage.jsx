import { useEffect, useState } from "react";
import { obtenerProductos } from "../services/productosServicio";
import AppShell from "../components/AppShell";

export default function PruebaConexionPage() {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function cargarProductos() {
      try {
        setCargando(true);
        const data = await obtenerProductos();
        setProductos(data ?? []);
      } catch (err) {
        setError(err.message);
      } finally {
        setCargando(false);
      }
    }

    cargarProductos();
  }, []);

  if (cargando) {
    return (
      <AppShell title="Prueba de conexion" description="Validando lectura de productos desde Supabase.">
        <div className="nt-alert">Cargando productos...</div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Prueba de conexion" description="Validando lectura de productos desde Supabase.">
        <div className="nt-alert nt-alert-error">Error: {error}</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Prueba de conexion"
      description="Esta pantalla es solo para validar que React lee bien la tabla productos."
    >
      <section className="nt-card nt-stack">
        <div className="nt-row">
          <span className="nt-pill">Productos encontrados: {productos.length}</span>
        </div>

        {productos.length === 0 ? (
          <p className="nt-muted">No hay productos para mostrar.</p>
        ) : (
          <div className="nt-table-wrap">
            <table className="nt-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Precio</th>
                  <th>Stock</th>
                  <th>Codigo</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((producto) => (
                  <tr key={producto.id}>
                    <td>{producto.nombre}</td>
                    <td>${producto.precio_venta ?? producto.precio}</td>
                    <td>{producto.stock}</td>
                    <td className="nt-mono">{producto.codigo_barras}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
