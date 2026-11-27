import type { Item } from '../../shared/types'
import { matchKeywords } from './text'

export function score(item: Item, now: Date): number {
  // 한 주 인기 저장소는 이번 주에 받은 별 순서
  if (item.weekStars !== undefined) return item.weekStars
  const titleHits = matchKeywords(item.title, item.matched).length
  const days = (now.getTime() - Date.parse(item.date)) / 86_400_000
  // 지난 날짜는 30일에 걸쳐, 앞날(행사일)은 가까운 행사일수록 위에 오게 1년에 걸쳐 줄인다.
  const recency = days >= 0 ? Math.max(0, 1 - days / 30) : Math.max(0, 1 + days / 365)
  return (
    3 * titleHits +
    (item.matched.length - titleHits) +
    2 * recency +
    (item.stars === undefined ? 0 : Math.min(2, Math.log10(item.stars + 1)))
  )
}
