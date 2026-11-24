import { describe, expect, it } from 'vitest'
import { mergeBatch } from '../src/renderer/src/session'
import type { Category, FeedGroup, Item } from '../src/shared/types'

const item = (category: Category, n: string): Item => ({
  id: `${category}:${n}`,
  category,
  source: 'arXiv',
  title: n,
  url: 'https://example.org/',
  date: '2026-11-24T00:00:00.000Z',
  summary: '',
  matched: [],
  collectedAt: '2026-11-24T00:00:00.000Z',
  seenAt: null,
  saved: false,
  hidden: false
})
const group = (category: Category, ...names: string[]): FeedGroup => ({
  category,
  items: names.map((n) => item(category, n))
})
const ids = (items: Item[], category: Category): string[] =>
  items.filter((i) => i.category === category).map((i) => i.id)

describe('mergeBatch', () => {
  it('첫 묶음은 카테고리별로 받은 순서를 지킨다', () => {
    const list = mergeBatch([], [group('paper', 'a', 'b'), group('repo', 'r')])
    expect(ids(list, 'paper')).toEqual(['paper:a', 'paper:b'])
    expect(ids(list, 'repo')).toEqual(['repo:r'])
  })

  it('나중 묶음은 같은 카테고리의 기존 항목 앞에 붙는다', () => {
    const first = mergeBatch([], [group('paper', 'a', 'b'), group('news', 'n1')])
    const list = mergeBatch(first, [group('paper', 'c', 'd'), group('repo', 'r')])
    expect(ids(list, 'paper')).toEqual(['paper:c', 'paper:d', 'paper:a', 'paper:b'])
    expect(ids(list, 'news')).toEqual(['news:n1'])
    expect(ids(list, 'repo')).toEqual(['repo:r'])
    expect(list).toHaveLength(6)
  })

  it('이미 있는 id는 다시 넣지 않는다 (묶음 안의 중복 포함)', () => {
    const first = mergeBatch([], [group('paper', 'a')])
    const list = mergeBatch(first, [group('paper', 'a', 'b', 'b')])
    expect(ids(list, 'paper')).toEqual(['paper:b', 'paper:a'])
  })

  it('빈 묶음은 목록을 바꾸지 않는다', () => {
    const first = mergeBatch([], [group('paper', 'a')])
    expect(mergeBatch(first, [])).toBe(first)
    expect(mergeBatch(first, [group('paper', 'a')])).toBe(first)
  })
})
