/// <reference types="vite/client" />

import type { RendererApi } from '../../shared/types/ipc'

declare global {
  interface Window {
    /** preload 注入的桥；纯浏览器环境（Playwright 测试）下不存在 */
    api?: RendererApi
  }
}

export {}
