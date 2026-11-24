import { defaultState } from '../src/main/store'
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
  const d = defaultState()
  return {
    ...d,
    ...rest,
    settings: {
      ...d.settings,
      ...rest.settings,
      enabled: { ...d.settings.enabled, ...rest.settings?.enabled, ...enabled }
    }
  }
}
