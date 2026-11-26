import { describe, expect, test } from 'vitest'
import {
  hasPast,
  hideItem,
  pastItems,
  savedItems,
  takeNew,
  unhideItem,
  unseenCounts
} from '../../src/main/core/feed'
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

describe('takeNew 정렬', () => {
  test('묶음 안은 score 높은 순, 같으면 날짜 최신순', () => {
    const state = st({
      items: {
        lo: mk({ id: 'lo', title: 'other', matched: [], date: NOW }),
        hi: mk({ id: 'hi', title: 'xai', matched: ['xai'], date: '2026-11-20T00:00:00.000Z' }),
        // 30일을 넘긴 두 항목은 점수가 같으므로 날짜로 가른다
        old: mk({ id: 'old', category: 'repo', date: '2026-08-01T00:00:00.000Z' }),
        newer: mk({ id: 'newer', category: 'repo', date: '2026-09-01T00:00:00.000Z' })
      }
    })
    const { groups } = takeNew(state, NOW)
    expect(groups.map((g) => [g.category, g.items.map((i) => i.id)])).toEqual([
      ['paper', ['hi', 'lo']],
      ['repo', ['newer', 'old']]
    ])
  })

  test('묶음은 items 순서와 상관없이 CATEGORIES 순서', () => {
    const state = st({
      items: {
        n: mk({ id: 'n', category: 'news' }),
        r: mk({ id: 'r', category: 'repo' }),
        p: mk({ id: 'p', category: 'paper' })
      }
    })
    expect(takeNew(state, NOW).groups.map((g) => g.category)).toEqual(['paper', 'repo', 'news'])
  })
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

  test('limit은 카테고리마다 따로 센다', () => {
    const mixed = st({
      items: {
        ...state.items,
        r: mk({ id: 'r', category: 'repo', seenAt: '2026-10-01T00:00:00.000Z' })
      }
    })
    expect(pastItems(mixed, 2).map((i) => i.id)).toEqual(['b', 'c', 'r'])
  })
})

describe('hasPast', () => {
  test('보이는 확인 항목이 하나라도 있으면 true', () => {
    const state = st({ items: { a: mk({ id: 'a', seenAt: NOW }), u: mk({ id: 'u' }) } })
    expect(hasPast(state)).toBe(true)
  })

  test('확인한 항목이 숨겼거나 카테고리가 꺼져 있으면 false', () => {
    const hidden = st({ items: { h: mk({ id: 'h', seenAt: NOW, hidden: true }) } })
    expect(hasPast(hidden)).toBe(false)
    const off = st({
      items: { n: mk({ id: 'n', category: 'news', seenAt: NOW }) },
      enabled: { news: false }
    })
    expect(hasPast(off)).toBe(false)
  })

  test('확인한 항목이 없거나 비어 있으면 false', () => {
    expect(hasPast(st({ items: { u: mk({ id: 'u' }) } }))).toBe(false)
    expect(hasPast(st())).toBe(false)
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

describe('hideItem', () => {
  const state = st({
    items: {
      s: mk({ id: 's', saved: true, seenAt: NOW }),
      o: mk({ id: 'o' })
    }
  })

  test('숨기면서 저장도 푼다: 저장함에서 관심 없음을 눌러도 다시 나오지 않는다', () => {
    const next = hideItem(state, 's')
    expect(next.items.s).toMatchObject({ hidden: true, saved: false, seenAt: NOW })
    expect(next.items.o).toBe(state.items.o)
    expect(savedItems(next)).toEqual([])
    expect(state.items.s.saved).toBe(true) // 원래 상태는 그대로
  })

  test('없는 id나 상속된 이름이면 같은 상태를 그대로 돌려준다', () => {
    expect(hideItem(state, 'nope')).toBe(state)
    expect(hideItem(state, '__proto__')).toBe(state)
  })

  test('되돌리면 숨김과 저장이 그대로 돌아온다', () => {
    const saved = unhideItem(hideItem(state, 's'), 's', true)
    expect(saved.items.s).toEqual(state.items.s)
    expect(savedItems(saved).map((i) => i.id)).toEqual(['s'])
    const plain = unhideItem(hideItem(state, 'o'), 'o', false)
    expect(plain.items.o).toEqual(state.items.o)
  })

  test('되돌릴 때 저장 여부는 넘긴 값을 따른다', () => {
    const hidden = hideItem(state, 'o')
    expect(unhideItem(hidden, 'o', true).items.o).toMatchObject({ hidden: false, saved: true })
  })

  test('되돌릴 때도 없는 id면 같은 상태를 그대로 돌려준다', () => {
    expect(unhideItem(state, 'nope', true)).toBe(state)
    expect(unhideItem(state, '__proto__', false)).toBe(state)
  })
})
