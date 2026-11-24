import { ipcMain, safeStorage, shell } from 'electron'
import type { AppState, CollectStatus, Item, PublicState, SaveResult } from '../shared/types'
import { pastItems, savedItems, takeNew } from './core/feed'
import { applyProfile, isSaveInput, validateProfile } from './core/profile'
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
      status: d.status()
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
    d.update(state)
    return groups
  })

  ipcMain.handle('getPast', () => pastItems(d.getState(), 100))
  ipcMain.handle('getSaved', () => savedItems(d.getState()))
  ipcMain.handle('setSaved', (_e, id: unknown, saved: unknown) => {
    if (typeof saved === 'boolean') patchItem(id, { saved })
  })
  ipcMain.handle('hide', (_e, id: unknown) => patchItem(id, { hidden: true }))
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
}
