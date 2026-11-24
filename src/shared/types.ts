export type Category = 'paper' | 'repo' | 'news' | 'grant' | 'conference' | 'school'
export const CATEGORIES: Category[] = ['paper', 'repo', 'news', 'grant', 'conference', 'school']
export const ACTIVE_CATEGORIES: Category[] = ['paper', 'repo', 'news'] // 1단계
export const CATEGORY_LABEL: Record<Category, string> = {
  paper: '논문',
  repo: '저장소',
  news: '뉴스',
  grant: '과제 공고',
  conference: '학회',
  school: '학교 공지'
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
}
export interface Item extends RawItem {
  matched: string[]
  collectedAt: string
  seenAt: string | null
  saved: boolean
  hidden: boolean
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
}
export interface AppState {
  version: 1
  profile: Profile | null
  settings: Settings
  openAlexKeyEnc: string | null // safeStorage로 암호화한 값의 base64
  items: Record<string, Item>
  lastDailyRunAt: string | null
  lastNotifiedAt: string | null
  sourceErrors: Record<string, string> // 출처 이름 → 마지막 실패 메시지
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
export interface PublicState {
  profile: Profile | null
  settings: Settings
  hasOpenAlexKey: boolean
  status: CollectStatus
}
export interface SaveInput {
  profile: Profile
  settings: Settings
  openAlexKey?: string | null
} // undefined 유지, null 삭제
export type SaveResult = { ok: true } | { ok: false; errors: string[] }
