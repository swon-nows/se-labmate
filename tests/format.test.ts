import { describe, expect, it } from 'vitest'
import { cleanKeywords } from '../src/main/core/text'
import {
  currentToken,
  feedCategories,
  formatStars,
  hasKeyword,
  isoDate,
  keywordList,
  longKeywords,
  paperChips,
  plainMath,
  relativeDate,
  replaceToken,
  toggleKeyword
} from '../src/renderer/src/format'
import { KEYWORD_SUGGESTIONS } from '../src/shared/keyword-suggestions'
import {
  BUILTIN_BOARDS,
  FIXED_SOURCE_NAMES,
  activeSources,
  allFailed,
  allUnreachable,
  sourceErrorText
} from '../src/shared/sources'
import type { Board, Category, Profile, Settings } from '../src/shared/types'

describe('relativeDate', () => {
  const now = new Date(2026, 10, 24, 15, 0)
  const at = (...a: [number, number, number, number, number]): string =>
    new Date(...a).toISOString()

  it('같은 날은 Today, 하루 전은 Yesterday', () => {
    expect(relativeDate(at(2026, 10, 24, 1, 0), now)).toBe('Today')
    expect(relativeDate(at(2026, 10, 23, 23, 0), now)).toBe('Yesterday')
  })
  it('2~7일은 Nd ago, 그 밖은 날짜', () => {
    expect(relativeDate(at(2026, 10, 22, 12, 0), now)).toBe('2d ago')
    expect(relativeDate(at(2026, 10, 19, 12, 0), now)).toBe('5d ago')
    expect(relativeDate(at(2026, 10, 17, 12, 0), now)).toBe('7d ago')
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
  const off = (c: Category): Settings => ({
    ...settings,
    enabled: { ...settings.enabled, [c]: false }
  })
  const names = (p: Profile, s: Settings, key: boolean, boards: Board[] = []): string[] =>
    activeSources(p, s, key, boards).map((x) => x.name)
  const school: Board = { id: 's1', name: '학과', url: 'https://a.b/s', category: 'school' }
  const conf: Board = { id: 'c1', name: '학회', url: 'https://a.b/c', category: 'conference' }

  it('모두 켜면 다섯 출처, 한국이면 IRIS·한국연구재단이 순서대로', () => {
    expect(names(profile, settings, true)).toEqual([
      'OpenAlex',
      'arXiv',
      'GitHub',
      'Google News (KO)',
      'Google News (EN)',
      'IRIS',
      '한국연구재단'
    ])
    const grants = activeSources(profile, settings, true, []).filter((s) => s.board)
    expect(grants.map((s) => [s.board, s.category])).toEqual(
      BUILTIN_BOARDS.map((b) => [b, 'grant'])
    )
  })
  it('게시판이 아닌 출처의 이름은 모두 FIXED_SOURCE_NAMES에 있다', () => {
    const fixed = activeSources(profile, settings, true, [school]).filter((s) => !s.board)
    expect(fixed.length).toBeGreaterThan(0)
    for (const s of fixed) expect(FIXED_SOURCE_NAMES).toContain(s.name)
  })
  it('키가 없으면 OpenAlex가 빠진다', () => {
    expect(names(profile, settings, false)).not.toContain('OpenAlex')
  })
  it('국가가 그 외이면 한국어판과 IRIS·한국연구재단이 빠지고, 한글 키워드가 없으면 한국어판이 빠진다', () => {
    expect(names({ ...profile, country: 'OTHER' }, settings, true)).toEqual([
      'OpenAlex',
      'arXiv',
      'GitHub',
      'Google News (EN)'
    ])
    expect(names({ ...profile, keywordsKo: [] }, settings, true)).not.toContain('Google News (KO)')
  })
  it('사용자 게시판은 등록 순으로 끝에', () => {
    expect(names(profile, settings, true, [school, conf]).slice(-3)).toEqual([
      '한국연구재단',
      '학과',
      '학회'
    ])
    expect(names({ ...profile, country: 'OTHER' }, off('news'), true, [conf, school])).toEqual([
      'OpenAlex',
      'arXiv',
      'GitHub',
      '학회',
      '학과'
    ])
  })
  it('카테고리를 끄면 그 출처가 빠진다', () => {
    expect(names(profile, off('news'), true)).toEqual([
      'OpenAlex',
      'arXiv',
      'GitHub',
      'IRIS',
      '한국연구재단'
    ])
    expect(names(profile, off('paper'), true)).toEqual([
      'GitHub',
      'Google News (KO)',
      'Google News (EN)',
      'IRIS',
      '한국연구재단'
    ])
    expect(names(profile, off('repo'), true)).not.toContain('GitHub')
    expect(names(profile, off('grant'), true, [school, conf])).toEqual([
      'OpenAlex',
      'arXiv',
      'GitHub',
      'Google News (KO)',
      'Google News (EN)',
      '학과',
      '학회'
    ])
    expect(names(profile, off('school'), true, [school, conf]).slice(-1)).toEqual(['학회'])
    expect(names(profile, off('conference'), true, [school, conf]).slice(-1)).toEqual(['학과'])
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

describe('allUnreachable', () => {
  it('켜진 출처가 하나 이상이고 모두 네트워크 오류나 시간 초과일 때만 참', () => {
    expect(
      allUnreachable(['arXiv', 'GitHub'], { arXiv: '네트워크 오류', GitHub: '요청 시간 초과' })
    ).toBe(true)
    expect(
      allUnreachable(['arXiv', 'GitHub'], { arXiv: '네트워크 오류', GitHub: 'HTTP 404' })
    ).toBe(false)
    expect(allUnreachable(['arXiv', 'GitHub'], { arXiv: '네트워크 오류' })).toBe(false)
    expect(allUnreachable([], {})).toBe(false)
    expect(allUnreachable(['constructor'], {})).toBe(false)
  })
})

describe('sourceErrorText', () => {
  const KEY = '키가 올바르지 않습니다. Settings에서 키를 확인해 주십시오.'
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
    expect(sourceErrorText('Google News (EN)', '네트워크 오류')).toBe('네트워크 오류')
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

describe('keywordList', () => {
  it('쉼표로 나누고 앞뒤 공백과 빈 것을 뺀다', () => {
    expect(keywordList(' a, b ,, c ')).toEqual(['a', 'b', 'c'])
    expect(keywordList('')).toEqual([])
  })
})

describe('hasKeyword', () => {
  it('대소문자를 무시하고 키워드 전체가 같을 때만 참', () => {
    expect(hasKeyword('Explainable AI, SHAP', 'explainable ai')).toBe(true)
    expect(hasKeyword('explainable AI', 'AI')).toBe(false)
  })
})

describe('toggleKeyword', () => {
  it('없으면 끝에 더하고 있으면 뺀다', () => {
    expect(toggleKeyword('', 'SHAP')).toBe('SHAP')
    expect(toggleKeyword('a, b', 'SHAP')).toBe('a, b, SHAP')
    expect(toggleKeyword('a, shap , b', 'SHAP')).toBe('a, b')
    expect(toggleKeyword('a, ', 'SHAP')).toBe('a, SHAP')
  })
})

describe('replaceToken', () => {
  it('적고 있는 낱말을 빼고 키워드를 끝에 더한다. 이미 있으면 더하지 않는다', () => {
    expect(replaceToken('gra', 'graph neural network')).toBe('graph neural network')
    expect(replaceToken('a, gra', 'graph neural network')).toBe('a, graph neural network')
    expect(replaceToken('SHAP, sh', 'SHAP')).toBe('SHAP')
    expect(replaceToken('a, ', 'b')).toBe('a, b')
  })
})

describe('currentToken', () => {
  it('마지막 쉼표 뒤의 글을 소문자로 돌려준다', () => {
    expect(currentToken('a, Gra')).toBe('gra')
    expect(currentToken('a, ')).toBe('')
    expect(currentToken('abc')).toBe('abc')
  })
})

describe('KEYWORD_SUGGESTIONS', () => {
  it.each(
    KEYWORD_SUGGESTIONS.flatMap((g) => [
      [g.label, 'en', g.en] as const,
      [g.label, 'ko', g.ko] as const
    ])
  )('%s %s: 중복이 없고 cleanKeywords를 거쳐도 그대로다', (_label, _lang, list) => {
    expect(new Set(list.map((k) => k.toLowerCase())).size).toBe(list.length)
    for (const k of list) expect(cleanKeywords([k])).toEqual([k])
  })
})

describe('isoDate', () => {
  it('현지 날짜를 YYYY-MM-DD로 쓴다', () => {
    expect(isoDate(new Date(2026, 10, 5, 23, 0).toISOString())).toBe('2026-11-05')
  })
  it('읽을 수 없는 날짜는 빈 글자', () => {
    expect(isoDate('not a date')).toBe('')
  })
})

describe('paperChips', () => {
  it('일치한 내 키워드를 먼저, 이어서 겹치지 않는 논문 키워드(대소문자 무시)', () => {
    expect(
      paperChips({ matched: ['XAI'], keywords: ['xai', 'SHAP', 'graph neural networks'] })
    ).toEqual([
      { text: 'XAI', match: true },
      { text: 'SHAP', match: false },
      { text: 'graph neural networks', match: false }
    ])
  })
  it('키워드가 없으면 빈 목록', () => {
    expect(paperChips({ matched: [], keywords: undefined })).toEqual([])
  })
  it('합쳐서 6개까지', () => {
    expect(paperChips({ matched: ['a', 'b'], keywords: ['c', 'd', 'e', 'f', 'g'] })).toHaveLength(6)
  })
})

describe('feedCategories', () => {
  it('켜진 출처의 카테고리와 목록에 있는 카테고리를 CATEGORIES 순서로 겹치지 않게 합친다', () => {
    expect(feedCategories(['paper', 'grant'], ['school', 'paper'])).toEqual([
      'paper',
      'grant',
      'school'
    ])
  })
  it('둘 다 비면 빈 목록', () => {
    expect(feedCategories([], [])).toEqual([])
  })
})

describe('plainMath', () => {
  it('숫자 아래·위 첨자를 글자로 바꾼다', () => {
    expect(plainMath('coupling in BaFe$_{12}$O$_{19}$')).toBe('coupling in BaFe₁₂O₁₉')
    expect(plainMath('Fe$^{3+}$ and $x^2$')).toBe('Fe³⁺ and x²')
    expect(plainMath('Defective $α$-In$_2$Se$_3$ on $D(4s,q)$')).toBe(
      'Defective α-In₂Se₃ on D(4s,q)'
    )
  })

  it('바꿀 수 없는 수식과 수식이 아닌 $는 그대로 둔다', () => {
    expect(plainMath('$T_c$ in $\\mathrm{YBCO}$')).toBe('$T_c$ in $\\mathrm{YBCO}$')
    expect(plainMath('costs $5 and $10')).toBe('costs $5 and $10')
    expect(plainMath('$5-$10 billion')).toBe('$5-$10 billion')
    expect(plainMath('no math')).toBe('no math')
  })
})
