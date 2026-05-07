import { construirHtmlFacturaImpresion } from "./facturaImpresionHtml";

/**
 * Imprime un ticket en la impresora termica via iframe oculto.
 *
 * IMPRESION SILENCIOSA (sin dialogo):
 *   Lanza Chrome/Edge con la bandera --kiosk-printing para que el dialogo
 *   de impresora se omita y se use directamente la impresora predeterminada.
 *   Usa el archivo "lanzar-pos.bat" incluido en la raiz del proyecto.
 *
 * COLA DE IMPRESION:
 *   Cada trabajo espera a que el anterior termine antes de iniciar,
 *   garantizando que el buffer de la impresora termica se vacíe entre recibos
 *   y evitando que el pie de un ticket se pegue al encabezado del siguiente.
 *
 * @param {{ factura: object, vendedor?: object | null, tienda?: object | null, montoRecibido?: number | null, vuelto?: number | null }} opciones
 */

let _ocupado = false;
const _cola = [];
const PAUSA_ENTRE_TRABAJOS_MS = 1800;

function _procesarCola() {
  if (_ocupado || _cola.length === 0) return;
  _ocupado = true;
  const html = _cola.shift();
  _imprimirHtml(html, () => {
    setTimeout(() => {
      _ocupado = false;
      _procesarCola();
    }, PAUSA_ENTRE_TRABAJOS_MS);
  });
}

function _imprimirHtml(html, alTerminar) {
  const blob = new Blob([html], { type: "text/html; charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = "Ticket NOVA TECH";
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;margin:0;padding:0;opacity:0;pointer-events:none;";

  document.body.appendChild(iframe);

  let terminado = false;
  const quitarMarco = () => {
    if (terminado) return;
    terminado = true;
    URL.revokeObjectURL(blobUrl);
    if (iframe.isConnected) iframe.remove();
    alTerminar();
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      quitarMarco();
      return;
    }

    win.addEventListener("afterprint", () => {
      setTimeout(quitarMarco, 800);
    });

    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        quitarMarco();
        return;
      }
      setTimeout(() => {
        if (!terminado) quitarMarco();
      }, 6000);
    }, 250);
  };

  iframe.onerror = quitarMarco;
  iframe.src = blobUrl;
}

export function imprimirFacturaTicket(opciones) {
  if (!opciones?.factura) return;
  const html = construirHtmlFacturaImpresion(opciones);
  _cola.push(html);
  _procesarCola();
}
