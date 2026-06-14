import { defineConfig } from 'vite'

// https://vite.dev/config/
const devApiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET || 'http://127.0.0.1:8080'

export default defineConfig({
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
