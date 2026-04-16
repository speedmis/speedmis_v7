import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'public/build',
    manifest: true,
    rollupOptions: {
      input: 'src/main.jsx',
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api.php': 'http://localhost:8087',
      '/index.php': 'http://localhost:8087',
    },
  },
})
