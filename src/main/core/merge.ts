import { BUILTIN_BOARDS } from '../../shared/sources'
import type { AppState, Category, Item, RawItem } from '../../shared/types'
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

const KEEP_SEEN = 100 // Past가 카테고리마다 보여 주는 개수

// 날짜가 있는 출처는 mergeIncoming이 90일보다 오래된 항목을 받지 않아 그런 본 항목은 지워도 돌아오지 않는다(90일 뒤 다시 뜨는 저장소는 새로 보인다). 카테고리마다 최근 100건은 Past가 보여 주므로 남긴다. 게시판 글(날짜 없으면 수집 시각)을 막는 것은 boardKnown이다.
export function pruneOld(items: Record<string, Item>, now: string): Record<string, Item> {
  const t = Date.parse(now)
  const collected = t - 180 * 86_400_000
  const dated = t - MAX_AGE_DAYS * 86_400_000
  const taken: Partial<Record<Category, number>> = {}
  const recent = new Set(
    Object.values(items)
      .filter((i) => i.seenAt !== null)
      .sort(
        (a, b) =>
          Date.parse(b.seenAt as string) - Date.parse(a.seenAt as string) ||
          Date.parse(b.date) - Date.parse(a.date)
      )
      .filter((i) => (taken[i.category] = (taken[i.category] ?? 0) + 1) <= KEEP_SEEN)
      .map((i) => i.id)
  )
  return Object.fromEntries(
    Object.entries(items).filter(
      ([, i]) =>
        i.seenAt === null ||
        i.saved ||
        !(
          Date.parse(i.collectedAt) < collected ||
          (Date.parse(i.date) < dated && !recent.has(i.id))
        )
    )
  )
}

// 수집은 몇 초 걸린다. 그동안 확인·저장·숨김으로 바뀐 live 항목을 덮지 않도록 새 id만 더한다.
export function applyCollected(live: AppState, collected: AppState, now: string): AppState {
  const items = { ...live.items }
  for (const [id, item] of Object.entries(collected.items))
    if (!Object.hasOwn(items, id)) items[id] = item
  // 수집 중에 지운 게시판의 기록이 되살아나지 않도록 live에 있는 게시판의 것만 남긴다.
  const ids = new Set([...live.boards, ...BUILTIN_BOARDS].map((b) => b.id))
  return {
    ...live,
    items: pruneOld(items, now),
    sourceErrors: collected.sourceErrors,
    boardKnown: Object.fromEntries(
      Object.entries(collected.boardKnown).filter(([id]) => ids.has(id))
    )
  }
}
