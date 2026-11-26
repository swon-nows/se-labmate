import { CATEGORIES } from '../../shared/types'
import type { AppState, Category, FeedGroup, Item, Settings } from '../../shared/types'
import { score } from './relevance'

export function isVisible(item: Item, settings: Settings): boolean {
  return !item.hidden && settings.enabled[item.category]
}

const byDateDesc = (a: Item, b: Item): number => Date.parse(b.date) - Date.parse(a.date)

const unseen = (state: AppState): Item[] =>
  Object.values(state.items).filter((i) => i.seenAt === null && isVisible(i, state.settings))

export function takeNew(state: AppState, now: string): { state: AppState; groups: FeedGroup[] } {
  const at = new Date(now)
  const fresh = unseen(state)
  const groups = CATEGORIES.map((category) => ({
    category,
    items: fresh
      .filter((i) => i.category === category)
      .sort((a, b) => score(b, at) - score(a, at) || byDateDesc(a, b))
  })).filter((g) => g.items.length > 0)
  const items = { ...state.items }
  for (const g of groups) for (const i of g.items) items[i.id] = { ...i, seenAt: now }
  return { state: { ...state, items }, groups }
}

// limit은 카테고리마다 따로 센다: 화면이 카테고리 묶음이라, 한 카테고리가 많아도 다른 카테고리의 지난 소식이 밀려나지 않는다.
export function pastItems(state: AppState, limit: number): Item[] {
  const taken: Partial<Record<Category, number>> = {}
  return Object.values(state.items)
    .filter((i) => i.seenAt !== null && isVisible(i, state.settings))
    .sort(
      (a, b) => Date.parse(b.seenAt as string) - Date.parse(a.seenAt as string) || byDateDesc(a, b)
    )
    .filter((i) => (taken[i.category] = (taken[i.category] ?? 0) + 1) <= limit)
}

// 지난 소식이 있는가. 목록을 만들어 보내지 않고 있는지만 묻는다.
export function hasPast(state: AppState): boolean {
  return Object.values(state.items).some((i) => i.seenAt !== null && isVisible(i, state.settings))
}

export function savedItems(state: AppState): Item[] {
  return Object.values(state.items)
    .filter((i) => i.saved)
    .sort(byDateDesc)
}

// 관심 없음: 숨기면서 저장도 푼다. 저장함은 숨김을 거르지 않으므로 저장이 남으면 다시 나온다.
export function hideItem(state: AppState, id: string): AppState {
  if (!Object.hasOwn(state.items, id)) return state
  const item = { ...state.items[id], hidden: true, saved: false }
  return { ...state, items: { ...state.items, [id]: item } }
}

export function unseenCounts(state: AppState): Partial<Record<Category, number>> {
  const counts: Partial<Record<Category, number>> = {}
  for (const i of unseen(state)) counts[i.category] = (counts[i.category] ?? 0) + 1
  return counts
}
