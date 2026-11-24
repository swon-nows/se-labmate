import type { FeedGroup, Item } from '../../shared/types'

// 이번에 창을 연 동안의 새 소식 목록에 새 묶음을 더한다. 화면은 카테고리별로 걸러 보이므로,
// 새 항목을 앞에 두면 카테고리마다 새 묶음이 기존 항목 앞에 온다. 이미 있는 id는 넣지 않는다.
export function mergeBatch(current: Item[], groups: FeedGroup[]): Item[] {
  const ids = new Set(current.map((i) => i.id))
  const fresh: Item[] = []
  for (const g of groups)
    for (const i of g.items)
      if (!ids.has(i.id)) {
        ids.add(i.id)
        fresh.push(i)
      }
  return fresh.length === 0 ? current : [...fresh, ...current]
}
