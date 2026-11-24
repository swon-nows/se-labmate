import { app, BrowserWindow, dialog, safeStorage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import type { AppState, CollectStatus } from '../shared/types'
import { collect } from './collector'
import { unseenCounts } from './core/feed'
import { applyCollected } from './core/merge'
import { registerIpc } from './ipc'
import { notify } from './notify'
import { startScheduler } from './scheduler'
import { loadState, saveState } from './store'
import { createTray, setTrayUnseen } from './tray'

let win: BrowserWindow | null = null
let quitting = false
let state: AppState
let file = ''
let collecting: Promise<void> | null = null
let lastFinishedAt: string | null = null

function update(next: AppState): void {
  state = next
  saveState(file, state)
  setTrayUnseen(Object.keys(unseenCounts(state)).length > 0)
}

const showWindow = (): void => win?.show()

const status = (): CollectStatus => ({
  running: collecting !== null,
  lastFinishedAt,
  errors: state.sourceErrors
})

function sendStatus(): void {
  if (win && !win.isDestroyed()) win.webContents.send('status', status())
}

// 오류 메시지는 state.json과 화면에 남는다. 원래 메시지에는 키가 든 URL이 섞일 수 있어 고정 문구로 바꾼다.
const fetchFailed = (e: unknown): never => {
  throw new Error(
    e instanceof DOMException && e.name === 'TimeoutError' ? '요청 시간 초과' : '네트워크 오류'
  )
}

async function fetchText(url: string, headers?: Record<string, string>): Promise<string> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) }).catch(fetchFailed)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text().catch(fetchFailed)
}

function openAlexKey(): string | null {
  if (state.openAlexKeyEnc === null) return null
  try {
    return safeStorage.decryptString(Buffer.from(state.openAlexKeyEnc, 'base64'))
  } catch {
    return null
  }
}

// 동시에 하나만 돈다. 돌려주는 Promise는 거부하지 않는다.
function collectNow(): Promise<void> {
  if (!collecting) {
    collecting = runCollect()
    sendStatus()
  }
  return collecting
}

async function runCollect(): Promise<void> {
  try {
    const deps = { fetchText, now: () => new Date(), openAlexKey: openAlexKey() }
    const collected = await collect(state, deps)
    // await 뒤에 state를 다시 읽어야 수집 중에 바뀐 확인·저장·숨김을 잃지 않는다(한 줄로 합치지 말 것).
    update(applyCollected(state, collected, new Date().toISOString()))
  } catch (e) {
    console.error('수집 실패', e)
  } finally {
    collecting = null
    lastFinishedAt = new Date().toISOString()
    sendStatus()
  }
}

// 개발 실행에서 Electron 실행 파일이 로그인 항목으로 등록되지 않도록 포장된 앱에서만 건다.
function setOpenAtLogin(openAtLogin: boolean): void {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin, args: ['--hidden'] })
}

function createWindow(hidden: boolean): BrowserWindow {
  const w = new BrowserWindow({
    width: 480,
    height: 760,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (!hidden) w.once('ready-to-show', () => w.show())
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
    if (state.profile) setOpenAtLogin(state.settings.openAtLogin)

    createTray({ open: showWindow, refresh: () => void collectNow(), quit: () => app.quit() })
    setTrayUnseen(Object.keys(unseenCounts(state)).length > 0)

    // macOS는 로그인 항목에 args를 넘기지 않으므로 wasOpenedAtLogin으로 안다.
    const atLogin =
      process.argv.includes('--hidden') ||
      (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin)
    registerIpc({
      getState: () => state,
      update,
      status,
      collectNow,
      windowVisible: () => win?.isVisible() ?? false,
      setOpenAtLogin,
      testNotification: () => notify('알림 테스트입니다', showWindow)
    })
    win = createWindow(atLogin)

    void collectNow()
    startScheduler({
      getState: () => state,
      update,
      collectNow,
      notify: (body) => notify(body, showWindow)
    })
  })
}
