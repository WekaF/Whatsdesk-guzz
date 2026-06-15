import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
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
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Group Icons (The biggest chunk)
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            // Group Charts
            if (id.includes('recharts') || id.includes('d3')) {
              return 'vendor-charts';
            }
            // Everything else (React, Radix, etc) stays in a stable vendor chunk
            return 'vendor-main';
          }
        }
      }
    }
  },
})