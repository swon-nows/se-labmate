import { describe, expect, test } from 'vitest'
import { applyCollected, mergeIncoming, pruneOld } from '../../src/main/core/merge'
import { score } from '../../src/main/core/relevance'
import { NOW, mk, raw, st } from '../helpers'

const daysBefore = (n: number): string => new Date(Date.parse(NOW) - n * 86_400_000).toISOString()

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

  test('90일보다 오래된 항목은 받지 않는다', () => {
    const out = mergeIncoming(
      {},
      [
        raw({ id: 'paper:old', date: daysBefore(91) }),
        raw({ id: 'paper:recent', date: daysBefore(89) })
      ],
      [],
      NOW
    )
    expect(Object.keys(out)).toEqual(['paper:recent'])
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

test('pruneOld는 179일 된 것은 두고 181일 된 것은 뺀다', () => {
  const out = pruneOld(
    {
      keep: mk({ id: 'keep', collectedAt: daysBefore(179), seenAt: daysBefore(179) }),
      drop: mk({ id: 'drop', collectedAt: daysBefore(181), seenAt: daysBefore(181) })
    },
    NOW
  )
  expect(Object.keys(out)).toEqual(['keep'])
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

describe('applyCollected', () => {
  test('수집 중에 확인한 항목은 확인된 채로 남고, 새 id만 더해지고, sourceErrors는 바뀐다', () => {
    const live = st({
      items: { 'paper:a': mk({ id: 'paper:a', seenAt: NOW, saved: true }) },
      sourceErrors: { arXiv: 'old' }
    })
    const collected = st({
      items: { 'paper:a': mk({ id: 'paper:a' }), 'paper:b': mk({ id: 'paper:b' }) },
      sourceErrors: { GitHub: 'HTTP 403' }
    })
    const liveCopy = structuredClone(live)
    const collectedCopy = structuredClone(collected)
    const out = applyCollected(live, collected, NOW)
    expect(out.items['paper:a']).toEqual(live.items['paper:a'])
    expect(out.items['paper:b']).toEqual(collected.items['paper:b'])
    expect(out.sourceErrors).toEqual({ GitHub: 'HTTP 403' })
    expect(live).toEqual(liveCopy)
    expect(collected).toEqual(collectedCopy)
  })

  test('live의 다른 필드는 그대로 두고 오래된 항목은 정리한다', () => {
    const old = daysBefore(181)
    const live = st({
      lastNotifiedAt: NOW,
      items: { 'paper:old': mk({ id: 'paper:old', collectedAt: old, seenAt: old }) }
    })
    const out = applyCollected(live, st(), NOW)
    expect(out.lastNotifiedAt).toBe(NOW)
    expect(out.items).toEqual({})
  })
})
