import { app, BrowserWindow, Menu, Notification, Tray, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let win: BrowserWindow | null = null
let tray: Tray | null = null // module scope so the tray is not garbage-collected
let quitting = false

function createWindow(): void {
  win = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // sandboxed preload cannot require the externalized @electron-toolkit/preload (Task 7)
    }
  })

  win.on('ready-to-show', () => win?.show())
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win?.hide()
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  tray.setToolTip('연구비서')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '열기', click: () => win?.show() },
      {
        label: '알림 테스트',
        click: () => new Notification({ title: '연구비서', body: '알림 테스트입니다' }).show()
      },
      { label: '종료', click: () => app.quit() }
    ])
  )
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => win?.show())
  app.on('before-quit', () => {
    quitting = true
  })
  app.on('activate', () => win?.show())

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.researchassistant.app')
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
    createTray()
    createWindow()
  })
}
