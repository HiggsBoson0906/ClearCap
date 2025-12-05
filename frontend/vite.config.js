import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000',    // REST
      '/socket.io': {
        target: 'http://localhost:5000',  // WS
        ws: true,
      },
    },
  },
})
