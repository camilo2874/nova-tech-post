import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cajonBridgePlugin from './vite-plugin-cajon-bridge.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    cajonBridgePlugin({
      apiPath: '/api/cajon',
      printerName: process.env.VITE_DRAWER_PRINTER_NAME || null,
      debug: true
    })
  ],
})
