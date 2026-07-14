/**
 * Plugin Vite: Puente local para control del cajón monedero (solo desarrollo)
 */

import os from 'os';
import { executeDrawerScript } from './lib/cajon-drawer.js';

export default function cajonBridgePlugin(options = {}) {
  const {
    apiPath = '/api/cajon',
    printerName = null,
    debug = false,
  } = options;

  return {
    name: 'vite-plugin-cajon-bridge',
    apply: 'serve',

    configResolved() {
      if (debug) {
        console.log('[Cajón Bridge] Plugin Vite (desarrollo)');
        console.log(`  API Path: ${apiPath}`);
        console.log(`  Impresora: ${printerName || 'Automática'}`);
      }
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url.split('?')[0];

        if (url === `${apiPath}/status`) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            bridge: 'cajon-bridge-vite-dev',
            endpoint: `${apiPath}/abrir`,
            platform: os.platform(),
            node: process.version,
          }));
          return;
        }

        if (url === `${apiPath}/abrir` && req.method === 'POST') {
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
              /* ignorar */
            }

            if (debug) {
              console.log(`[Cajón Bridge] Ejecutando con impresora: ${requestPrinter || 'automática'}`);
            }

            const result = await executeDrawerScript(requestPrinter);

            if (debug) {
              console.log('[Cajón Bridge] Resultado:', result);
            }

            res.writeHead(result.success ? 200 : 500, {
              'Content-Type': 'application/json',
            });

            res.end(JSON.stringify({
              success: result.success,
              message: result.message,
              ...(debug && { output: result.output, error: result.error }),
            }));
          });
          return;
        }

        next();
      });
    },
  };
}
