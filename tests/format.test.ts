import { describe, expect, it } from 'vitest'
import { formatStars, relativeDate } from '../src/renderer/src/format'
import { activeSources } from '../src/shared/sources'
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
