import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'

const rendererUrl = process.env['ELECTRON_RENDERER_URL']

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    title: 'AlgoKeeper',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // 外部链接一律交给系统浏览器，不在应用内新开窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (rendererUrl) {
    void loadRendererUrl(win, rendererUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 加载 dev server URL。冷启动时 vite 可能尚未就绪而报 ERR_CONNECTION_REFUSED
 * （code -102），此处做有限重试以消除启动竞态。
 */
function loadRendererUrl(win: BrowserWindow, url: string): void {
  let attempts = 0
  const load = (): void => {
    if (win.isDestroyed()) return
    void win.loadURL(url).catch(() => {
      /* did-fail-load 兜底，见下 */
    })
  }
  win.webContents.on('did-fail-load', (_event, errorCode, _errorDescription, _validatedUrl, isMainFrame) => {
    if (isMainFrame && errorCode === -102 && attempts < 15) {
      attempts += 1
      setTimeout(load, 400)
    }
  })
  load()
}

app.whenReady().then(() => {
  ipcMain.handle('app:ping', () => 'pong')

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
