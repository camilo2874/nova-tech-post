/**
 * Servicio local para cajón monedero (PC de la caja + navegador en Vercel)
 *
 * Uso: npm run cajon-bridge
 * API: http://127.0.0.1:31415/api/cajon/status | /api/cajon/abrir
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { executeDrawerScript } from './lib/cajon-drawer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '.env'));
loadEnvFile(path.join(__dirname, 'cajon-bridge.env'));

const PORT = Number(process.env.CAJON_BRIDGE_PORT || 31415);
const HOST = '127.0.0.1';
const API_PATH = '/api/cajon';
const DEFAULT_PRINTER = process.env.DRAWER_PRINTER_NAME || process.env.VITE_DRAWER_PRINTER_NAME || null;
const DEBUG = process.env.CAJON_BRIDGE_DEBUG === 'true';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, data) {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', () => resolve(''));
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url?.split('?')[0] ?? '';

  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (url === `${API_PATH}/status` && req.method === 'GET') {
    sendJson(res, 200, {
      status: 'ok',
      bridge: 'cajon-bridge-local-v1',
      endpoint: `${API_PATH}/abrir`,
      platform: os.platform(),
      node: process.version,
      printer: DEFAULT_PRINTER || 'automatica',
    });
    return;
  }

  if (url === `${API_PATH}/abrir` && req.method === 'POST') {
    const bodyData = await readBody(req);
    let printerName = DEFAULT_PRINTER;

    try {
      if (bodyData) {
        const data = JSON.parse(bodyData);
        printerName = data.printerName || printerName;
      }
    } catch {
      /* ignorar JSON invalido */
    }

    if (DEBUG) {
      console.log(`[Cajon Bridge] Abrir — impresora: ${printerName || 'automatica'}`);
    }

    const result = await executeDrawerScript(printerName);

    if (DEBUG) {
      console.log('[Cajon Bridge] Resultado:', result);
    }

    sendJson(res, result.success ? 200 : 500, {
      success: result.success,
      message: result.message,
    });
    return;
  }

  sendJson(res, 404, { success: false, message: 'Endpoint no encontrado' });
});

server.listen(PORT, HOST, () => {
  console.log('=== NOVA TECH — Cajon Bridge (servicio local) ===');
  console.log(`URL: http://${HOST}:${PORT}${API_PATH}`);
  console.log(`Impresora: ${DEFAULT_PRINTER || 'deteccion automatica'}`);
  console.log('Mantén esta ventana abierta mientras uses el POS en el navegador.');
});
