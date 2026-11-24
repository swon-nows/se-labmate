import { app, BrowserWindow, dialog, nativeTheme, net, safeStorage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import type { AppState, CollectStatus } from '../shared/types'
import { collect } from './collector'
import { createCollectRunner, markUnreadableKey } from './core/collect-runner'
import { unseenCounts } from './core/feed'
import { createFetchText } from './core/fetch-text'
import { createTick } from './core/tick'
import { registerIpc } from './ipc'
import { notify } from './notify'
import { startScheduler } from './scheduler'
import { loadState, saveState } from './store'
import { createTray, setTrayUnseen } from './tray'

let win: BrowserWindow | null = null
let quitting = false
let state: AppState
let file = ''

// 저장이 실패하면 메모리 상태도 바꾸지 않는다.
function update(next: AppState): void {
  saveState(file, next)
  state = next
  setTrayUnseen(Object.keys(unseenCounts(state)).length > 0)
}

const getState = (): AppState => state
const showWindow = (): void => win?.show()

function sendStatus(status: CollectStatus): void {
  if (win && !win.isDestroyed()) win.webContents.send('status', status)
}

function decryptKey(enc: string | null): string | null {
  if (enc === null) return null
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}

const fetchText = createFetchText(fetch)
const runner = createCollectRunner({
  getState,
  update,
  now: () => new Date(),
  onStatus: sendStatus,
  collect: async (s) => {
    const key = decryptKey(s.openAlexKeyEnc)
    const collected = await collect(s, { fetchText, now: () => new Date(), openAlexKey: key })
    return markUnreadableKey(collected, key)
  }
})

// 개발 실행에서 Electron 실행 파일이 로그인 항목으로 등록되지 않도록 포장된 앱에서만 건다.
function setOpenAtLogin(openAtLogin: boolean): void {
  if (!app.isPackaged) return
  try {
    app.setLoginItemSettings({ openAtLogin, args: ['--hidden'] })
  } catch (e) {
    console.error('로그인 항목 설정 실패', e)
  }
}

// 렌더러 styles.css의 --bg와 같은 값: 어두운 모드에서 흰 화면이 번쩍이지 않게 한다.
const background = (): string => (nativeTheme.shouldUseDarkColors ? '#161618' : '#ffffff')

function createWindow(hidden: boolean): BrowserWindow {
  const w = new BrowserWindow({
    width: 480,
    height: 760,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: background(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (!hidden) w.once('ready-to-show', () => w.show())
  nativeTheme.on('updated', () => {
    if (!w.isDestroyed()) w.setBackgroundColor(background())
  })
  w.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    w.hide()
  })
  // Windows의 로그오프·종료에는 before-quit이 오지 않는다. 숨기기가 종료를 막지 않게 한다.
  w.on('session-end', () => {
    quitting = true
  })
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (e) => e.preventDefault())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    w.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    w.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return w
}

function start(): void {
  if (state.profile) setOpenAtLogin(state.settings.openAtLogin)

  createTray({ open: showWindow, refresh: () => void runner.collectNow(), quit: () => app.quit() })
  setTrayUnseen(Object.keys(unseenCounts(state)).length > 0)

  // macOS는 로그인 항목에 args를 넘기지 않으므로 wasOpenedAtLogin으로 안다.
  const atLogin =
    process.argv.includes('--hidden') ||
    (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin)
  registerIpc({
    getState,
    update,
    status: runner.status,
    collectNow: runner.collectNow,
    collectFresh: runner.collectFresh,
    windowVisible: () => !!win && win.isVisible() && !win.isMinimized(),
    setOpenAtLogin,
    testNotification: () => notify('알림 테스트입니다', showWindow)
  })
  win = createWindow(atLogin)

  void runner.collectNow()
  startScheduler(
    createTick({
      getState,
      update,
      now: () => new Date(),
      isOnline: () => net.isOnline(),
      collectNow: runner.collectNow,
      notify: (body) => notify(body, showWindow)
    })
  )
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  app.on('before-quit', () => {
    quitting = true
  })
  app.on('activate', showWindow)

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.researchassistant.app')
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

    file = join(app.getPath('userData'), 'state.json')
    try {
      state = loadState(file)
    } catch {
      // 기본값으로 덮어쓰면 하나뿐인 사본을 잃는다. 아무것도 만들지 않고 끝낸다.
      dialog.showErrorBox('연구비서', '저장 파일을 읽을 수 없어 종료합니다.\n' + file)
      app.quit()
      return
    }
    try {
      start()
    } catch (e) {
      // 창 없는 프로세스가 단일 실행 잠금을 쥔 채 남지 않게 바로 끝낸다.
      dialog.showErrorBox(
        '연구비서',
        '시작하지 못했습니다.\n' + (e instanceof Error ? e.message : String(e))
      )
      app.exit(1)
    }
  })
}
