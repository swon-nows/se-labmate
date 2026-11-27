export type Category = 'paper' | 'repo' | 'news' | 'grant' | 'conference' | 'school'
export const CATEGORIES: Category[] = ['paper', 'repo', 'news', 'grant', 'conference', 'school']
export const CATEGORY_LABEL: Record<Category, string> = {
  paper: 'Papers',
  repo: 'Repos',
  news: 'News',
  grant: 'Grants',
  conference: 'Conferences',
  school: 'School'
}

export interface RawItem {
  id: string // 'paper:<정규화 제목>' | 'repo:<owner/name 소문자>' | 'news:<정규화 제목>:<정규화 언론사>'
  category: Category
  source: string // 'arXiv' | 'OpenAlex' | 'GitHub' | 뉴스는 언론사 이름
  title: string
  url: string
  date: string // ISO 8601
  summary: string // 없으면 ''
  stars?: number
  weekStars?: number // GitHub Trending에서 이번 주에 받은 별
  deadline?: string // 논문 마감 시각(ISO). 학회 마감 목록에서 온 항목에만 있다
  venue?: string // 저널·학회·저장소 이름
  keywords?: string[]
}
export interface Item extends RawItem {
  matched: string[]
  collectedAt: string
  seenAt: string | null
  saved: boolean
  hidden: boolean
}
// 언어마다 저장하는 키워드 수와 사용자가 등록하는 게시판 수(기본 게시판은 세지 않는다). 화면과 main이 함께 쓴다.
export const MAX_KEYWORDS = 8
export const MAX_BOARDS = 10
export const DEFAULT_REPO_COUNT = 10
export const MAX_REPO_COUNT = 25
export type ConferenceField = 'ai' | 'structural'
export const CONFERENCE_FIELDS: ConferenceField[] = ['ai', 'structural']
export const CONFERENCE_FIELD_LABEL: Record<ConferenceField, string> = {
  ai: 'AI',
  structural: 'Structural engineering'
}
export interface Profile {
  keywordsEn: string[]
  keywordsKo: string[]
  country: 'KR' | 'OTHER'
}
export interface Settings {
  notifyTime: string
  openAtLogin: boolean
  enabled: Record<Category, boolean>
  repoCount: number // 한 주 인기 저장소를 몇 개 가져올지
  conferenceFields: ConferenceField[] // 학회 소식을 받을 분야
}
export type BoardCategory = 'grant' | 'conference' | 'school'
export const BOARD_CATEGORIES: BoardCategory[] = ['school', 'conference', 'grant']
export interface Board {
  id: string
  name: string
  url: string
  category: BoardCategory
}
export interface BoardInput {
  name: string
  url: string
  category: BoardCategory
}
export type BoardResult = { ok: true } | { ok: false; error: string }
export type PreviewResult =
  { ok: true; posts: { title: string; date: string | null }[] } | { ok: false; error: string }
export interface AppState {
  version: 2
  profile: Profile | null
  settings: Settings
  openAlexKeyEnc: string | null // safeStorage로 암호화한 값의 base64
  items: Record<string, Item>
  lastDailyRunAt: string | null
  lastNotifiedAt: string | null
  sourceErrors: Record<string, string> // 출처 이름 → 마지막 실패 메시지
  boards: Board[]
  boardKnown: Record<string, string[]> // 게시판 id → 지난번까지 본 글의 id와 주소. 키가 없거나 빈 배열이면 아직 읽은 적 없음
}
export interface FeedGroup {
  category: Category
  items: Item[]
}
export interface CollectStatus {
  running: boolean
  lastFinishedAt: string | null
  errors: Record<string, string>
}
export interface UpdateInfo {
  version: string // 앞의 v를 뺀 새 버전
  url: string // 릴리스 페이지
  phase: 'ready' | 'downloading' | 'failed'
  percent: number | null // 내려받는 중일 때만 0~100
}
export interface PublicState {
  profile: Profile | null
  settings: Settings
  hasOpenAlexKey: boolean
  status: CollectStatus
  boards: Board[]
  update: UpdateInfo | null
}
export interface SaveInput {
  profile: Profile
  settings: Settings
  openAlexKey?: string | null
} // undefined 유지, null 삭제
export type SaveResult = { ok: true } | { ok: false; errors: string[] }
