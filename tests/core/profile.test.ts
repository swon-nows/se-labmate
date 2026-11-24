import { describe, expect, test } from 'vitest'
import { isSaveInput, validateProfile } from '../../src/main/core/profile'
import type { Profile, Settings } from '../../src/shared/types'

const profile: Profile = { keywordsEn: ['xai'], keywordsKo: [], country: 'KR' }
const settings: Settings = {
  notifyTime: '09:00',
  openAtLogin: true,
  enabled: { paper: true, repo: true, news: true, grant: true, conference: true, school: true }
}
const base = { profile, settings }

describe('validateProfile', () => {
  test('영문 키워드가 비어 있으면 거부한다', () => {
    expect(validateProfile({ ...base, profile: { ...base.profile, keywordsEn: ['  '] } })).toEqual({
      ok: false,
      errors: ['영문 주제 키워드를 1개 이상 입력해 주십시오.']
    })
  })
  test('알림 시각 형식이 틀리면 거부한다', () => {
    expect(
      validateProfile({ ...base, settings: { ...base.settings, notifyTime: '25:00' } })
    ).toEqual({ ok: false, errors: ['알림 시각은 00:00~23:59 형식이어야 합니다.'] })
  })
  test('유효한 값은 통과한다', () => {
    expect(validateProfile(base)).toMatchObject({ ok: true })
  })
})

describe('isSaveInput', () => {
  test('올바른 입력은 통과한다', () => {
    expect(isSaveInput(base)).toBe(true)
    expect(isSaveInput({ ...base, openAlexKey: null })).toBe(true)
    expect(isSaveInput({ ...base, openAlexKey: 'k' })).toBe(true)
  })
  const missingPaper: Partial<Settings['enabled']> = { ...settings.enabled }
  delete missingPaper.paper
  test.each([
    ['null', null],
    ['문자열', 'x'],
    ['profile 없음', { settings }],
    ['키워드가 배열이 아님', { ...base, profile: { ...profile, keywordsEn: 'xai' } }],
    ['문자열이 아닌 키워드', { ...base, profile: { ...profile, keywordsKo: [1] } }],
    ['잘못된 국가', { ...base, profile: { ...profile, country: 'JP' } }],
    ['notifyTime이 문자열이 아님', { ...base, settings: { ...settings, notifyTime: 900 } }],
    ['openAtLogin이 boolean이 아님', { ...base, settings: { ...settings, openAtLogin: 'yes' } }],
    ['enabled 키 빠짐', { ...base, settings: { ...settings, enabled: missingPaper } }],
    ['숫자 openAlexKey', { ...base, openAlexKey: 1 }]
  ])('%s → 거부', (_name, input) => {
    expect(isSaveInput(input)).toBe(false)
  })
})
