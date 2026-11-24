import { describe, expect, test } from 'vitest'
import { mergeIncoming, pruneOld } from '../../src/main/core/merge'
import { score } from '../../src/main/core/relevance'
import { NOW, mk, raw } from '../helpers'

describe('mergeIncoming', () => {
  test('이미 있는 항목은 다시 새 소식이 되지 않는다', () => {
    const seen = mk({ id: 'paper:a', seenAt: '2026-11-01T00:00:00.000Z', title: 'old' })
    const out = mergeIncoming(
      { 'paper:a': seen },
      [raw({ id: 'paper:a', title: 'new title' })],
      [],
      NOW
    )
    expect(out['paper:a']).toEqual(seen)
  })

  test('한 번에 온 중복은 먼저 온 출처가 남는다', () => {
    const out = mergeIncoming(
      {},
      [raw({ id: 'paper:a', source: 'OpenAlex' }), raw({ id: 'paper:a', source: 'arXiv' })],
      [],
      NOW
    )
    expect(Object.keys(out)).toEqual(['paper:a'])
    expect(out['paper:a'].source).toBe('OpenAlex')
  })

  test('새 항목의 초기값', () => {
    const it = mergeIncoming(
      {},
      [raw({ id: 'paper:b', title: 'XAI for bridges', summary: 'structural analysis' })],
      ['xai', 'structural analysis', 'gnn'],
      NOW
    )['paper:b']
    expect(it).toMatchObject({
      matched: ['xai', 'structural analysis'],
      collectedAt: NOW,
      seenAt: null,
      saved: false,
      hidden: false
    })
  })

  test('입력 items를 바꾸지 않는다', () => {
    const items = { 'paper:a': mk({ id: 'paper:a' }) }
    mergeIncoming(items, [raw({ id: 'paper:b' })], [], NOW)
    expect(Object.keys(items)).toEqual(['paper:a'])
  })
})

test('pruneOld', () => {
  const old = '2026-01-01T00:00:00.000Z'
  const out = pruneOld(
    {
      a: mk({ id: 'a', collectedAt: old, seenAt: old }),
      b: mk({ id: 'b', collectedAt: old, seenAt: old, saved: true }),
      c: mk({ id: 'c', collectedAt: old, seenAt: null })
    },
    NOW
  )
  expect(Object.keys(out).sort()).toEqual(['b', 'c'])
})

test('score 순서', () => {
  const now = new Date(NOW)
  expect(score(mk({ title: 'xai', matched: ['xai'] }), now)).toBeGreaterThan(
    score(mk({ title: 'other', matched: [] }), now)
  )
  expect(score(mk({ date: NOW }), now)).toBeGreaterThan(
    score(mk({ date: '2026-10-01T00:00:00.000Z' }), now)
  )
  expect(score(mk({ stars: 1200 }), now)).toBeGreaterThan(score(mk({ stars: 3 }), now))
})
