import { describe, expect, test } from 'vitest'
import { boardId } from '../../src/main/core/boards/index'
import {
  applyProfile,
  isSaveInput,
  needsCollect,
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
  enabled: { paper: true, repo: true, news: true, grant: true, conference: true, school: true },
  repoCount: 10,
  conferenceFields: []
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
  test.each([0, 26, 2.5, -1, NaN])('Trending repos가 %s이면 거부한다', (repoCount) => {
    expect(validateProfile({ ...base, settings: { ...base.settings, repoCount } })).toEqual({
      ok: false,
      errors: ['Trending repos는 1~25 사이의 정수여야 합니다.']
    })
  })
  test.each([1, 25])('Trending repos가 %s이면 통과한다', (repoCount) => {
    expect(validateProfile({ ...base, settings: { ...base.settings, repoCount } })).toMatchObject({
      ok: true
    })
  })
  test('Conference fields는 알려진 분야만 받고, 중복을 없애 정해진 순서로 돌려준다', () => {
    const fields = (conferenceFields: unknown): ReturnType<typeof validateProfile> =>
      validateProfile({
        ...base,
        settings: {
          ...base.settings,
          conferenceFields: conferenceFields as Settings['conferenceFields']
        }
      })
    expect(fields(['ai', 'x'])).toEqual({
      ok: false,
      errors: ['Conference fields 값이 올바르지 않습니다.']
    })
    for (const bad of ['ai', undefined, null, [1]])
      expect(fields(bad)).toEqual({
        ok: false,
        errors: ['Conference fields 값이 올바르지 않습니다.']
      })
    expect(fields([])).toMatchObject({ ok: true, settings: { conferenceFields: [] } })
    expect(fields(['structural', 'ai', 'ai'])).toMatchObject({
      ok: true,
      settings: { conferenceFields: ['ai', 'structural'] }
    })
  })
  test('오류는 한꺼번에 모아 돌려준다', () => {
    const bad = { ...base.settings, notifyTime: '25:00', repoCount: 0 }
    expect(validateProfile({ profile: { ...profile, keywordsEn: [] }, settings: bad })).toEqual({
      ok: false,
      errors: [
        'Keywords (English)를 1개 이상 입력해 주십시오.',
        'Notify at은 00:00~23:59 형식이어야 합니다.',
        'Trending repos는 1~25 사이의 정수여야 합니다.'
      ]
    })
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
    ['repoCount 없음', { ...base, settings: { ...settings, repoCount: undefined } }],
    ['문자열 repoCount', { ...base, settings: { ...settings, repoCount: '7' } }],
    ['conferenceFields 없음', { ...base, settings: { ...settings, conferenceFields: undefined } }],
    ['문자열 conferenceFields', { ...base, settings: { ...settings, conferenceFields: 'ai' } }],
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
  test('repoCount를 저장한다', () => {
    const out = applyProfile(st(), { ...base, settings: { ...settings, repoCount: 4 } }, enc, NOW)
    expect(out.settings.repoCount).toBe(4)
  })
  test('conferenceFields를 저장한다', () => {
    const input = { ...base, settings: { ...settings, conferenceFields: ['ai' as const] } }
    expect(applyProfile(st(), input, enc, NOW).settings.conferenceFields).toEqual(['ai'])
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

describe('needsCollect', () => {
  const before = st({ profile, settings, openAlexKeyEnc: 'k1' })
  const after = (p: {
    profile?: Partial<Profile>
    settings?: Partial<Settings>
    openAlexKeyEnc?: string | null
  }): ReturnType<typeof st> => ({
    ...before,
    profile: { ...profile, ...p.profile },
    settings: { ...settings, ...p.settings },
    openAlexKeyEnc: p.openAlexKeyEnc === undefined ? 'k1' : p.openAlexKeyEnc
  })

  test('처음 만든 프로필이면 수집한다', () => {
    expect(needsCollect(st(), after({}))).toBe(true)
  })
  test('바뀐 것이 없으면 수집하지 않는다', () => {
    expect(needsCollect(before, after({}))).toBe(false)
    expect(needsCollect(before, after({ profile: { keywordsEn: ['xai'] } }))).toBe(false)
  })
  test('알림 시각이나 로그인 시 열기만 바뀌면 수집하지 않는다', () => {
    expect(needsCollect(before, after({ settings: { notifyTime: '18:30' } }))).toBe(false)
    expect(needsCollect(before, after({ settings: { openAtLogin: false } }))).toBe(false)
  })
  test('영문·한글 키워드가 바뀌면 수집한다: 같은 낱말이 같은 순서면 같은 것', () => {
    expect(needsCollect(before, after({ profile: { keywordsEn: ['xai', 'shap'] } }))).toBe(true)
    expect(needsCollect(before, after({ profile: { keywordsEn: [] } }))).toBe(true)
    expect(needsCollect(before, after({ profile: { keywordsKo: ['인공지능'] } }))).toBe(true)
    const two = st({ profile: { ...profile, keywordsEn: ['a', 'b'] }, settings })
    expect(needsCollect(two, { ...two, profile: { ...profile, keywordsEn: ['b', 'a'] } })).toBe(
      true
    )
  })
  test('국가, 카테고리, 저장소 개수, OpenAlex 키가 바뀌면 수집한다', () => {
    expect(needsCollect(before, after({ profile: { country: 'OTHER' } }))).toBe(true)
    for (const c of CATEGORIES)
      expect(
        needsCollect(
          before,
          after({ settings: { enabled: { ...settings.enabled, [c]: !settings.enabled[c] } } })
        )
      ).toBe(true)
    expect(needsCollect(before, after({ settings: { repoCount: 5 } }))).toBe(true)
    expect(needsCollect(before, after({ openAlexKeyEnc: 'k2' }))).toBe(true)
    expect(needsCollect(before, after({ openAlexKeyEnc: null }))).toBe(true)
  })
})

describe('needsCollect: 학회 분야', () => {
  const before = st({ profile, settings })
  const withFields = (conferenceFields: Settings['conferenceFields']): ReturnType<typeof st> => ({
    ...before,
    settings: { ...settings, conferenceFields }
  })
  test('고른 분야가 바뀌면 수집하고, 같으면 수집하지 않는다', () => {
    expect(needsCollect(before, withFields(['ai']))).toBe(true)
    expect(needsCollect(withFields(['ai']), withFields([]))).toBe(true)
    expect(needsCollect(withFields(['ai']), withFields(['ai', 'structural']))).toBe(true)
    expect(needsCollect(withFields(['ai']), withFields(['ai']))).toBe(false)
    expect(needsCollect(before, withFields([]))).toBe(false)
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
  test('분야 게시판과 같은 이름은 거부하고, 같은 주소는 받는다', () => {
    expect(err({ ...input, name: '한국강구조학회' })).toBe('이미 쓰고 있는 이름입니다.')
    expect(err({ ...input, name: 'EERI' })).toBe('이미 쓰고 있는 이름입니다.')
    expect(err({ ...input, name: 'fib' })).toBe('이미 쓰고 있는 이름입니다.')
    expect(err({ ...input, name: 'CCF Deadlines' })).toBe('이미 쓰고 있는 이름입니다.')
    const url = 'https://www.kssc.or.kr/welcome.do'
    expect(validateBoard({ ...input, url, category: 'conference' }, [])).toMatchObject({
      ok: true,
      board: { url, category: 'conference' }
    })
  })
  test('등록된 게시판이나 기본 과제 공고와 같은 주소는 거부', () => {
    const E = '이미 등록된 주소입니다.'
    expect(err({ ...input, url: 'HTTPS://A.B/1' }, [board(1)])).toBe(E)
    expect(
      err({ ...input, url: 'https://www.nrf.re.kr/biz/notice/list?menu_no=362&bizNotGubn=guide' })
    ).toBe(E)
  })
})
