import { describe, expect, test } from 'vitest'
import { pastItems, savedItems, takeNew, unseenCounts } from '../../src/main/core/feed'
import { NOW, mk, st } from '../helpers'

test('takeNew는 보이는 미확인만 묶어 주고 확인 처리한다', () => {
  const state = st({
    items: {
      p1: mk({ id: 'p1', category: 'paper' }),
      r1: mk({ id: 'r1', category: 'repo' }),
      h: mk({ id: 'h', category: 'paper', hidden: true }),
      n: mk({ id: 'n', category: 'news' })
    },
    enabled: { news: false }
  })
  const { state: next, groups } = takeNew(state, NOW)
  expect(groups.map((g) => [g.category, g.items.map((i) => i.id)])).toEqual([
    ['paper', ['p1']],
    ['repo', ['r1']]
  ])
  expect(next.items.p1.seenAt).toBe(NOW)
  expect(next.items.n.seenAt).toBeNull()
  expect(state.items.p1.seenAt).toBeNull()
  expect(takeNew(next, NOW).groups).toEqual([])
  expect(unseenCounts(state)).toEqual({ paper: 1, repo: 1 })
})

describe('pastItems', () => {
  const state = st({
    items: {
      a: mk({ id: 'a', seenAt: '2026-11-01T00:00:00.000Z' }),
      b: mk({ id: 'b', seenAt: '2026-11-03T00:00:00.000Z' }),
      c: mk({ id: 'c', seenAt: '2026-11-02T00:00:00.000Z' }),
      u: mk({ id: 'u', seenAt: null }),
      h: mk({ id: 'h', seenAt: '2026-11-04T00:00:00.000Z', hidden: true })
    }
  })

  test('보이는 확인 항목을 seenAt 최신순으로 준다', () => {
    expect(pastItems(state, 10).map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  test('limit만큼만 준다', () => {
    expect(pastItems(state, 2).map((i) => i.id)).toEqual(['b', 'c'])
  })
})

test('savedItems는 숨김과 상관없이 저장한 항목을 날짜 최신순으로 준다', () => {
  const state = st({
    items: {
      a: mk({ id: 'a', saved: true, date: '2026-11-01T00:00:00.000Z' }),
      b: mk({ id: 'b', saved: true, hidden: true, date: '2026-11-02T00:00:00.000Z' }),
      c: mk({ id: 'c', date: '2026-11-03T00:00:00.000Z' })
    }
  })
  expect(savedItems(state).map((i) => i.id)).toEqual(['b', 'a'])
})
