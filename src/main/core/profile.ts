import { CATEGORIES } from '../../shared/types'
import type { AppState, Profile, SaveInput, Settings } from '../../shared/types'
import { cleanKeywords } from './text'

const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/

export function validateProfile(input: {
  profile: Profile
  settings: Settings
}): { ok: true; profile: Profile; settings: Settings } | { ok: false; errors: string[] } {
  const keywordsEn = cleanKeywords(input.profile.keywordsEn)
  const keywordsKo = cleanKeywords(input.profile.keywordsKo)
  const errors: string[] = []
  if (keywordsEn.length === 0) errors.push('영문 주제 키워드를 1개 이상 입력해 주십시오.')
  if (!TIME_FORMAT.test(input.settings.notifyTime))
    errors.push('알림 시각은 00:00~23:59 형식이어야 합니다.')
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
  const { notifyTime, openAtLogin, enabled } = input.settings
  // 렌더러가 보낸 그 밖의 키는 저장하지 않는다.
  return {
    ...state,
    profile: { keywordsEn, keywordsKo, country },
    settings: {
      notifyTime,
      openAtLogin,
      enabled: Object.fromEntries(CATEGORIES.map((c) => [c, enabled[c]])) as Settings['enabled']
    },
    openAlexKeyEnc: key === undefined ? state.openAlexKeyEnc : key === '' ? null : encrypt(key),
    lastDailyRunAt: state.profile === null ? now : state.lastDailyRunAt
  }
}
