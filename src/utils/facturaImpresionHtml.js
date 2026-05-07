import { TIENDA_FACTURA_DEFAULT } from "../config/tiendaFactura";
import { asciiImpresionEstricto, fechaHoraTicket } from "./textoImpresionTermica";

function esc(valor) {
  return asciiImpresionEstricto(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function moneda(valor) {
  const n = Number(valor);
  if (Number.isNaN(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function etiquetaMetodo(valor) {
  if (valor == null || String(valor).trim() === "") return "-";
  const s = String(valor).trim();
  return asciiImpresionEstricto(s.charAt(0).toUpperCase() + s.slice(1));
}

function textoVisible(valor) {
  return valor != null && String(valor).trim() !== "";
}

function lineasPie(mensaje) {
  if (!textoVisible(mensaje)) return [];
  return String(mensaje)
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => asciiImpresionEstricto(s));
}

/**
 * HTML minimo (tablas + Courier) para impresora termica; sin flex/grid ni variables CSS.
 */
export function construirHtmlFacturaImpresion({ factura, vendedor = null, tienda = null, montoRecibido = null, vuelto = null }) {
  const t = { ...TIENDA_FACTURA_DEFAULT, ...(tienda && typeof tienda === "object" ? tienda : {}) };
  const lineas = Array.isArray(factura.lineas) ? factura.lineas : [];
  const vNombre = asciiImpresionEstricto(String(vendedor?.nombre ?? "").trim()) || "-";

  const filasMeta = [];
  filasMeta.push(
    `<tr><td colspan="2" class="nt-l">FECHA</td></tr><tr><td colspan="2" class="nt-v">${esc(fechaHoraTicket(factura.fecha))}</td></tr>`,
  );
  filasMeta.push(
    `<tr><td colspan="2" class="nt-l nt-sp">ID VENTA</td></tr><tr><td colspan="2" class="nt-id">${esc(factura.venta_id ?? "-")}</td></tr>`,
  );
  filasMeta.push(
    `<tr><td colspan="2" class="nt-l nt-sp">METODO DE PAGO</td></tr><tr><td colspan="2" class="nt-v">${esc(etiquetaMetodo(factura.metodo_pago))}</td></tr>`,
  );
  filasMeta.push(
    `<tr><td colspan="2" class="nt-l nt-sp">VENDEDOR</td></tr><tr><td colspan="2" class="nt-v">${esc(vNombre)}</td></tr>`,
  );

  let filasLineas = "";
  if (lineas.length === 0) {
    filasLineas = `<tr><td colspan="2" class="nt-pname">Sin lineas</td></tr>`;
  } else {
    for (let i = 0; i < lineas.length; i += 1) {
      const linea = lineas[i];
      const cant = Number(linea.cantidad);
      const pu = Number(linea.precio_unitario);
      const subt = Number(linea.importe_linea);
      const nombre = esc(linea.nombre ?? "Producto");
      const c = Number.isNaN(cant) ? "-" : String(cant);
      const filaQty = `${c} x ${moneda(Number.isNaN(pu) ? 0 : pu)}`;
      filasLineas += `<tr><td colspan="2" class="nt-pname">${nombre}</td></tr>`;
      filasLineas += `<tr><td class="nt-qty">${esc(filaQty)}</td><td class="nt-pr">${moneda(Number.isNaN(subt) ? 0 : subt)}</td></tr>`;
      if (i < lineas.length - 1) {
        filasLineas += `<tr><td colspan="2" class="nt-gap"></td></tr>`;
      }
    }
  }

  const pie = lineasPie(t.mensajePie);
  const pieHtml = pie.length
    ? `<tr><td colspan="2" class="nt-foot">${pie.map((l) => `<div>${esc(l)}</div>`).join("")}</td></tr>`
    : "";

  let cabTienda = "";
  if (textoVisible(t.direccion) || textoVisible(t.telefono)) {
    const dir = textoVisible(t.direccion) ? `<div class="nt-dir">${esc(t.direccion)}</div>` : "";
    const tel = textoVisible(t.telefono) ? `<div class="nt-dir">Cel. ${esc(t.telefono)}</div>` : "";
    cabTienda = `${dir}${tel}`;
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Factura NOVA TECH</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body {
    font-family: "Courier New", Courier, monospace;
    font-size: 11pt;
    line-height: 1.35;
    width: 72mm;
    max-width: 100%;
    margin: 0 auto;
    padding: 2mm 1mm 4mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .nt-brand { text-align: center; font-weight: bold; font-size: 12pt; letter-spacing: 0.12em; margin: 0 0 6px; padding-bottom: 8px; border-bottom: 2px solid #000; }
  .nt-dir { text-align: center; font-size: 9pt; color: #333; margin: 2px 0; }
  .nt-rule { text-align: center; font-size: 8pt; margin: 8px 0; color: #555; }
  table.nt-t { width: 100%; border-collapse: collapse; }
  .nt-l { text-align: center; font-size: 8pt; font-weight: bold; color: #444; text-transform: uppercase; letter-spacing: 0.06em; padding-top: 8px; }
  .nt-l:first-child { padding-top: 0; }
  .nt-sp { padding-top: 10px; }
  .nt-v { text-align: center; font-weight: bold; font-size: 10pt; padding: 3px 0 0; word-break: break-word; }
  .nt-id { text-align: center; font-size: 8pt; font-weight: normal; word-break: break-all; padding: 3px 0 0; }
  .nt-pname { text-align: center; font-weight: bold; padding: 10px 0 4px; font-size: 10pt; }
  .nt-qty { text-align: center; font-size: 9pt; color: #333; padding: 0 4px 8px 0; width: 50%; }
  .nt-pr { text-align: center; font-weight: bold; font-size: 10pt; padding: 0 0 8px 4px; width: 50%; }
  .nt-gap { height: 4px; }
  .nt-sum td { padding: 4px 0; font-size: 10pt; }
  .nt-sum .nt-k { text-align: left; color: #333; font-weight: bold; padding-right: 8px; }
  .nt-sum .nt-m { text-align: right; font-weight: bold; white-space: nowrap; }
  .nt-tot td { padding: 10px 0 4px; border-top: 2px solid #000; font-size: 11pt; font-weight: bold; }
  .nt-tot .nt-k { text-align: left; padding-right: 8px; }
  .nt-tot .nt-m { text-align: right; white-space: nowrap; }
  .nt-efec td { padding: 5px 0 2px; font-size: 10pt; }
  .nt-efec .nt-k { text-align: left; color: #555; padding-right: 8px; }
  .nt-efec .nt-m { text-align: right; white-space: nowrap; }
  .nt-vuelto-row td { padding-top: 6px; border-top: 1px dashed #999; }
  .nt-vuelto-val { font-weight: bold; font-size: 11pt; }
  .nt-foot { text-align: center; font-size: 9pt; color: #444; font-style: italic; padding-top: 10px; border-top: 1px dashed #999; }
  .nt-foot div { margin: 4px 0; }
</style>
</head>
<body>
  <div class="nt-brand">NOVA TECH</div>
  ${cabTienda}
  <div class="nt-rule">---------------------</div>
  <table class="nt-t" role="presentation">${filasMeta.join("")}</table>
  <div class="nt-rule">---------------------</div>
  <table class="nt-t" role="presentation">${filasLineas}</table>
  <div class="nt-rule">---------------------</div>
  <table class="nt-t nt-sum" role="presentation">
    <tr><td class="nt-k">Subtotal</td><td class="nt-m">${moneda(factura.subtotal)}</td></tr>
    <tr><td class="nt-k">Descuento</td><td class="nt-m">${moneda(factura.descuento)}</td></tr>
    <tr class="nt-tot"><td class="nt-k">Total</td><td class="nt-m">${moneda(factura.total)}</td></tr>
    ${montoRecibido != null && Number(montoRecibido) > 0 ? `<tr class="nt-efec"><td class="nt-k">Recibido</td><td class="nt-m">${moneda(montoRecibido)}</td></tr>` : ""}
    ${vuelto != null ? `<tr class="nt-efec nt-vuelto-row"><td class="nt-k">Vuelto / Cambio</td><td class="nt-m nt-vuelto-val">${moneda(vuelto)}</td></tr>` : ""}
  </table>
  ${pieHtml ? `<table class="nt-t" role="presentation">${pieHtml}</table>` : ""}
  <br><br><br><br><br><br><br><br><br><br><br><br>
</body>
</html>`;
}
