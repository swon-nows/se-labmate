import { describe, expect, test } from 'vitest'
import { cleanKeywords, isHttpUrl, matchKeywords, normalizeTitle } from '../../src/main/core/text'

describe('normalizeTitle', () => {
  test('기호와 공백을 없애고 소문자로 만든다', () => {
    expect(normalizeTitle('  Graph-Neural  Networks: A Survey! ')).toBe(
      'graphneuralnetworksasurvey'
    )
    expect(normalizeTitle('설명가능 AI 동향')).toBe('설명가능ai동향')
  })
})

describe('matchKeywords', () => {
  test('대소문자를 무시하고 원래 표기로 돌려준다', () => {
    expect(
      matchKeywords('Explaining GNN surrogates for XAI', ['xai', 'structural analysis'])
    ).toEqual(['xai'])
  })
})

describe('isHttpUrl', () => {
  test('http와 https만 허용한다', () => {
    expect(isHttpUrl('https://a.b/c')).toBe(true)
  })
  test('그 밖의 값은 거부한다', () => {
    for (const u of ['javascript:alert(1)', 'file:///etc/passwd', 'not a url', ''])
      expect(isHttpUrl(u)).toBe(false)
  })
})

describe('cleanKeywords', () => {
  test('공백·금지 문자·빈 값·중복을 정리한다', () => {
    expect(cleanKeywords(['  XAI ', 'xai', 'a,b|"c"', '', 'graph   neural'])).toEqual([
      'XAI',
      'abc',
      'graph neural'
    ])
  })
  test('앞에서 8개까지만 남긴다', () => {
    expect(cleanKeywords(Array.from({ length: 12 }, (_, i) => `k${i}`))).toHaveLength(8)
  })
})
