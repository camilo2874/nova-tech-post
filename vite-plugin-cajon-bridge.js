/**
 * Plugin Vite: Puente local para control del cajón monedero
 * Proporciona API /api/cajon/abrir que llama al script PowerShell
 * 
 * Uso en vite.config.js:
 *   import cajonBridgePlugin from './vite-plugin-cajon-bridge.js';
 *   
 *   export default {
 *     plugins: [cajonBridgePlugin()]
 *   }
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Ejecuta el script PowerShell para abrir cajón
 * @param {string} printerName - Nombre de la impresora (opcional)
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function executeDrawerScript(printerName = null) {
  return new Promise((resolve) => {
    try {
      // Ruta del script PowerShell
      const scriptPath = path.join(__dirname, 'abrir-cajon.ps1');
      
      // Argumentos del PowerShell
      const psArgs = [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath
      ];
      
      // Agregar nombre de impresora si se proporciona
      if (printerName) {
        psArgs.push('-PrinterName', printerName);
      }
      
      // Ejecutar PowerShell
      const child = spawn('powershell.exe', psArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            message: 'Cajón abierto exitosamente',
            output: stdout
          });
        } else {
          resolve({
            success: false,
            message: stderr || 'Error al ejecutar script PowerShell',
            output: stdout,
            error: stderr
          });
        }
      });
      
      child.on('error', (err) => {
        resolve({
          success: false,
          message: `Error ejecutando PowerShell: ${err.message}`,
          error: err.message
        });
      });
      
      // Timeout de 10 segundos
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill();
          resolve({
            success: false,
            message: 'Timeout: El script PowerShell tardó demasiado',
            timedOut: true
          });
        }
      }, 10000);
      
    } catch (error) {
      resolve({
        success: false,
        message: `Excepción: ${error.message}`,
        error: error.message
      });
    }
  });
}

/**
 * Plugin Vite que añade middleware para control del cajón
 */
export default function cajonBridgePlugin(options = {}) {
  const {
    apiPath = '/api/cajon',
    printerName = null,
    debug = false
  } = options;
  
  return {
    name: 'vite-plugin-cajon-bridge',
    apply: 'serve', // Solo aplica en desarrollo
    
    configResolved(config) {
      if (debug) {
        console.log('[Cajón Bridge] Plugin configurado');
        console.log(`  API Path: ${apiPath}`);
        console.log(`  Impresora: ${printerName || 'Automática'}`);
      }
    },
    
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url.split('?')[0]; // Ignorar query params
        
        // Status endpoint
        if (url === `${apiPath}/status`) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            bridge: 'cajon-bridge-v1',
            endpoint: `${apiPath}/abrir`,
            platform: os.platform(),
            node: process.version
          }));
          return;
        }
        
        // Abrir cajón endpoint
        if (url === `${apiPath}/abrir` && req.method === 'POST') {
          try {
            if (debug) {
              console.log(`[Cajón Bridge] ${req.method} ${req.url}`);
            }
            
            let bodyData = '';
            req.on('data', (chunk) => {
              bodyData += chunk.toString();
            });
            
            req.on('end', async () => {
              let requestPrinter = printerName;
              
              try {
                if (bodyData) {
                  const data = JSON.parse(bodyData);
                  requestPrinter = data.printerName || printerName;
                }
              } catch {
                // Ignorar error de parsing JSON
              }
              
              if (debug) {
                console.log(`[Cajón Bridge] Ejecutando con impresora: ${requestPrinter || 'automática'}`);
              }
              
              // Ejecutar script PowerShell
              const result = await executeDrawerScript(requestPrinter);
              
              if (debug) {
                console.log('[Cajón Bridge] Resultado:', result);
              }
              
              // Responder al cliente
              res.writeHead(result.success ? 200 : 500, {
                'Content-Type': 'application/json'
              });
              
              res.end(JSON.stringify({
                success: result.success,
                message: result.message,
                ...(debug && { 
                  output: result.output,
                  error: result.error
                })
              }));
            });
          } catch (error) {
            console.error('[Cajón Bridge] Error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              message: `Error interno: ${error.message}`
            }));
          }
          return;
        }
        
        // Pasar a siguiente middleware si no es nuestro endpoint
        next();
      });
    }
  };
}
