import type { Board, Category, ConferenceField, Profile, Settings } from './types'

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

// notices: 일반 공지가 섞인 게시판(제목으로 학회 행사 글만 남긴다). calendar: 날짜가 행사일인 일정 목록(처음 읽을 때 다가오는 행사를 보인다).
export interface FieldBoard extends Board {
  field: ConferenceField
  kr: boolean // 국내 학회 게시판: Region이 Korea일 때만 읽는다
  kind: 'notices' | 'calendar'
  prefix?: string // 목록이 제목 앞에 붙이는 분류 이름. 떼고 보인다
}

export const FIELD_BOARDS: FieldBoard[] = [
  {
    id: 'conf-kaia',
    name: '한국인공지능학회',
    url: 'https://aiassociation.kr/Board/Board.asp?b_Cate=BBS1',
    category: 'conference',
    field: 'ai',
    kr: true,
    kind: 'notices'
  },
  {
    id: 'conf-aik',
    name: '대한건축학회',
    url: 'https://www.aik.or.kr/board/?_0000_method=list&ncode=a001&category=02',
    category: 'conference',
    field: 'structural',
    kr: true,
    kind: 'notices',
    prefix: '학술행사'
  },
  {
    id: 'conf-kssc',
    name: '한국강구조학회',
    url: 'https://www.kssc.or.kr/welcome.do',
    category: 'conference',
    field: 'structural',
    kr: true,
    kind: 'notices'
  },
  {
    id: 'conf-kci',
    name: '한국콘크리트학회',
    url: 'https://www.kci.or.kr/board/?ncode=a001',
    category: 'conference',
    field: 'structural',
    kr: true,
    kind: 'notices'
  },
  {
    id: 'conf-coseik',
    name: '한국전산구조공학회',
    url: 'https://www.coseik.or.kr/boards/notice/news/notice/',
    category: 'conference',
    field: 'structural',
    kr: true,
    kind: 'notices'
  },
  {
    id: 'conf-eesk',
    name: '한국지진공학회',
    url: 'https://www.eesk.or.kr/boards/notice/board/notice/',
    category: 'conference',
    field: 'structural',
    kr: true,
    kind: 'notices'
  },
  {
    id: 'conf-ksmi',
    name: '한국구조물진단유지관리공학회',
    url: 'https://www.ksmi.or.kr/board/?ncode=a001',
    category: 'conference',
    field: 'structural',
    kr: true,
    kind: 'notices'
  },
  {
    id: 'conf-kasss',
    name: '한국공간구조학회',
    url: 'https://www.kasss.or.kr/sub_notice/list.php?board_name=notice01',
    category: 'conference',
    field: 'structural',
    kr: true,
    kind: 'notices'
  },
  {
    id: 'conf-ksce',
    name: '대한토목학회',
    url: 'https://www.ksce.or.kr/not/default.asp?gbn=6&htop=MN0031&ctop=MN0048&ptop=MN0031',
    category: 'conference',
    field: 'structural',
    kr: true,
    kind: 'notices'
  },
  {
    id: 'conf-fib',
    name: 'fib',
    url: 'https://www.fib-international.org/events.html?format=feed&type=rss',
    category: 'conference',
    field: 'structural',
    kr: false,
    kind: 'calendar'
  },
  {
    id: 'conf-eeri',
    name: 'EERI',
    url: 'https://www.eeri.org/feeds/news.xml',
    category: 'conference',
    field: 'structural',
    kr: false,
    kind: 'notices'
  }
]
export const ALL_BUILTIN_BOARDS: Board[] = [...BUILTIN_BOARDS, ...FIELD_BOARDS]

// 게시판이 아닌 출처의 이름. 사용자 게시판 이름이 이것과 겹치면 안 된다.
export const FIXED_SOURCE_NAMES = [
  'OpenAlex',
  'arXiv',
  'GitHub',
  'Google News (KO)',
  'Google News (EN)',
  'CCF Deadlines'
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
  const fields = settings.conferenceFields
  const fieldBoards = FIELD_BOARDS.filter(
    (b) =>
      fields.includes(b.field) &&
      (kr || !b.kr) &&
      // 사용자가 같은 게시판을 이미 등록했으면 겹치지 않게 뺀다.
      !boards.some((u) => u.url === b.url || u.name === b.name)
  )
  const all: (Source | false)[] = [
    hasOpenAlexKey && { name: 'OpenAlex', category: 'paper' },
    { name: 'arXiv', category: 'paper' },
    { name: 'GitHub', category: 'repo' },
    kr && profile.keywordsKo.length > 0 && { name: 'Google News (KO)', category: 'news' },
    { name: 'Google News (EN)', category: 'news' },
    fields.includes('ai') && { name: 'CCF Deadlines', category: 'conference' },
    ...[...(kr ? BUILTIN_BOARDS : []), ...fieldBoards, ...boards].map((board) => ({
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

// 켜진 출처가 하나 이상이고, 그 모두가 닿지 못해 실패했는가(fetch-text의 고정 문구). 사이트가 바뀐 실패는 넣지 않는다.
export const allUnreachable = (names: string[], errors: Record<string, string>): boolean =>
  names.length > 0 &&
  names.every(
    (n) =>
      Object.hasOwn(errors, n) && (errors[n] === '네트워크 오류' || errors[n] === '요청 시간 초과')
  )

// 설정의 출처 상태에 보일 글. 사용자가 할 일이 있는 오류만 바꾸고, 그 밖은 메시지 그대로.
export function sourceErrorText(name: string, message: string): string {
  if (name === 'OpenAlex' && (message === 'HTTP 401' || message === 'HTTP 403'))
    return '키가 올바르지 않습니다. Settings에서 키를 확인해 주십시오.'
  if (name === 'GitHub' && (message === 'HTTP 403' || message === 'HTTP 429'))
    return '요청 한도를 넘었습니다. 다음 수집 때 다시 시도합니다.'
  return message
}
