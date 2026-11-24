import { app, BrowserWindow, dialog, Menu, nativeTheme, net, safeStorage } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import type { AppState, CollectStatus } from '../shared/types'
import { collect } from './collector'
import { createCollectRunner, markUnreadableKey } from './core/collect-runner'
import { unseenCounts } from './core/feed'
import { createFetchText } from './core/fetch-text'
import { createTick } from './core/tick'
import { isWindowOpen } from './core/visibility'
import { registerIpc } from './ipc'
import { notify } from './notify'
import { startScheduler } from './scheduler'
import { loadState, saveState } from './store'
import { createTray, setTrayUnseen } from './tray'

let win: BrowserWindow | null = null
let quitting = false
let closedToTray = true // 트레이로 닫혀 있는가. 창을 처음 보이기 전(숨긴 채 시작 포함)에도 참이다
let sentVisible: boolean | null = null // 렌더러에 마지막으로 보낸 window-visible 값
let state: AppState
let file = ''

// 저장이 실패하면 메모리 상태도 바꾸지 않는다.
function update(next: AppState): void {
  saveState(file, next)
  state = next
  setTrayUnseen(Object.keys(unseenCounts(state)).length > 0)
}

const getState = (): AppState => state

const windowOpen = (): boolean =>
  !!win &&
  !win.isDestroyed() &&
  isWindowOpen(closedToTray, win.isMinimized(), process.platform === 'darwin' && app.isHidden())

// 보임 여부는 사용자가 정한 상태(트레이로 닫음·내림·macOS의 앱 가리기)로만 정하고, 다른 창에 덮인 것은 보이는 것으로 친다.
// 창 이벤트마다 다시 계산하지만 값이 바뀔 때만 보낸다: macOS는 덮이고 드러날 때도 hide·show를 보내므로 그때는 보내지 않는다.
function syncVisible(): void {
  const open = windowOpen()
  if (!win || win.isDestroyed() || open === sentVisible) return
  sentVisible = open
  win.webContents.send('window-visible', open)
}

function showWindow(): void {
  if (!win) return
  closedToTray = false
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  syncVisible()
}

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

// 전역 fetch와 달리 시스템 프록시와 운영체제 인증서 저장소를 따른다. 호출은 앱이 준비된 뒤에만 일어난다.
const fetchText = createFetchText((url, init) => net.fetch(url, init))
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
const background = (): string => (nativeTheme.shouldUseDarkColors ? '#1D1D21' : '#FBFAF7')

function createWindow(hidden: boolean): BrowserWindow {
  const w = new BrowserWindow({
    width: 480,
    height: 760,
    show: false,
    // 숨긴 채 시작하면 페이지도 숨김으로 둔다: 그리지 않고 오브도 돌지 않는다(ready-to-show는 오지 않는다).
    paintWhenInitiallyHidden: !hidden,
    autoHideMenuBar: true,
    backgroundColor: background(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (!hidden)
    w.once('ready-to-show', () => {
      closedToTray = false
      w.show()
      syncVisible()
    })
  // 숨긴 채 시작했으면 showWindow(트레이·알림·두 번째 실행·activate)가 처음 열 때 true를 보낸다.
  w.on('show', syncVisible)
  w.on('hide', syncVisible)
  w.on('minimize', syncVisible)
  w.on('restore', syncVisible)
  w.on('focus', syncVisible) // macOS에서 Cmd+H로 가렸다 다시 보이면 show가 오지 않는다
  nativeTheme.on('updated', () => {
    if (!w.isDestroyed()) w.setBackgroundColor(background())
  })
  w.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    closedToTray = true
    w.hide()
    syncVisible()
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

// macOS에는 한국어로 된 최소 메뉴(편집 메뉴가 없으면 입력칸의 복사·붙여넣기가 안 된다), 그 밖에는 메뉴 없음.
// 개발 실행에서만 개발 메뉴를 더한다.
function setMenu(): void {
  const dev: MenuItemConstructorOptions[] = app.isPackaged
    ? []
    : [
        {
          label: '개발',
          submenu: [
            { label: '개발자 도구', role: 'toggleDevTools' },
            { label: '새로 고침', role: 'reload' }
          ]
        }
      ]
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(dev.length > 0 ? Menu.buildFromTemplate(dev) : null)
    return
  }
  const template: MenuItemConstructorOptions[] = [
    {
      label: '연구비서',
      submenu: [
        { label: '연구비서 정보', role: 'about' },
        { type: 'separator' },
        { label: '연구비서 가리기', role: 'hide' },
        { label: '기타 가리기', role: 'hideOthers' },
        { label: '모두 보기', role: 'unhide' },
        { type: 'separator' },
        { label: '연구비서 종료', role: 'quit' }
      ]
    },
    {
      label: '편집',
      submenu: [
        { label: '실행 취소', role: 'undo' },
        { label: '다시 실행', role: 'redo' },
        { type: 'separator' },
        { label: '잘라내기', role: 'cut' },
        { label: '복사', role: 'copy' },
        { label: '붙여넣기', role: 'paste' },
        { label: '전체 선택', role: 'selectAll' }
      ]
    },
    {
      label: '창',
      submenu: [
        { label: '최소화', role: 'minimize' },
        { label: '닫기', role: 'close' }
      ]
    },
    ...dev
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function start(corruptBackup: string | null): void {
  setMenu()
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
    windowVisible: windowOpen,
    setOpenAtLogin,
    testNotification: () => notify('알림 테스트입니다', showWindow)
  })
  win = createWindow(atLogin)
  if (corruptBackup)
    void dialog.showMessageBox({
      type: 'warning',
      title: '연구비서',
      message: '저장 파일이 손상되어 처음 상태로 시작합니다.',
      detail: `이전 파일은 다음 위치에 남겨 두었습니다:\n${corruptBackup}`
    })

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
    let corruptBackup: string | null = null
    try {
      state = loadState(file, (path) => (corruptBackup = path))
    } catch {
      // 기본값으로 덮어쓰면 하나뿐인 사본을 잃는다. 아무것도 만들지 않고 끝낸다.
      dialog.showErrorBox('연구비서', '저장 파일을 읽을 수 없어 종료합니다.\n' + file)
      app.quit()
      return
    }
    try {
      start(corruptBackup)
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
