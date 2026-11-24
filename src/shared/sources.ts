import type { Profile, Settings } from './types'

// 조건은 src/main/collector.ts의 run(...) 호출과 같아야 한다.
export function activeSources(
  profile: Profile,
  settings: Settings,
  hasOpenAlexKey: boolean
): string[] {
  const { paper, repo, news } = settings.enabled
  const ko = news && profile.country === 'KR' && profile.keywordsKo.length > 0
  return [
    paper && hasOpenAlexKey && 'OpenAlex',
    paper && 'arXiv',
    repo && 'GitHub',
    ko && 'Google 뉴스(한국어)',
    news && 'Google 뉴스(영문)'
  ].filter((s): s is string => typeof s === 'string')
}
