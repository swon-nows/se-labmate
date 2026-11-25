import type { Board, Category, Profile, Settings } from './types'

export const BUILTIN_BOARDS: Board[] = [
  {
    id: 'iris',
    name: 'IRIS',
    url: 'https://www.iris.go.kr/contents/retrieveBsnsAncmBtinSituListView.do',
    category: 'grant'
  },
  {
    id: 'nrf',
    name: '한국연구재단',
    url: 'https://www.nrf.re.kr/biz/notice/list?menu_no=362&bizNotGubn=guide',
    category: 'grant'
  }
]

export interface Source {
  name: string
  category: Category
  board?: Board
}

// 켜진 출처의 단 하나의 정의: 수집기·일정 확인·설정 화면이 모두 이것만 본다.
export function activeSources(
  profile: Profile,
  settings: Settings,
  hasOpenAlexKey: boolean,
  boards: Board[]
): Source[] {
  const kr = profile.country === 'KR'
  const all: (Source | false)[] = [
    hasOpenAlexKey && { name: 'OpenAlex', category: 'paper' },
    { name: 'arXiv', category: 'paper' },
    { name: 'GitHub', category: 'repo' },
    kr && profile.keywordsKo.length > 0 && { name: 'Google News (KO)', category: 'news' },
    { name: 'Google News (EN)', category: 'news' },
    ...[...(kr ? BUILTIN_BOARDS : []), ...boards].map((board) => ({
      name: board.name,
      category: board.category,
      board
    }))
  ]
  return all.filter((s): s is Source => s !== false && settings.enabled[s.category])
}

// 켜진 출처가 하나 이상이고, 그 모두에 마지막 수집의 오류가 남아 있는가.
export const allFailed = (sources: string[], errors: Record<string, string>): boolean =>
  sources.length > 0 && sources.every((s) => Object.hasOwn(errors, s))

// 설정의 출처 상태에 보일 글. 사용자가 할 일이 있는 오류만 바꾸고, 그 밖은 메시지 그대로.
export function sourceErrorText(name: string, message: string): string {
  if (name === 'OpenAlex' && (message === 'HTTP 401' || message === 'HTTP 403'))
    return '키가 올바르지 않습니다. Settings에서 키를 확인해 주십시오.'
  if (name === 'GitHub' && (message === 'HTTP 403' || message === 'HTTP 429'))
    return '요청 한도를 넘었습니다. 다음 수집 때 다시 시도합니다.'
  return message
}
