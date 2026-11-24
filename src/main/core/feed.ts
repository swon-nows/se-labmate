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

export function pastItems(state: AppState, limit: number): Item[] {
  return Object.values(state.items)
    .filter((i) => i.seenAt !== null && isVisible(i, state.settings))
    .sort(
      (a, b) => Date.parse(b.seenAt as string) - Date.parse(a.seenAt as string) || byDateDesc(a, b)
    )
    .slice(0, limit)
}

export function savedItems(state: AppState): Item[] {
  return Object.values(state.items)
    .filter((i) => i.saved)
    .sort(byDateDesc)
}

export function unseenCounts(state: AppState): Partial<Record<Category, number>> {
  const counts: Partial<Record<Category, number>> = {}
  for (const i of unseen(state)) counts[i.category] = (counts[i.category] ?? 0) + 1
  return counts
}
