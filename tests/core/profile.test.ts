import { describe, expect, test } from 'vitest'
import { boardId } from '../../src/main/core/boards/index'
import {
  applyProfile,
  isSaveInput,
  validateBoard,
  validateProfile
} from '../../src/main/core/profile'
import { CATEGORIES } from '../../src/shared/types'
import type { Board, Profile, Settings } from '../../src/shared/types'
import { NOW, st } from '../helpers'

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
      errors: ['Keywords (English)를 1개 이상 입력해 주십시오.']
    })
  })
  test('알림 시각 형식이 틀리면 거부한다', () => {
    expect(
      validateProfile({ ...base, settings: { ...base.settings, notifyTime: '25:00' } })
    ).toEqual({ ok: false, errors: ['Notify at은 00:00~23:59 형식이어야 합니다.'] })
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
    ['숫자 openAlexKey', { ...base, openAlexKey: 1 }],
    [
      'enabled 안의 boolean 아닌 값',
      { ...base, settings: { ...settings, enabled: { ...settings.enabled, news: 'yes' } } }
    ],
    ['배열로 온 profile', { ...base, profile: [profile] }],
    ['객체가 아닌 settings', { ...base, settings: 'x' }]
  ])('%s → 거부', (_name, input) => {
    expect(isSaveInput(input)).toBe(false)
  })
})

describe('applyProfile', () => {
  const enc = (k: string): string => `enc(${k})`
  test('처음 만든 프로필이면 lastDailyRunAt을 지금으로 둔다', () => {
    const out = applyProfile(st(), base, enc, NOW)
    expect(out).toMatchObject({ profile, settings, lastDailyRunAt: NOW, openAlexKeyEnc: null })
  })
  test('기존 프로필을 고치면 lastDailyRunAt을 그대로 둔다', () => {
    const before = st({ profile, lastDailyRunAt: '2026-11-01T00:00:00.000Z' })
    expect(applyProfile(before, base, enc, NOW).lastDailyRunAt).toBe('2026-11-01T00:00:00.000Z')
  })
  test('키: undefined 유지, null과 공백 삭제, 문자열은 공백을 떼고 암호화', () => {
    const before = st({ profile, openAlexKeyEnc: 'old' })
    const key = (k?: string | null): string | null =>
      applyProfile(before, { ...base, openAlexKey: k }, enc, NOW).openAlexKeyEnc
    expect(key(undefined)).toBe('old')
    expect(key(null)).toBeNull()
    expect(key('   ')).toBeNull()
    expect(key(' abc ')).toBe('enc(abc)')
  })
  test('알려진 필드만 저장한다', () => {
    const input = {
      profile: { ...profile, extra: 1 },
      settings: { ...settings, extra: 2, enabled: { ...settings.enabled, extra: true } },
      extra: 3
    }
    const out = applyProfile(st(), input, enc, NOW)
    expect(out.profile).toEqual(profile)
    expect(out.settings).toEqual(settings)
    expect(Object.keys(out.settings.enabled).sort()).toEqual([...CATEGORIES].sort())
    expect(out).not.toHaveProperty('extra')
  })
  test('암호화가 던지면 그대로 던진다', () => {
    const fail = (): string => {
      throw new Error('no keychain')
    }
    expect(() => applyProfile(st(), { ...base, openAlexKey: 'k' }, fail, NOW)).toThrow()
  })
})

describe('validateBoard', () => {
  const board = (i: number): Board => ({
    id: `b${i}`,
    name: `게시판${i}`,
    url: `https://a.b/${i}`,
    category: 'school'
  })
  const input = {
    name: '  건축   학과 ',
    url: ' https://Architecture.snu.ac.kr/posts/notice ',
    category: 'school'
  }
  const err = (v: unknown, boards: Board[] = []): string | null => {
    const r = validateBoard(v, boards)
    return r.ok ? null : r.error
  }

  test('통과하면 이름·주소를 다듬고 주소로 id를 만든다', () => {
    const href = 'https://architecture.snu.ac.kr/posts/notice'
    expect(validateBoard(input, [board(1)])).toEqual({
      ok: true,
      board: { id: boardId(href), name: '건축 학과', url: href, category: 'school' }
    })
  })
  test.each([
    ['null', null],
    ['이름이 문자열이 아님', { ...input, name: 1 }],
    ['주소 없음', { name: 'a', category: 'school' }],
    ['모르는 분류', { ...input, category: 'paper' }]
  ])('모양이 틀리면 거부: %s', (_name, v) => {
    expect(err(v)).toBe('입력 형식이 올바르지 않습니다.')
  })
  test('이름은 공백 정리 뒤 1~30자', () => {
    const E = '이름을 1~30자로 입력해 주십시오.'
    expect(err({ ...input, name: '   ' })).toBe(E)
    expect(err({ ...input, name: '가'.repeat(31) })).toBe(E)
    expect(err({ ...input, name: '가'.repeat(30) })).toBeNull()
  })
  test('주소는 http(s)이고 500자 이하', () => {
    const E = '주소는 http:// 또는 https://로 시작해야 합니다.'
    expect(err({ ...input, url: 'javascript:alert(1)' })).toBe(E)
    expect(err({ ...input, url: 'a.b/notice' })).toBe(E)
    expect(err({ ...input, url: 'https://a.b/' + 'x'.repeat(490) })).toBe(E)
  })
  test('10개까지', () => {
    const ten = Array.from({ length: 10 }, (_, i) => board(i))
    expect(err(input, ten)).toBe('게시판은 10개까지 등록할 수 있습니다.')
    expect(err(input, ten.slice(1))).toBeNull()
  })
  test('등록된 게시판이나 기본 출처와 같은 이름은 거부', () => {
    const E = '이미 쓰고 있는 이름입니다.'
    expect(err({ ...input, name: ' 게시판1 ' }, [board(1)])).toBe(E)
    for (const name of [
      'OpenAlex',
      'arXiv',
      'GitHub',
      'Google News (KO)',
      'Google News (EN)',
      'IRIS',
      '한국연구재단'
    ])
      expect(err({ ...input, name })).toBe(E)
  })
  test('등록된 게시판이나 기본 과제 공고와 같은 주소는 거부', () => {
    const E = '이미 등록된 주소입니다.'
    expect(err({ ...input, url: 'HTTPS://A.B/1' }, [board(1)])).toBe(E)
    expect(
      err({ ...input, url: 'https://www.nrf.re.kr/biz/notice/list?menu_no=362&bizNotGubn=guide' })
    ).toBe(E)
  })
})
