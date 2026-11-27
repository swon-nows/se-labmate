import { FIELD_BOARDS, GEEKNEWS_URL, activeSources } from '../shared/sources'
import type { AppState, RawItem } from '../shared/types'
import { isEventTitle } from './core/boards/events'
import { readBoard } from './core/boards/index'
import type { FetchText } from './core/fetch-text'
import { mergeIncoming, pruneOld } from './core/merge'
import { buildArxivUrl, parseArxiv } from './core/sources/arxiv'
import { DEADLINES_URL, parseDeadlines } from './core/sources/deadlines'
import { parseGeekNews } from './core/sources/geeknews'
import { GITHUB_TRENDING_URL, parseTrending } from './core/sources/github'
import { buildGnewsUrl, parseGnews } from './core/sources/gnews'
import { buildOpenAlexUrl, parseOpenAlex } from './core/sources/openalex'

export interface CollectDeps {
  fetchText: FetchText
  now(): Date
  openAlexKey: string | null
}

export async function collect(state: AppState, deps: CollectDeps): Promise<AppState> {
  const { profile } = state
  if (!profile) return state
  const { keywordsEn: en, keywordsKo: ko } = profile
  const key = deps.openAlexKey ?? ''
  const now = deps.now()
  const nowIso = now.toISOString()
  const sources = activeSources(profile, state.settings, key !== '', state.boards)
  const on = new Set(sources.map((s) => s.name))

  // 꺼진 출처·지운 게시판·옛 이름의 오류는 지운다.
  const sourceErrors = Object.fromEntries(
    Object.entries(state.sourceErrors).filter(([name]) => on.has(name))
  )
  const boardKnown = { ...state.boardKnown }
  // 출처 하나가 던져도 나머지는 계속한다. 출처는 한꺼번에 시작한다. 꺼진 출처는 요청하지 않는다.
  const run = async (name: string, job: () => Promise<RawItem[]>): Promise<RawItem[]> => {
    if (!on.has(name)) return []
    try {
      const got = await job()
      delete sourceErrors[name]
      return got
    } catch (e) {
      sourceErrors[name] = e instanceof Error ? e.message : String(e)
      return []
    }
  }

  const runs = [
    run('OpenAlex', async () =>
      parseOpenAlex(await deps.fetchText(buildOpenAlexUrl(en, now, key)))
    ),
    run('arXiv', async () => parseArxiv(await deps.fetchText(buildArxivUrl(en)))),
    run('GitHub', async () =>
      parseTrending(await deps.fetchText(GITHUB_TRENDING_URL), now, state.settings.repoCount)
    ),
    run('Google News (KO)', async () => parseGnews(await deps.fetchText(buildGnewsUrl(ko, 'ko')))),
    run('Google News (EN)', async () => parseGnews(await deps.fetchText(buildGnewsUrl(en, 'en')))),
    run('GeekNews', async () => parseGeekNews(await deps.fetchText(GEEKNEWS_URL), now)),
    run('CCF Deadlines', async () =>
      parseDeadlines(await deps.fetchText(DEADLINES_URL), now, ['AI'])
    )
  ]
  for (const { name, board } of sources)
    if (board) {
      const { kind, prefix } = FIELD_BOARDS.find((f) => f.id === board.id) ?? {}
      // 목록이 제목 앞에 붙인 분류 이름은 떼고 나서 제목을 본다(붙은 채로는 모든 글이 행사 글로 읽힌다).
      const bare = (i: RawItem): RawItem =>
        prefix && i.title.startsWith(prefix + ' ')
          ? { ...i, title: i.title.slice(prefix.length + 1) }
          : i
      runs.push(
        run(name, async () => {
          const read = await readBoard(
            board,
            deps.fetchText,
            boardKnown[board.id],
            now,
            kind === 'calendar'
          )
          boardKnown[board.id] = read.known // 실패하면 이 줄에 오지 않아 본 글이 그대로 남는다
          // 거른 글도 읽은 글이다(known에 있다): 다음에 다시 새 글로 오지 않는다.
          return kind === 'notices'
            ? read.fresh.map(bare).filter((i) => isEventTitle(i.title))
            : read.fresh
        })
      )
    }
  // 같은 id는 먼저 온 것이 남으므로 끝나는 순서가 아니라 위의 순서대로 잇는다.
  const incoming = (await Promise.all(runs)).flat()

  return {
    ...state,
    items: pruneOld(mergeIncoming(state.items, incoming, [...en, ...ko], nowIso), nowIso),
    sourceErrors,
    boardKnown
  }
}
