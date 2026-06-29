import fs from "fs"
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const buildVersion = env.VITE_APP_VERSION || new Date().getTime().toString()

  function writeVersionPlugin() {
    return {
      name: 'write-version-json',
      closeBundle() {
        const distPath = path.resolve(__dirname, './dist')
        if (!fs.existsSync(distPath)) {
          fs.mkdirSync(distPath, { recursive: true })
        }
        fs.writeFileSync(
          path.resolve(distPath, 'version.json'),
          JSON.stringify({ version: buildVersion })
        )
      }
    }
  }

  return {
    plugins: [react(), writeVersionPlugin()],
    define: {
      __BUILD_VERSION__: JSON.stringify(buildVersion),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      allowedHosts: [
        'whatsdesk.abdulkhafit.biz.id',
        'localhost',
        '127.0.0.1'
      ],
      host: '0.0.0.0',
      port: 5173
    },
    build: {
      chunkSizeWarningLimit: 200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react-dom')) {
                return 'vendor-react-dom';
              }
              if (id.includes('react/') || id.includes('scheduler')) {
                return 'vendor-react';
              }
              if (id.includes('react-router') || id.includes('@remix-run')) {
                return 'vendor-router';
              }
              if (id.includes('@tanstack') || id.includes('react-query')) {
                return 'vendor-tanstack';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('zustand')) {
                return 'vendor-zustand';
              }
              return 'vendor-other';
            }
          }
        }
      }
    }
  }
})