import type { Item, RawItem } from '../../shared/types'
import { matchKeywords } from './text'

export function mergeIncoming(
  items: Record<string, Item>,
  incoming: RawItem[],
  keywords: string[],
  now: string
): Record<string, Item> {
  const out = { ...items }
  for (const r of incoming) {
    if (Object.hasOwn(out, r.id)) continue
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

// 출처의 조회 기간이 최대 90일이라 180일 지난 확인 항목은 다시 새 소식이 되지 않는다.
export function pruneOld(items: Record<string, Item>, now: string): Record<string, Item> {
  const cutoff = Date.parse(now) - 180 * 86_400_000
  return Object.fromEntries(
    Object.entries(items).filter(
      ([, i]) => !(i.seenAt !== null && !i.saved && Date.parse(i.collectedAt) < cutoff)
    )
  )
}
