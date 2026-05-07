import { TIENDA_FACTURA_DEFAULT } from "../config/tiendaFactura";
import { asciiImpresion, fechaHoraTicket } from "../utils/textoImpresionTermica";
import "./Factura.css";

function formatearMoneda(valor) {
  const n = Number(valor);
  if (Number.isNaN(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function etiquetaMetodoPago(valor) {
  if (valor == null || valor === "") return "-";
  const s = String(valor).trim();
  if (!s) return "-";
  const t = s.charAt(0).toUpperCase() + s.slice(1);
  return asciiImpresion(t);
}

function textoVisible(valor) {
  if (valor == null) return false;
  return String(valor).trim() !== "";
}

function lineasMensaje(mensaje) {
  if (!textoVisible(mensaje)) return [];
  return String(mensaje)
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => asciiImpresion(s));
}

/**
 * Vista tipo ticket de la factura devuelta por la RPC `registrar_venta_pos`.
 * No renderiza nada si `factura` es null o undefined.
 *
 * @param {{
 *   factura: object | null,
 *   className?: string,
 *   vendedor?: { nombre?: string | null } | null,
 *   tienda?: Partial<typeof TIENDA_FACTURA_DEFAULT> | null,
 * }} props
 */
export default function Factura({ factura, className = "", vendedor = null, tienda = null }) {
  if (factura == null) return null;

  const lineas = Array.isArray(factura.lineas) ? factura.lineas : [];
  const t = { ...TIENDA_FACTURA_DEFAULT, ...(tienda && typeof tienda === "object" ? tienda : {}) };

  const nombreVendedor = asciiImpresion(String(vendedor?.nombre ?? "").trim());
  const etiquetaVendedor = nombreVendedor || "-";

  const wrapClass = ["nt-factura-wrap", "nt-factura-print-area", className].filter(Boolean).join(" ");
  const pieLineas = lineasMensaje(t.mensajePie);

  return (
    <div className={wrapClass}>
      <article className="nt-factura-ticket" aria-label="Factura de venta">
        <h3 className="nt-factura-marca">NOVA TECH</h3>

        {(textoVisible(t.direccion) || textoVisible(t.telefono)) && (
          <div className="nt-factura-tienda">
            {textoVisible(t.direccion) ? <p>{asciiImpresion(t.direccion)}</p> : null}
            {textoVisible(t.telefono) ? <p>Cel. {asciiImpresion(t.telefono)}</p> : null}
          </div>
        )}

        <div className="nt-factura-sep" aria-hidden="true">
          ---------------------
        </div>

        <dl className="nt-factura-meta">
          <dt>Fecha</dt>
          <dd>{fechaHoraTicket(factura.fecha)}</dd>
          <dt>ID venta</dt>
          <dd className="nt-factura-id">{asciiImpresion(factura.venta_id ?? "-")}</dd>
          <dt>Metodo de pago</dt>
          <dd>{etiquetaMetodoPago(factura.metodo_pago)}</dd>
          <dt>Vendedor</dt>
          <dd>{etiquetaVendedor}</dd>
        </dl>

        <div className="nt-factura-sep" aria-hidden="true">
          ---------------------
        </div>

        <ul className="nt-factura-lineas">
          {lineas.length === 0 ? (
            <li className="nt-factura-linea">
              <span className="nt-factura-nombre">Sin lineas</span>
            </li>
          ) : (
            lineas.map((linea, idx) => {
              const key = linea.producto_id ?? `${linea.nombre}-${idx}`;
              const cant = Number(linea.cantidad);
              const pu = Number(linea.precio_unitario);
              const subt = Number(linea.importe_linea);
              const nombre = asciiImpresion(linea.nombre ?? "Producto");
              return (
                <li key={key} className="nt-factura-linea">
                  <span className="nt-factura-nombre">{nombre}</span>
                  <div className="nt-factura-detalle">
                    <span className="nt-factura-detalle-qty">
                      {Number.isNaN(cant) ? "-" : cant} x {formatearMoneda(Number.isNaN(pu) ? 0 : pu)}
                    </span>
                    <span className="nt-factura-detalle-total">{formatearMoneda(Number.isNaN(subt) ? 0 : subt)}</span>
                  </div>
                </li>
              );
            })
          )}
        </ul>

        <div className="nt-factura-sep" aria-hidden="true">
          ---------------------
        </div>

        <div className="nt-factura-resumen">
          <div className="nt-factura-resumen-row">
            <span className="nt-factura-label">Subtotal</span>
            <span className="nt-factura-valor">{formatearMoneda(factura.subtotal)}</span>
          </div>
          <div className="nt-factura-resumen-row">
            <span className="nt-factura-label">Descuento</span>
            <span className="nt-factura-valor">{formatearMoneda(factura.descuento)}</span>
          </div>
          <div className="nt-factura-resumen-row nt-factura-resumen-total">
            <span className="nt-factura-label">Total</span>
            <span className="nt-factura-valor">{formatearMoneda(factura.total)}</span>
          </div>
        </div>

        {pieLineas.length > 0 ? (
          <footer className="nt-factura-pie">
            {pieLineas.map((linea) => (
              <p key={linea}>{linea}</p>
            ))}
          </footer>
        ) : null}
      </article>
    </div>
  );
}
