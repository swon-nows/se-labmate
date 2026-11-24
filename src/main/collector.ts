import type { AppState, RawItem } from '../shared/types'
import { mergeIncoming, pruneOld } from './core/merge'
import { buildArxivUrl, parseArxiv } from './core/sources/arxiv'
import { buildGithubUrls, parseGithub } from './core/sources/github'
import { buildGnewsUrl, parseGnews } from './core/sources/gnews'
import { buildOpenAlexUrl, parseOpenAlex } from './core/sources/openalex'

export interface CollectDeps {
  fetchText(url: string, headers?: Record<string, string>): Promise<string>
  now(): Date
  openAlexKey: string | null
}

const GITHUB_HEADERS = { Accept: 'application/vnd.github+json', 'User-Agent': 'research-assistant' }

export async function collect(state: AppState, deps: CollectDeps): Promise<AppState> {
  const { profile } = state
  if (!profile) return state
  const { keywordsEn: en, keywordsKo: ko } = profile
  const { enabled } = state.settings
  const key = deps.openAlexKey ?? ''
  const now = deps.now()
  const nowIso = now.toISOString()

  const incoming: RawItem[] = []
  const sourceErrors = { ...state.sourceErrors }
  // 출처 하나가 던져도 나머지는 계속한다. 출처는 await로 하나씩 차례로 돌린다.
  // 건너뛴 출처(on이 false)는 요청하지 않고, 그 출처의 옛 오류도 지운다.
  const run = async (name: string, on: boolean, job: () => Promise<RawItem[]>): Promise<void> => {
    if (!on) {
      delete sourceErrors[name]
      return
    }
    try {
      incoming.push(...(await job()))
      delete sourceErrors[name]
    } catch (e) {
      sourceErrors[name] = e instanceof Error ? e.message : String(e)
    }
  }

  await run('OpenAlex', enabled.paper && key !== '', async () =>
    parseOpenAlex(await deps.fetchText(buildOpenAlexUrl(en, now, key)))
  )
  await run('arXiv', enabled.paper, async () => parseArxiv(await deps.fetchText(buildArxivUrl(en))))
  await run('GitHub', enabled.repo, async () => {
    const out: RawItem[] = []
    for (const url of buildGithubUrls(en, now))
      out.push(...parseGithub(await deps.fetchText(url, GITHUB_HEADERS)))
    return out
  })
  await run(
    'Google 뉴스(한국어)',
    enabled.news && profile.country === 'KR' && ko.length > 0,
    async () => parseGnews(await deps.fetchText(buildGnewsUrl(ko, 'ko')))
  )
  await run('Google 뉴스(영문)', enabled.news, async () =>
    parseGnews(await deps.fetchText(buildGnewsUrl(en, 'en')))
  )

  return {
    ...state,
    items: pruneOld(mergeIncoming(state.items, incoming, [...en, ...ko], nowIso), nowIso),
    sourceErrors
  }
}
