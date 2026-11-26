import { spawn } from 'node:child_process'
import { app, BrowserWindow, dialog, Menu, nativeTheme, net, safeStorage, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import type { AppState, CollectStatus, UpdateInfo } from '../shared/types'
import { collect } from './collector'
import { createCollectRunner, markUnreadableKey } from './core/collect-runner'
import { unseenCounts } from './core/feed'
import { createFetchText } from './core/fetch-text'
import { createTick } from './core/tick'
import { findInstaller, newerRelease, RELEASES_API } from './core/update'
import type { UpdateAsset } from './core/update'
import { isWindowOpen } from './core/visibility'
import { registerIpc } from './ipc'
import { notify } from './notify'
import { startScheduler } from './scheduler'
import { loadState, saveState } from './store'
import { createTray, setTrayUnseen } from './tray'
import { downloadFile } from './update-download'

let win: BrowserWindow | null = null
let quitting = false
let closedToTray = true // 트레이로 닫혀 있는가. 창을 처음 보이기 전(숨긴 채 시작 포함)에도 참이다
let sentVisible: boolean | null = null // 렌더러에 마지막으로 보낸 window-visible 값
let state: AppState
let file = ''
let updateInfo: UpdateInfo | null = null
let updateAsset: UpdateAsset | null = null // 이 버전의 설치 파일. 없으면 앱 안에서 받지 못한다

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

function setUpdate(next: UpdateInfo): void {
  updateInfo = next
  if (win && !win.isDestroyed()) win.webContents.send('update', next)
}

const downloading = (): boolean => updateInfo?.phase === 'downloading'

// 실패(오프라인·HTTP 오류 등)는 조용히 넘기고 알려 둔 값을 그대로 둔다. 거부하지 않는다.
async function checkUpdate(): Promise<void> {
  if (downloading()) return
  try {
    const body = await fetchText(RELEASES_API, { Accept: 'application/vnd.github+json' })
    const found = newerRelease(app.getVersion(), body)
    // 응답을 기다리는 사이에 내려받기가 시작됐을 수 있다.
    if (!found || found.version === updateInfo?.version || downloading()) return
    updateAsset = findInstaller(body, found.version, process.platform, process.arch)
    setUpdate(found)
  } catch {
    // 다음 확인 때 다시 본다.
  }
}

// 설치 파일이 실제로 시작된 뒤에만 끝난다. 시작하지 못하면 거부한다.
const startInstaller = (path: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(path, [], { detached: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('spawn', resolve)
    child.unref()
  })

// 거부하지 않는다. 어느 단계에서 실패하든 화면에는 릴리스 페이지를 안내한다.
async function installUpdate(): Promise<void> {
  const info = updateInfo
  const asset = updateAsset
  if (!info || info.phase === 'downloading') return
  if (!asset) {
    setUpdate({ ...info, phase: 'failed', percent: null })
    return
  }
  const progress = (percent: number): void => setUpdate({ ...info, phase: 'downloading', percent })
  progress(0)
  try {
    const file = join(app.getPath('temp'), asset.name)
    await downloadFile((url, init) => net.fetch(url, init), asset, file, progress)
    if (process.platform === 'darwin') {
      const failed = await shell.openPath(file)
      if (failed !== '') throw new Error(failed)
      await dialog.showMessageBox({
        type: 'info',
        title: 'SE LabMate',
        message: '설치 창을 열었습니다.',
        detail:
          "열린 창에서 SE LabMate를 Applications 폴더로 끌어 놓고 '대치'를 누른 다음 다시 열어 주십시오. 지금 실행 중인 앱은 종료됩니다.",
        buttons: ['확인']
      })
    } else {
      await startInstaller(file)
    }
    app.quit()
  } catch {
    setUpdate({ ...info, phase: 'failed', percent: null })
  }
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

// macOS에는 영어로 된 최소 메뉴(편집 메뉴가 없으면 입력칸의 복사·붙여넣기가 안 된다), 그 밖에는 메뉴 없음.
// 개발 실행에서만 개발 메뉴를 더한다.
function setMenu(): void {
  const dev: MenuItemConstructorOptions[] = app.isPackaged
    ? []
    : [
        {
          label: 'Develop',
          submenu: [
            { label: 'Developer Tools', role: 'toggleDevTools' },
            { label: 'Reload', role: 'reload' }
          ]
        }
      ]
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(dev.length > 0 ? Menu.buildFromTemplate(dev) : null)
    return
  }
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'SE LabMate',
      submenu: [
        { label: 'About SE LabMate', role: 'about' },
        { type: 'separator' },
        { label: 'Hide SE LabMate', role: 'hide' },
        { label: 'Hide Others', role: 'hideOthers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit SE LabMate', role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', role: 'undo' },
        { label: 'Redo', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', role: 'cut' },
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        { label: 'Select All', role: 'selectAll' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Minimize', role: 'minimize' },
        { label: 'Close', role: 'close' }
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
    testNotification: () => notify('알림 테스트입니다', showWindow),
    fetchText,
    updateInfo: () => updateInfo,
    installUpdate
  })
  win = createWindow(atLogin)
  if (corruptBackup)
    void dialog.showMessageBox({
      type: 'warning',
      title: 'SE LabMate',
      message: '저장 파일이 손상되어 처음 상태로 시작합니다.',
      detail: `이전 파일은 다음 위치에 남겨 두었습니다:\n${corruptBackup}`
    })

  void runner.collectNow()
  void checkUpdate()
  setInterval(() => void checkUpdate(), 6 * 60 * 60 * 1000) // 며칠씩 켜 두는 앱이라 하루에 몇 번 다시 본다
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

    // 옛 앱(연구비서 v0.1)이 같은 폴더의 state.json을 v1로만 읽으므로 v2는 따로 둔다. state.json은 읽기만 한다.
    file = join(app.getPath('userData'), 'state.v2.json')
    const legacyFile = join(app.getPath('userData'), 'state.json')
    let corruptBackup: string | null = null
    try {
      state = loadState(file, (path) => (corruptBackup = path), legacyFile)
    } catch {
      // 기본값으로 덮어쓰면 하나뿐인 사본을 잃는다. 아무것도 만들지 않고 끝낸다.
      dialog.showErrorBox('SE LabMate', '저장 파일을 읽을 수 없어 종료합니다.\n' + file)
      app.quit()
      return
    }
    try {
      start(corruptBackup)
    } catch (e) {
      // 창 없는 프로세스가 단일 실행 잠금을 쥔 채 남지 않게 바로 끝낸다.
      dialog.showErrorBox(
        'SE LabMate',
        '시작하지 못했습니다.\n' + (e instanceof Error ? e.message : String(e))
      )
      app.exit(1)
    }
  })
}
