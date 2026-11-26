import { BUILTIN_BOARDS, FIXED_SOURCE_NAMES } from '../../shared/sources'
import { BOARD_CATEGORIES, CATEGORIES, MAX_BOARDS, MAX_REPO_COUNT } from '../../shared/types'
import type {
  AppState,
  Board,
  BoardCategory,
  Profile,
  SaveInput,
  Settings
} from '../../shared/types'
import { boardId } from './boards/index'
import { cleanKeywords, isHttpUrl } from './text'

const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/

export function validateProfile(input: {
  profile: Profile
  settings: Settings
}): { ok: true; profile: Profile; settings: Settings } | { ok: false; errors: string[] } {
  const keywordsEn = cleanKeywords(input.profile.keywordsEn)
  const keywordsKo = cleanKeywords(input.profile.keywordsKo)
  const errors: string[] = []
  if (keywordsEn.length === 0) errors.push('Keywords (English)를 1개 이상 입력해 주십시오.')
  if (!TIME_FORMAT.test(input.settings.notifyTime))
    errors.push('Notify at은 00:00~23:59 형식이어야 합니다.')
  const n = input.settings.repoCount
  if (!Number.isInteger(n) || n < 1 || n > MAX_REPO_COUNT)
    errors.push(`Trending repos는 1~${MAX_REPO_COUNT} 사이의 정수여야 합니다.`)
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    profile: { ...input.profile, keywordsEn, keywordsKo },
    settings: input.settings
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isStrings = (v: unknown): boolean => Array.isArray(v) && v.every((s) => typeof s === 'string')

// IPC로 들어온 값의 모양만 본다. 내용 검사는 validateProfile이 한다.
export function isSaveInput(x: unknown): x is SaveInput {
  if (!isObject(x) || !isObject(x.profile) || !isObject(x.settings)) return false
  const { profile: p, settings: s, openAlexKey: k } = x
  const enabled = s.enabled
  return (
    isStrings(p.keywordsEn) &&
    isStrings(p.keywordsKo) &&
    (p.country === 'KR' || p.country === 'OTHER') &&
    typeof s.notifyTime === 'string' &&
    typeof s.openAtLogin === 'boolean' &&
    typeof s.repoCount === 'number' &&
    isObject(enabled) &&
    CATEGORIES.every((c) => typeof enabled[c] === 'boolean') &&
    (k === undefined || k === null || typeof k === 'string')
  )
}

// 키: undefined면 저장된 키 유지, null이나 공백뿐이면 삭제, 그 밖은 앞뒤 공백을 떼고 encrypt한 값.
// 처음 만든 프로필이면 오늘 일정은 이미 돈 것으로 친다(저장 직후 바로 수집하므로).
export function applyProfile(
  state: AppState,
  input: SaveInput,
  encrypt: (key: string) => string,
  now: string
): AppState {
  const key = input.openAlexKey === null ? '' : input.openAlexKey?.trim()
  const { keywordsEn, keywordsKo, country } = input.profile
  const { notifyTime, openAtLogin, enabled, repoCount } = input.settings
  // 렌더러가 보낸 그 밖의 키는 저장하지 않는다.
  return {
    ...state,
    profile: { keywordsEn, keywordsKo, country },
    settings: {
      notifyTime,
      openAtLogin,
      enabled: Object.fromEntries(CATEGORIES.map((c) => [c, enabled[c]])) as Settings['enabled'],
      repoCount
    },
    openAlexKeyEnc: key === undefined ? state.openAlexKeyEnc : key === '' ? null : encrypt(key),
    lastDailyRunAt: state.profile === null ? now : state.lastDailyRunAt
  }
}

const sameList = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((k, i) => k === b[i])

// 수집 결과를 바꾸는 값이 달라졌는가. 알림 시각과 로그인 시 열기는 수집과 무관하다.
export function needsCollect(before: AppState, next: AppState): boolean {
  const { profile: p, settings: s } = before
  if (p === null || next.profile === null) return true
  return (
    !sameList(p.keywordsEn, next.profile.keywordsEn) ||
    !sameList(p.keywordsKo, next.profile.keywordsKo) ||
    p.country !== next.profile.country ||
    CATEGORIES.some((c) => s.enabled[c] !== next.settings.enabled[c]) ||
    s.repoCount !== next.settings.repoCount ||
    before.openAlexKeyEnc !== next.openAlexKeyEnc
  )
}

const RESERVED_NAMES = [...FIXED_SOURCE_NAMES, ...BUILTIN_BOARDS.map((b) => b.name)]

// 출처 이름은 오류 표시의 키라서 겹치면 안 된다.
export function validateBoard(
  input: unknown,
  boards: Board[]
): { ok: true; board: Board } | { ok: false; error: string } {
  if (
    !isObject(input) ||
    typeof input.name !== 'string' ||
    typeof input.url !== 'string' ||
    !BOARD_CATEGORIES.includes(input.category as BoardCategory)
  )
    return { ok: false, error: '입력 형식이 올바르지 않습니다.' }
  const name = input.name.replace(/\s+/g, ' ').trim()
  if (name === '' || [...name].length > 30)
    return { ok: false, error: '이름을 1~30자로 입력해 주십시오.' }
  const url = input.url.trim()
  if (!isHttpUrl(url) || url.length > 500)
    return { ok: false, error: '주소는 http:// 또는 https://로 시작해야 합니다.' }
  if (boards.length >= MAX_BOARDS)
    return { ok: false, error: `게시판은 ${MAX_BOARDS}개까지 등록할 수 있습니다.` }
  if (RESERVED_NAMES.includes(name) || boards.some((b) => b.name === name))
    return { ok: false, error: '이미 쓰고 있는 이름입니다.' }
  const href = new URL(url).href
  if ([...boards, ...BUILTIN_BOARDS].some((b) => b.url === href))
    return { ok: false, error: '이미 등록된 주소입니다.' }
  return {
    ok: true,
    board: { id: boardId(href), name, url: href, category: input.category as BoardCategory }
  }
}
