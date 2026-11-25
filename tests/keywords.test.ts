import { describe, expect, it } from 'vitest'
import { cleanKeywords } from '../src/main/core/text'
import { MAX_KEYWORDS, chipAction } from '../src/renderer/src/format'

const words = (n: number): string[] => Array.from({ length: n }, (_, i) => 'k' + i)

describe('MAX_KEYWORDS', () => {
  it('main의 cleanKeywords가 남기는 개수와 같다', () => {
    expect(cleanKeywords(words(20)).length).toBe(MAX_KEYWORDS)
  })
})

describe('chipAction', () => {
  const list = (n: number): string => words(n).join(', ')

  it('눌린 칩은 가득 차도, 글자를 치는 중이어도 항상 toggle', () => {
    expect(chipAction(list(MAX_KEYWORDS), 'k0', false)).toBe('toggle')
    expect(chipAction(`${list(MAX_KEYWORDS)}, ty`, 'k0', true)).toBe('toggle')
    expect(chipAction('SHAP, sh', 'shap', true)).toBe('toggle')
    expect(chipAction('Explainable AI', 'explainable ai', false)).toBe('toggle')
  })

  it('치는 중이 아니면 키워드가 8개 미만일 때만 toggle', () => {
    expect(chipAction('', 'SHAP', false)).toBe('toggle')
    expect(chipAction(list(MAX_KEYWORDS - 1), 'SHAP', false)).toBe('toggle')
    expect(chipAction(list(MAX_KEYWORDS), 'SHAP', false)).toBe('blocked')
  })

  it('치는 중에 눌리지 않은 칩은 완성된 키워드가 8개 미만일 때만 replace', () => {
    expect(chipAction('gra', 'graph neural network', true)).toBe('replace')
    expect(chipAction(`${list(MAX_KEYWORDS - 1)}, ty`, 'SHAP', true)).toBe('replace')
    expect(chipAction(`${list(MAX_KEYWORDS)}, ty`, 'SHAP', true)).toBe('blocked')
  })
})
