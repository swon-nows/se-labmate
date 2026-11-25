import { activeSources } from '../shared/sources'
import type { AppState, RawItem } from '../shared/types'
import { readBoard } from './core/boards/index'
import type { FetchText } from './core/fetch-text'
import { mergeIncoming, pruneOld } from './core/merge'
import { buildArxivUrl, parseArxiv } from './core/sources/arxiv'
import { buildGithubUrls, parseGithub } from './core/sources/github'
import { buildGnewsUrl, parseGnews } from './core/sources/gnews'
import { buildOpenAlexUrl, parseOpenAlex } from './core/sources/openalex'

export interface CollectDeps {
  fetchText: FetchText
  now(): Date
  openAlexKey: string | null
}

const GITHUB_HEADERS = { Accept: 'application/vnd.github+json', 'User-Agent': 'research-assistant' }

export async function collect(state: AppState, deps: CollectDeps): Promise<AppState> {
  const { profile } = state
  if (!profile) return state
  const { keywordsEn: en, keywordsKo: ko } = profile
  const key = deps.openAlexKey ?? ''
  const now = deps.now()
  const nowIso = now.toISOString()
  const sources = activeSources(profile, state.settings, key !== '', state.boards)
  const on = new Set(sources.map((s) => s.name))

  const incoming: RawItem[] = []
  // 꺼진 출처·지운 게시판·옛 이름의 오류는 지운다.
  const sourceErrors = Object.fromEntries(
    Object.entries(state.sourceErrors).filter(([name]) => on.has(name))
  )
  const boardKnown = { ...state.boardKnown }
  // 출처 하나가 던져도 나머지는 계속한다. 출처는 await로 하나씩 차례로 돌린다. 꺼진 출처는 요청하지 않는다.
  const run = async (name: string, job: () => Promise<RawItem[]>): Promise<void> => {
    if (!on.has(name)) return
    try {
      incoming.push(...(await job()))
      delete sourceErrors[name]
    } catch (e) {
      sourceErrors[name] = e instanceof Error ? e.message : String(e)
    }
  }

  await run('OpenAlex', async () =>
    parseOpenAlex(await deps.fetchText(buildOpenAlexUrl(en, now, key)))
  )
  await run('arXiv', async () => parseArxiv(await deps.fetchText(buildArxivUrl(en))))
  await run('GitHub', async () => {
    const out: RawItem[] = []
    for (const url of buildGithubUrls(en, now))
      out.push(...parseGithub(await deps.fetchText(url, GITHUB_HEADERS)))
    return out
  })
  await run('Google News (KO)', async () =>
    parseGnews(await deps.fetchText(buildGnewsUrl(ko, 'ko')))
  )
  await run('Google News (EN)', async () =>
    parseGnews(await deps.fetchText(buildGnewsUrl(en, 'en')))
  )
  for (const { name, board } of sources)
    if (board)
      await run(name, async () => {
        const read = await readBoard(board, deps.fetchText, boardKnown[board.id], now)
        boardKnown[board.id] = read.known // 실패하면 이 줄에 오지 않아 본 글이 그대로 남는다
        return read.fresh
      })

  return {
    ...state,
    items: pruneOld(mergeIncoming(state.items, incoming, [...en, ...ko], nowIso), nowIso),
    sourceErrors,
    boardKnown
  }
}
