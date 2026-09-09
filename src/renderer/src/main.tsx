import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './main.css'

async function bootstrap(): Promise<void> {
  // 默认主题（浅色 GitHub）尽早生效，避免首帧闪深色
  document.documentElement.dataset.theme = 'light-github'
  // 纯浏览器（Playwright）开发测试：注入内存假后端；桌面应用内 window.api 由 preload 提供。
  // import.meta.env.DEV 为 false 时整段被 tree-shake，不进生产包。
  if (!window.api && import.meta.env.DEV) {
    const { installFakeApi } = await import('./dev-fake-api')
    window.api = installFakeApi()
  }
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void bootstrap()
