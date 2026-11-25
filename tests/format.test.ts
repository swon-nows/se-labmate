import { describe, expect, it } from 'vitest'
import { formatStars, longKeywords, relativeDate } from '../src/renderer/src/format'
import { activeSources, allFailed, sourceErrorText } from '../src/shared/sources'
import type { Profile, Settings } from '../src/shared/types'

describe('relativeDate', () => {
  const now = new Date(2026, 10, 24, 15, 0)
  const at = (...a: [number, number, number, number, number]): string =>
    new Date(...a).toISOString()

  it('같은 날은 오늘, 하루 전은 어제', () => {
    expect(relativeDate(at(2026, 10, 24, 1, 0), now)).toBe('오늘')
    expect(relativeDate(at(2026, 10, 23, 23, 0), now)).toBe('어제')
  })
  it('2~7일은 N일 전, 그 밖은 날짜', () => {
    expect(relativeDate(at(2026, 10, 22, 12, 0), now)).toBe('2일 전')
    expect(relativeDate(at(2026, 10, 19, 12, 0), now)).toBe('5일 전')
    expect(relativeDate(at(2026, 10, 17, 12, 0), now)).toBe('7일 전')
    expect(relativeDate(at(2026, 10, 16, 12, 0), now)).toBe('2026-11-16')
    expect(relativeDate(at(2026, 9, 1, 12, 0), now)).toBe('2026-10-01')
  })
  it('미래 날짜는 오늘이 아니라 날짜로 보인다', () => {
    expect(relativeDate(at(2026, 10, 25, 9, 0), now)).toBe('2026-11-25')
    expect(relativeDate(at(2027, 0, 5, 12, 0), now)).toBe('2027-01-05')
  })
})

describe('formatStars', () => {
  it('1000 미만은 그대로, 이상은 k', () => {
    expect(formatStars(999)).toBe('999')
    expect(formatStars(1234)).toBe('1.2k')
    expect(formatStars(15000)).toBe('15.0k')
  })
})

describe('activeSources', () => {
  const profile: Profile = { keywordsEn: ['gnn'], keywordsKo: ['그래프'], country: 'KR' }
  const settings: Settings = {
    notifyTime: '09:00',
    openAtLogin: true,
    enabled: { paper: true, repo: true, news: true, grant: true, conference: true, school: true }
  }
  const off = (c: 'paper' | 'repo' | 'news'): Settings => ({
    ...settings,
    enabled: { ...settings.enabled, [c]: false }
  })

  it('모두 켜면 다섯 출처가 순서대로', () => {
    expect(activeSources(profile, settings, true)).toEqual([
      'OpenAlex',
      'arXiv',
      'GitHub',
      'Google 뉴스(한국어)',
      'Google 뉴스(영문)'
    ])
  })
  it('키가 없으면 OpenAlex가 빠진다', () => {
    expect(activeSources(profile, settings, false)).not.toContain('OpenAlex')
  })
  it('국가가 그 외이거나 한글 키워드가 없으면 한국어판이 빠진다', () => {
    expect(activeSources({ ...profile, country: 'OTHER' }, settings, true)).not.toContain(
      'Google 뉴스(한국어)'
    )
    expect(activeSources({ ...profile, keywordsKo: [] }, settings, true)).not.toContain(
      'Google 뉴스(한국어)'
    )
  })
  it('뉴스를 끄면 두 판이 모두 빠지고, 논문·저장소를 끄면 해당 출처가 빠진다', () => {
    expect(activeSources(profile, off('news'), true)).toEqual(['OpenAlex', 'arXiv', 'GitHub'])
    expect(activeSources(profile, off('paper'), true)).toEqual([
      'GitHub',
      'Google 뉴스(한국어)',
      'Google 뉴스(영문)'
    ])
    expect(activeSources(profile, off('repo'), true)).not.toContain('GitHub')
  })
})

describe('allFailed', () => {
  it('켜진 출처가 하나 이상이고 모두 오류가 있을 때만 참', () => {
    expect(allFailed(['arXiv', 'GitHub'], { arXiv: 'HTTP 503', GitHub: 'HTTP 403' })).toBe(true)
    expect(allFailed(['arXiv', 'GitHub'], { arXiv: 'HTTP 503' })).toBe(false)
    expect(allFailed([], {})).toBe(false)
    expect(allFailed([], { arXiv: 'HTTP 503' })).toBe(false)
  })
})

describe('sourceErrorText', () => {
  const KEY = '키가 올바르지 않습니다. 설정에서 키를 확인해 주십시오.'
  const LIMIT = '요청 한도를 넘었습니다. 다음 수집 때 다시 시도합니다.'
  it('OpenAlex 401·403은 키 안내, GitHub 403·429는 한도 안내', () => {
    expect(sourceErrorText('OpenAlex', 'HTTP 401')).toBe(KEY)
    expect(sourceErrorText('OpenAlex', 'HTTP 403')).toBe(KEY)
    expect(sourceErrorText('GitHub', 'HTTP 403')).toBe(LIMIT)
    expect(sourceErrorText('GitHub', 'HTTP 429')).toBe(LIMIT)
  })
  it('그 밖은 메시지 그대로', () => {
    expect(sourceErrorText('OpenAlex', 'HTTP 429')).toBe('HTTP 429')
    expect(sourceErrorText('GitHub', 'HTTP 401')).toBe('HTTP 401')
    expect(sourceErrorText('arXiv', 'HTTP 403')).toBe('HTTP 403')
    expect(sourceErrorText('Google 뉴스(영문)', '네트워크 오류')).toBe('네트워크 오류')
  })
})

describe('longKeywords', () => {
  it('다섯 낱말 이상인 키워드만 돌려준다', () => {
    expect(longKeywords('explainable ai with structural analysis')).toEqual([
      'explainable ai with structural analysis'
    ])
    expect(longKeywords('a b c d e, short')).toEqual(['a b c d e'])
  })
  it('짧은 키워드와 빈 입력은 빈 목록', () => {
    expect(longKeywords('graph neural network, xai')).toEqual([])
    expect(longKeywords('')).toEqual([])
  })
})
