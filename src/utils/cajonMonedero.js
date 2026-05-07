/**
 * Cajón monedero — Web Serial API
 *
 * Requisitos:
 *  · Navegador Chrome o Edge (Web Serial API).
 *  · El cajón debe estar conectado directamente por USB/Serial
 *    O conectado a la impresora térmica por RJ11 y accesible
 *    como puerto serie (COM3, /dev/ttyUSB0, etc.).
 *
 * Comando ESC/POS de apertura:
 *   ESC p m t1 t2
 *   0x1B 0x70 0x00 0x32 0xFA
 *   Pin 2, 50 ms ON, 250 ms OFF
 */

const DRAWER_KICK = new Uint8Array([0x1b, 0x70, 0x00, 0x32, 0xfa]);

/** Puerto serial actualmente conectado (módulo singleton). */
let _port = null;

/** Devuelve true si hay un puerto conectado y abierto. */
export function cajonConectado() {
  return _port !== null;
}

/**
 * Abre el diálogo del navegador para que el usuario seleccione
 * el puerto serie del cajón/impresora y establece la conexión.
 * Lanza un error si Web Serial no está disponible o falla.
 */
export async function conectarCajon() {
  if (!("serial" in navigator)) {
    throw new Error(
      "Web Serial API no está disponible. Usa Chrome o Edge para controlar el cajón.",
    );
  }

  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    _port = port;
  } catch (err) {
    if (err.name === "NotFoundError") {
      return;
    }
    throw new Error(`No se pudo conectar al cajón: ${err.message}`);
  }
}

/** Cierra el puerto serial y limpia la referencia. */
export async function desconectarCajon() {
  const portRef = _port;
  _port = null;
  try {
    if (portRef) await portRef.close();
  } catch {
    /* silencioso — el puerto puede ya estar cerrado */
  }
}

/**
 * Envía el pulso ESC/POS para abrir el cajón.
 * Devuelve true si el comando se envió, false si no hay puerto conectado.
 * Si el puerto se desconectó externamente, limpia la referencia y devuelve false.
 */
export async function abrirCajon() {
  if (!_port) return false;

  try {
    const writer = _port.writable.getWriter();
    await writer.write(DRAWER_KICK);
    writer.releaseLock();
    return true;
  } catch {
    _port = null;
    return false;
  }
}
