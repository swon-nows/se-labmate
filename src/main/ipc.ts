import { ipcMain, safeStorage, shell } from 'electron'
import type {
  AppState,
  BoardResult,
  CollectStatus,
  Item,
  PreviewResult,
  PublicState,
  SaveResult
} from '../shared/types'
import { readPosts } from './core/boards/index'
import type { Post } from './core/boards/post'
import type { FetchText } from './core/fetch-text'
import { hideItem, pastItems, savedItems, takeNew } from './core/feed'
import { applyProfile, isSaveInput, validateBoard, validateProfile } from './core/profile'
import { isHttpUrl } from './core/text'

export interface IpcDeps {
  getState(): AppState
  update(next: AppState): void
  status(): CollectStatus
  collectNow(): Promise<void> // 거부하지 않는다
  collectFresh(): Promise<void> // 거부하지 않는다
  windowVisible(): boolean
  setOpenAtLogin(open: boolean): void
  testNotification(): void
  fetchText: FetchText
}

const encrypt = (key: string): string => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('encryption unavailable')
  return safeStorage.encryptString(key).toString('base64')
}

// 렌더러에서 온 값은 모두 unknown으로 받는다. 어떤 값이 와도 처리기는 던지지 않는다.
export function registerIpc(d: IpcDeps): void {
  const patchItem = (id: unknown, change: Partial<Item>): void => {
    const s = d.getState()
    if (typeof id !== 'string' || !Object.hasOwn(s.items, id)) return
    d.update({ ...s, items: { ...s.items, [id]: { ...s.items[id], ...change } } })
  }

  ipcMain.handle('getState', (): PublicState => {
    const s = d.getState()
    return {
      profile: s.profile,
      settings: s.settings,
      hasOpenAlexKey: s.openAlexKeyEnc !== null,
      status: d.status(),
      boards: s.boards
    }
  })

  ipcMain.handle('saveProfile', (_e, input: unknown): SaveResult => {
    if (!isSaveInput(input)) return { ok: false, errors: ['입력 형식이 올바르지 않습니다.'] }
    const v = validateProfile(input)
    if (!v.ok) return v
    let next: AppState
    try {
      const valid = { profile: v.profile, settings: v.settings, openAlexKey: input.openAlexKey }
      next = applyProfile(d.getState(), valid, encrypt, new Date().toISOString())
    } catch {
      return { ok: false, errors: ['이 컴퓨터에서는 키를 안전하게 저장할 수 없습니다.'] }
    }
    try {
      d.update(next) // 저장에 실패하면 메모리 상태도 그대로다
    } catch {
      return { ok: false, errors: ['설정을 저장하지 못했습니다.'] }
    }
    d.setOpenAtLogin(next.settings.openAtLogin)
    void d.collectFresh() // 수집 중이면 끝난 뒤 새 프로필로 한 번 더 돈다
    return { ok: true }
  })

  ipcMain.handle('takeNew', () => {
    if (!d.windowVisible()) return []
    const { state, groups } = takeNew(d.getState(), new Date().toISOString())
    if (groups.length > 0) d.update(state) // 받은 것이 없으면 파일을 다시 쓰지 않는다
    return groups
  })

  ipcMain.handle('windowVisible', () => d.windowVisible())
  ipcMain.handle('getPast', () => pastItems(d.getState(), 100))
  ipcMain.handle('getSaved', () => savedItems(d.getState()))
  ipcMain.handle('setSaved', (_e, id: unknown, saved: unknown) => {
    if (typeof saved === 'boolean') patchItem(id, { saved })
  })
  ipcMain.handle('hide', (_e, id: unknown) => {
    if (typeof id !== 'string') return
    const s = d.getState()
    const next = hideItem(s, id)
    if (next !== s) d.update(next)
  })
  ipcMain.handle('refresh', () => d.collectNow())

  ipcMain.handle('openItem', async (_e, id: unknown) => {
    const items = d.getState().items
    if (typeof id !== 'string' || !Object.hasOwn(items, id)) return
    const { url } = items[id]
    if (isHttpUrl(url)) await shell.openExternal(new URL(url).href)
  })

  ipcMain.handle('openHelp', async (_e, which: unknown) => {
    if (which === 'openalex-key') await shell.openExternal('https://openalex.org/settings/api')
  })

  ipcMain.handle('testNotification', () => d.testNotification())

  ipcMain.handle('previewBoard', async (_e, url: unknown): Promise<PreviewResult> => {
    if (typeof url !== 'string' || !isHttpUrl(url))
      return { ok: false, error: '주소는 http:// 또는 https://로 시작해야 합니다.' }
    let posts: Post[]
    try {
      posts = await readPosts(url, d.fetchText)
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    if (posts.length === 0) return { ok: false, error: '글 목록을 찾지 못했습니다' }
    const ms = (p: Post): number => Date.parse(p.date ?? '')
    const dated = posts.every((p) => p.date !== null)
    const shown = dated ? [...posts].sort((a, b) => ms(b) - ms(a)) : posts
    return { ok: true, posts: shown.slice(0, 5).map(({ title, date }) => ({ title, date })) }
  })

  ipcMain.handle('addBoard', (_e, input: unknown): BoardResult => {
    const s = d.getState()
    const v = validateBoard(input, s.boards)
    if (!v.ok) return v
    try {
      d.update({ ...s, boards: [...s.boards, v.board] })
    } catch {
      return { ok: false, error: '설정을 저장하지 못했습니다.' }
    }
    void d.collectFresh() // 수집 중이면 끝난 뒤 새 게시판까지 한 번 더 돈다
    return { ok: true }
  })

  // 이미 모은 항목은 남긴다.
  ipcMain.handle('removeBoard', (_e, id: unknown) => {
    const s = d.getState()
    if (typeof id !== 'string' || !s.boards.some((b) => b.id === id)) return
    const boardKnown = { ...s.boardKnown }
    delete boardKnown[id]
    d.update({ ...s, boards: s.boards.filter((b) => b.id !== id), boardKnown })
  })
}
