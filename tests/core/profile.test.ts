import { describe, expect, test } from 'vitest'
import { validateProfile } from '../../src/main/core/profile'
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
