import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { CH } from '../shared/ipc/channels'
import type { MenuAction } from '../shared/types/ipc'
import { registerIpc } from './ipc/register'
import { getSettings } from './services/settings-store'
import { syncAll } from './services/indexer'

const rendererUrl = process.env['ELECTRON_RENDERER_URL']

function sendMenuAction(action: MenuAction): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send(CH.menuAction, action)
}

/** 应用原生菜单：与渲染层 TopMenuBar 同源动作，桥接为 menu:action 事件 */
function installMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '快速记录…', accelerator: 'CmdOrCtrl+Shift+N', click: () => sendMenuAction('new-note') },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('save') },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenuAction('save-as') },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '阅读/编辑切换', accelerator: 'CmdOrCtrl+E', click: () => sendMenuAction('toggle-mode') },
        { label: '搜索…', accelerator: 'CmdOrCtrl+K', click: () => sendMenuAction('open-search') },
        { label: '统计看板…', click: () => sendMenuAction('open-dashboard') },
        { label: '今日复习…', accelerator: 'CmdOrCtrl+Shift+R', click: () => sendMenuAction('review-start') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '设置',
      submenu: [
        { label: '偏好设置…', accelerator: 'CmdOrCtrl+,', click: () => sendMenuAction('open-settings') },
        { label: '更换笔记目录…', click: () => sendMenuAction('change-root') }
      ]
    },
    { role: 'windowMenu', label: '窗口' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

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
  registerIpc()
  installMenu()
  ipcMain.handle(CH.appNewWindow, () => createWindow())
  createWindow()

  // 启动时把笔记目录全量同步进 SQLite 索引（失败不阻塞窗口，仅记录）
  void (async () => {
    try {
      const root = (await getSettings()).notesRoot
      const count = await syncAll(root)
      console.log(`[index] 已同步 ${count} 篇笔记`)
    } catch (err) {
      console.error('[index] 索引同步失败', err)
    }
  })()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
