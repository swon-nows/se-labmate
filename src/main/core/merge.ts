import type { Item, RawItem } from '../../shared/types'
import { matchKeywords } from './text'

const MAX_AGE_DAYS = 90

export function mergeIncoming(
  items: Record<string, Item>,
  incoming: RawItem[],
  keywords: string[],
  now: string
): Record<string, Item> {
  const out = { ...items }
  const oldest = Date.parse(now) - MAX_AGE_DAYS * 86_400_000
  for (const r of incoming) {
    if (Object.hasOwn(out, r.id) || Date.parse(r.date) < oldest) continue
    out[r.id] = {
      ...r,
      matched: matchKeywords(`${r.title} ${r.summary}`, keywords),
      collectedAt: now,
      seenAt: null,
      saved: false,
      hidden: false
    }
  }
  return out
}

// mergeIncoming이 90일보다 오래된 항목을 받지 않으므로, 수집 뒤 180일 지나 지운 항목은 다시 들어올 수 없다.
export function pruneOld(items: Record<string, Item>, now: string): Record<string, Item> {
  const cutoff = Date.parse(now) - 180 * 86_400_000
  return Object.fromEntries(
    Object.entries(items).filter(
      ([, i]) => !(i.seenAt !== null && !i.saved && Date.parse(i.collectedAt) < cutoff)
    )
  )
}
