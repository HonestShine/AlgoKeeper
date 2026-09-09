import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    server: {
      // 固定 IPv4：vite 若仅绑定 [::1]，Electron 按 localhost→127.0.0.1 连接会报 ERR_CONNECTION_REFUSED
      host: '127.0.0.1'
    }
  }
})
