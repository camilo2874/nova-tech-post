/**
 * Lógica compartida: ejecutar script PowerShell para abrir cajón monedero
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');

/**
 * @param {string|null} printerName
 * @returns {Promise<{success: boolean, message: string, output?: string, error?: string}>}
 */
export async function executeDrawerScript(printerName = null) {
  return new Promise((resolve) => {
    try {
      const scriptPath = path.join(ROOT_DIR, 'abrir-cajon.ps1');
      const psArgs = [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
      ];

      if (printerName) {
        psArgs.push('-PrinterName', printerName);
      }

      const child = spawn('powershell.exe', psArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
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
            message: 'Cajon abierto exitosamente',
            output: stdout,
          });
        } else {
          resolve({
            success: false,
            message: stderr || 'Error al ejecutar script PowerShell',
            output: stdout,
            error: stderr,
          });
        }
      });

      child.on('error', (err) => {
        resolve({
          success: false,
          message: `Error ejecutando PowerShell: ${err.message}`,
          error: err.message,
        });
      });

      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill();
          resolve({
            success: false,
            message: 'Timeout: el script PowerShell tardo demasiado',
            timedOut: true,
          });
        }
      }, 10000);
    } catch (error) {
      resolve({
        success: false,
        message: `Excepcion: ${error.message}`,
        error: error.message,
      });
    }
  });
}
