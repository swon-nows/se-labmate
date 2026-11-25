import type { AppState, Item, RawItem } from '../../shared/types'
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
  const added = new Set<string>()
  for (const r of incoming) {
    if (added.has(r.id)) {
      // 같은 수집의 중복: OpenAlex에는 초록이 없고 arXiv에는 있는 논문처럼, 먼저 온 것의 빈 값만 채운다.
      const a = out[r.id]
      const f = {
        ...a,
        summary: a.summary || r.summary,
        venue: a.venue ?? r.venue,
        keywords: a.keywords ?? r.keywords
      }
      out[r.id] = { ...f, matched: matchKeywords(`${f.title} ${f.summary}`, keywords) }
      continue
    }
    if (Object.hasOwn(out, r.id) || Date.parse(r.date) < oldest) continue
    added.add(r.id)
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

// 수집은 몇 초 걸린다. 그동안 확인·저장·숨김으로 바뀐 live 항목을 덮지 않도록 새 id만 더한다.
export function applyCollected(live: AppState, collected: AppState, now: string): AppState {
  const items = { ...live.items }
  for (const [id, item] of Object.entries(collected.items))
    if (!Object.hasOwn(items, id)) items[id] = item
  return {
    ...live,
    items: pruneOld(items, now),
    sourceErrors: collected.sourceErrors,
    boardKnown: collected.boardKnown
  }
}
