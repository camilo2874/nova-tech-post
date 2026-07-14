/**
 * Cajón monedero — Bridge local + fallback Web Serial
 *
 * Orden de conexión:
 *   1. Servicio local http://127.0.0.1:31415 (PC de la caja + app en Vercel)
 *   2. Plugin Vite /api/cajon (npm run dev local)
 *   3. Web Serial API (fallback manual)
 */

const DRAWER_KICK = new Uint8Array([0x1b, 0x70, 0x00, 0x32, 0xfa]);

const LOCAL_BRIDGE =
  import.meta.env.VITE_CAJON_BRIDGE_URL || 'http://127.0.0.1:31415';

const BRIDGE_TARGETS = [
  { base: LOCAL_BRIDGE, kind: 'local' },
  { base: '', kind: 'dev' },
];

let _state = {
  bridgeAvailable: null,
  bridgeChecked: false,
  bridgeKind: null,
  activeBridgeBase: null,
  serialPort: null,
  serialConnected: false,
};

function _resetBridgeCache() {
  _state.bridgeChecked = false;
  _state.bridgeAvailable = null;
  _state.bridgeKind = null;
  _state.activeBridgeBase = null;
}

function _statusUrl(base) {
  return `${base}/api/cajon/status`;
}

function _abrirUrl(base) {
  return `${base}/api/cajon/abrir`;
}

async function _checkBridgeAvailable() {
  if (_state.bridgeChecked) {
    return _state.bridgeAvailable;
  }

  for (const target of BRIDGE_TARGETS) {
    try {
      const response = await fetch(_statusUrl(target.base), {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        _state.bridgeAvailable = true;
        _state.bridgeChecked = true;
        _state.activeBridgeBase = target.base;
        _state.bridgeKind = target.kind;
        return true;
      }
    } catch {
      /* probar siguiente */
    }
  }

  _state.bridgeAvailable = false;
  _state.bridgeChecked = true;
  _state.activeBridgeBase = null;
  _state.bridgeKind = null;
  return false;
}

async function _abrirViaBridge() {
  const base = _state.activeBridgeBase ?? '';

  try {
    const response = await fetch(_abrirUrl(base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
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

async function _abrirViaSerial() {
  if (!_state.serialPort) return false;

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

export function cajonConectado() {
  return _state.serialConnected || _state.bridgeAvailable;
}

export function cajonMetodoConexion() {
  if (_state.bridgeKind === 'local') return 'servicio local';
  if (_state.bridgeKind === 'dev') return 'desarrollo';
  if (_state.serialConnected) return 'serial';
  return 'ninguno';
}

/**
 * Detecta bridge sin abrir el cajón (útil al cargar la página)
 * @returns {Promise<boolean>}
 */
export async function detectarCajon() {
  _resetBridgeCache();
  return await _checkBridgeAvailable();
}

/**
 * @param {{ probarApertura?: boolean }} options
 * @returns {Promise<boolean>}
 */
export async function conectarCajon(options = {}) {
  const { probarApertura = false } = options;
  _resetBridgeCache();

  try {
    const available = await _checkBridgeAvailable();
    if (available) {
      _state.bridgeAvailable = true;
      if (probarApertura) {
        const ok = await _abrirViaBridge();
        if (!ok) {
          _state.bridgeAvailable = false;
          return false;
        }
      }
      return true;
    }
  } catch (error) {
    console.warn('[Cajón] Error verificando bridge:', error);
  }

  if (!('serial' in navigator)) {
    throw new Error(
      'No hay servicio de cajón en esta PC. En la caja ejecuta: npm run cajon-bridge',
    );
  }

  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    _state.serialPort = port;
    _state.serialConnected = true;
    return true;
  } catch (err) {
    if (err.name === 'NotFoundError') return false;
    throw new Error(`No se pudo conectar al puerto serial: ${err.message}`);
  }
}

export async function desconectarCajon() {
  const portRef = _state.serialPort;
  _state.serialPort = null;
  _state.serialConnected = false;
  _resetBridgeCache();

  try {
    if (portRef) await portRef.close();
  } catch {
    /* silencioso */
  }
}

export async function abrirCajon() {
  if (_state.bridgeAvailable !== false) {
    try {
      if (!_state.bridgeChecked) {
        await _checkBridgeAvailable();
      }
      const success = await _abrirViaBridge();
      if (success) {
        return {
          success: true,
          method: _state.bridgeKind || 'bridge',
          message: 'Cajón abierto vía impresora',
        };
      }
    } catch (error) {
      console.warn('[Cajón] Bridge falló:', error);
    }
  }

  if (_state.serialConnected) {
    try {
      const success = await _abrirViaSerial();
      if (success) {
        return {
          success: true,
          method: 'serial',
          message: 'Cajón abierto vía puerto serial',
        };
      }
    } catch (error) {
      console.warn('[Cajón] Serial falló:', error);
    }
  }

  return {
    success: false,
    method: 'none',
    message:
      'Cajón no disponible. En la PC de la caja ejecuta npm run cajon-bridge y pulsa Cajón.',
  };
}

export async function abrirCajonSimple() {
  const result = await abrirCajon();
  return result.success;
}
