import type { AppState, Category, Item, RawItem } from '../src/shared/types'

export const NOW = '2026-11-24T03:00:00.000Z'

export function raw(p: Partial<RawItem> = {}): RawItem {
  return {
    id: 'paper:x',
    category: 'paper',
    source: 'test',
    title: 'title',
    url: 'https://example.com/x',
    date: NOW,
    summary: '',
    ...p
  }
}

export function mk(p: Partial<Item> = {}): Item {
  return {
    ...raw(),
    matched: [],
    collectedAt: NOW,
    seenAt: null,
    saved: false,
    hidden: false,
    ...p
  }
}

export function st(
  p: Partial<AppState> & { enabled?: Partial<Record<Category, boolean>> } = {}
): AppState {
  const { enabled, ...rest } = p
  return {
    version: 1,
    profile: null,
    openAlexKeyEnc: null,
    items: {},
    lastDailyRunAt: null,
    lastNotifiedAt: null,
    sourceErrors: {},
    ...rest,
    settings: {
      notifyTime: '09:00',
      openAtLogin: true,
      ...rest.settings,
      enabled: {
        paper: true,
        repo: true,
        news: true,
        grant: true,
        conference: true,
        school: true,
        ...rest.settings?.enabled,
        ...enabled
      }
    }
  }
}
