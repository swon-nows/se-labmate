import type { Item } from '../../shared/types'
import { matchKeywords } from './text'

export function score(item: Item, now: Date): number {
  // 한 주 인기 저장소는 이번 주에 받은 별 순서
  if (item.weekStars !== undefined) return item.weekStars
  const titleHits = matchKeywords(item.title, item.matched).length
  const ageDays = Math.max(0, (now.getTime() - Date.parse(item.date)) / 86_400_000)
  return (
    3 * titleHits +
    (item.matched.length - titleHits) +
    2 * Math.max(0, 1 - ageDays / 30) +
    (item.stars === undefined ? 0 : Math.min(2, Math.log10(item.stars + 1)))
  )
}
