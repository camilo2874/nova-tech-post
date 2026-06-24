/**
 * Cajón monedero — Bridge con fallback Web Serial
 *
 * Arquitectura:
 *   1. PRINCIPAL: API local /api/cajon/abrir (via plugin Vite + PowerShell)
 *      - Envía comando ESC/POS directamente a impresora Epson
 *      - Automático y confiable
 *      - Recomendado para producción
 *
 *   2. FALLBACK: Web Serial API (si API local no disponible)
 *      - Puerto COM directo
 *      - Requiere conexión manual
 *      - Compatibilidad con navegadores antiguos
 *
 * Comando ESC/POS de apertura:
 *   ESC p m t1 t2
 *   0x1B 0x70 0x00 0x32 0xFA
 *   Pin 2, 50 ms ON, 250 ms OFF
 */

const DRAWER_KICK = new Uint8Array([0x1b, 0x70, 0x00, 0x32, 0xfa]);
const API_ENDPOINT = '/api/cajon/abrir';
const API_STATUS = '/api/cajon/status';

/** Estado del sistema */
let _state = {
  // API Bridge
  bridgeAvailable: null,
  bridgeChecked: false,
  
  // Web Serial (fallback)
  serialPort: null,
  serialConnected: false,
};

/**
 * Verifica si el bridge local está disponible
 * @returns {Promise<boolean>}
 */
async function _checkBridgeAvailable() {
  if (_state.bridgeChecked) {
    return _state.bridgeAvailable;
  }

  try {
    const response = await fetch(API_STATUS, { 
      method: 'GET',
      signal: AbortSignal.timeout(2000) 
    });
    _state.bridgeAvailable = response.ok;
  } catch {
    _state.bridgeAvailable = false;
  }
  
  _state.bridgeChecked = true;
  return _state.bridgeAvailable;
}

/**
 * Intenta abrir el cajón vía API Bridge (recomendado)
 * @returns {Promise<boolean>}
 */
async function _abrirViaBridge() {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const data = await response.json();
      return data.success === true;
    }

    return false;
  } catch (error) {
    console.warn('[Cajón] Error en bridge:', error.message);
    return false;
  }
}

/**
 * Intenta abrir el cajón vía Web Serial (fallback)
 * @returns {Promise<boolean>}
 */
async function _abrirViaSerial() {
  if (!_state.serialPort) {
    return false;
  }

  try {
    const writer = _state.serialPort.writable.getWriter();
    await writer.write(DRAWER_KICK);
    writer.releaseLock();
    return true;
  } catch {
    _state.serialPort = null;
    _state.serialConnected = false;
    return false;
  }
}

/**
 * Devuelve verdadero si el cajón está disponible (algún método)
 * @returns {boolean}
 */
export function cajonConectado() {
  return _state.serialConnected || _state.bridgeAvailable;
}

/**
 * Devuelve el método actual de conexión
 * @returns {string} 'bridge' | 'serial' | 'none'
 */
export function cajonMetodoConexion() {
  if (_state.bridgeAvailable) return 'bridge';
  if (_state.serialConnected) return 'serial';
  return 'none';
}

/**
 * Conecta a la impresora Epson vía API Bridge
 * Este es el método recomendado - no requiere diálogo del usuario
 * @returns {Promise<boolean>}
 */
export async function conectarCajon() {
  try {
    const available = await _checkBridgeAvailable();
    
    if (available) {
      _state.bridgeAvailable = true;
      return true;
    }
  } catch (error) {
    console.warn('[Cajón] Error verificando bridge:', error);
  }

  // Fallback: Web Serial API
  if (!("serial" in navigator)) {
    throw new Error(
      "No hay bridge disponible y Web Serial API no está soportada en este navegador.",
    );
  }

  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    _state.serialPort = port;
    _state.serialConnected = true;
    return true;
  } catch (err) {
    if (err.name === "NotFoundError") {
      return false;
    }
    throw new Error(`No se pudo conectar al puerto serial: ${err.message}`);
  }
}

/**
 * Desconecta del puerto serial (si usa Web Serial fallback)
 * @returns {Promise<void>}
 */
export async function desconectarCajon() {
  const portRef = _state.serialPort;
  _state.serialPort = null;
  _state.serialConnected = false;
  
  try {
    if (portRef) await portRef.close();
  } catch {
    /* silencioso — el puerto puede ya estar cerrado */
  }
}

/**
 * Abre el cajón - intenta múltiples métodos en orden de confiabilidad
 * 
 * Orden de intentos:
 *   1. API Bridge (recomendado - impresora Epson)
 *   2. Web Serial (fallback - puerto COM)
 * 
 * @returns {Promise<{success: boolean, method: string, message: string}>}
 */
export async function abrirCajon() {
  // Intentar método 1: Bridge (verificar disponibilidad si aún no se hizo)
  if (_state.bridgeAvailable !== false) {
    try {
      if (!_state.bridgeChecked) {
        await _checkBridgeAvailable();
      }
      const success = await _abrirViaBridge();
      if (success) {
        return { 
          success: true, 
          method: 'bridge',
          message: 'Cajón abierto vía impresora'
        };
      }
    } catch (error) {
      console.warn('[Cajón] Bridge falló:', error);
    }
  }

  // Intentar método 2: Serial (fallback)
  if (_state.serialConnected) {
    try {
      const success = await _abrirViaSerial();
      if (success) {
        return { 
          success: true, 
          method: 'serial',
          message: 'Cajón abierto vía puerto serial'
        };
      }
    } catch (error) {
      console.warn('[Cajón] Serial falló:', error);
    }
  }

  return { 
    success: false, 
    method: 'none',
    message: 'No hay método de apertura disponible. Conecta el cajón primero.'
  };
}

/**
 * Intenta abrir el cajón - versión simplificada (solo retorna boolean)
 * Para compatibilidad con código existente
 * @returns {Promise<boolean>}
 */
export async function abrirCajonSimple() {
  const result = await abrirCajon();
  return result.success;
}
