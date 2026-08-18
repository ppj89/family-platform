import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const devApiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET || 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    watch: {
      ignored: [
        '**/.git/**',
        '**/.tools/**',
        '**/android/.gradle/**',
        '**/android/build/**',
        '**/android/app/build/**',
        '**/ios/App/build/**',
        '**/dist/**',
        '**/backups/**',
      ],
    },
    proxy: {
      '/api': {
        target: devApiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})
