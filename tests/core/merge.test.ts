import { describe, expect, test } from 'vitest'
import { applyCollected, mergeIncoming, pruneOld } from '../../src/main/core/merge'
import { score } from '../../src/main/core/relevance'
import { FIELD_BOARDS } from '../../src/shared/sources'
import type { Item } from '../../src/shared/types'
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

  test('같은 수집의 중복은 먼저 온 것의 빈 값만 나중 것으로 채우고, 채운 뒤에 matched를 계산한다', () => {
    const out = mergeIncoming(
      {},
      [
        raw({ id: 'paper:a', source: 'OpenAlex', venue: 'J', keywords: ['k'], summary: '' }),
        raw({ id: 'paper:a', source: 'arXiv', summary: 'We propose xai.', keywords: ['cs.LG'] })
      ],
      ['xai'],
      NOW
    )
    expect(out['paper:a']).toMatchObject({
      source: 'OpenAlex',
      venue: 'J',
      keywords: ['k'],
      summary: 'We propose xai.',
      matched: ['xai']
    })
    const later = mergeIncoming(
      {},
      [
        raw({ id: 'paper:b', source: 'OpenAlex', summary: '' }),
        raw({ id: 'paper:b', source: 'arXiv', venue: 'V', keywords: ['cs.LG'], summary: 's' })
      ],
      [],
      NOW
    )['paper:b']
    expect(later).toMatchObject({
      source: 'OpenAlex',
      venue: 'V',
      keywords: ['cs.LG'],
      summary: 's'
    })
  })

  test('이전 수집에서 저장된 항목은 같은 id가 와도 채우지 않는다', () => {
    const saved = mk({ id: 'paper:a', summary: '' })
    const out = mergeIncoming(
      { 'paper:a': saved },
      [raw({ id: 'paper:a', summary: 'We propose xai.', venue: 'J' })],
      ['xai'],
      NOW
    )
    expect(out['paper:a']).toEqual(saved)
  })

  test('새 항목의 초기값', () => {
    const it = mergeIncoming(
      {},
      [
        raw({
          id: 'paper:b',
          title: 'XAI for bridges',
          summary: 'structural analysis',
          deadline: '2027-01-23T11:59:59.000Z'
        })
      ],
      ['xai', 'structural analysis', 'gnn'],
      NOW
    )['paper:b']
    expect(it).toMatchObject({
      deadline: '2027-01-23T11:59:59.000Z',
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

describe('pruneOld: 90일 넘은 본 항목은 카테고리마다 최근 100건만', () => {
  // i번째가 가장 최근에 본 것: seenAt은 i일 전부터 거슬러 올라간다.
  const many = (n: number, p: (i: number) => Parameters<typeof mk>[0]): Record<string, Item> =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => {
        const id = `paper:${i}`
        return [id, mk({ id, seenAt: daysBefore(i + 1), ...p(i) })]
      })
    )
  const oldDate = { date: daysBefore(100), collectedAt: daysBefore(100) }

  test('날짜가 100일 된 본 논문 105건: 가장 먼저 본 5건이 빠지고 100건이 남는다', () => {
    const out = pruneOld(
      many(105, () => oldDate),
      NOW
    )
    expect(Object.keys(out)).toHaveLength(100)
    for (let i = 0; i < 100; i++) expect(out[`paper:${i}`]).toBeDefined()
    for (let i = 100; i < 105; i++) expect(out[`paper:${i}`]).toBeUndefined()
  })

  test('가장 먼저 본 쪽에 있어도 저장한 항목과 아직 안 본 항목은 남는다', () => {
    const items = {
      ...many(105, (i) => ({ ...oldDate, saved: i === 104 })),
      'paper:unseen': mk({ id: 'paper:unseen', seenAt: null, ...oldDate })
    }
    const out = pruneOld(items, NOW)
    expect(out['paper:104']).toBeDefined()
    expect(out['paper:unseen']).toBeDefined()
    expect(Object.keys(out)).toHaveLength(102)
  })

  test('날짜가 80일 된 본 항목은 100건을 넘어도 모두 남는다', () => {
    const out = pruneOld(
      many(105, () => ({ date: daysBefore(80), collectedAt: daysBefore(80) })),
      NOW
    )
    expect(Object.keys(out)).toHaveLength(105)
  })

  test('카테고리는 따로 센다', () => {
    const items = {
      ...many(100, () => oldDate),
      ...Object.fromEntries(
        Array.from({ length: 100 }, (_, i) => {
          const id = `repo:${i}`
          return [id, mk({ id, category: 'repo' as const, seenAt: daysBefore(i + 1), ...oldDate })]
        })
      )
    }
    expect(Object.keys(pruneOld(items, NOW))).toHaveLength(200)
  })
})

test('정리된 항목은 181일 뒤 같은 id·같은 날짜로 다시 와도 들어오지 않는다', () => {
  const r = raw({ id: 'paper:a', date: NOW })
  const seen = { 'paper:a': { ...mergeIncoming({}, [r], [], NOW)['paper:a'], seenAt: NOW } }
  const later = new Date(Date.parse(NOW) + 181 * 86_400_000).toISOString()
  const pruned = pruneOld(seen, later)
  expect(pruned).toEqual({})
  expect(mergeIncoming(pruned, [r], [], later)).toEqual({})
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
  // 앞날(행사일): 가까운 행사가 먼 행사보다 위, 1년보다 먼 행사는 30일 지난 글과 같다
  const ahead = (d: number): number =>
    score(mk({ date: new Date(now.getTime() + d * 864e5).toISOString() }), now)
  expect(ahead(5)).toBeGreaterThan(ahead(200))
  expect(ahead(200)).toBeGreaterThan(ahead(400))
  expect(ahead(400)).toBe(score(mk({ date: '2026-10-01T00:00:00.000Z' }), now))
  expect(score(mk({ date: NOW }), now)).toBeGreaterThan(ahead(5))
})

test('한 주 인기 저장소는 이번 주에 받은 별이 많을수록 높고, 별 합계·일치 키워드와 무관하다', () => {
  const now = new Date(NOW)
  const repo = (weekStars: number, p: Parameters<typeof mk>[0] = {}): number =>
    score(mk({ category: 'repo', weekStars, ...p }), now)
  expect(repo(900, { stars: 5, matched: [] })).toBeGreaterThan(
    repo(800, { stars: 90_000, title: 'xai', matched: ['xai'] })
  )
  expect(repo(1)).toBe(1)
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

  test('boardKnown은 수집한 쪽의 것을 쓴다', () => {
    const live = st({ boardKnown: { iris: ['old'] } })
    const collected = st({ boardKnown: { iris: ['a', 'https://a.b/a'], nrf: ['b'] } })
    expect(applyCollected(live, collected, NOW).boardKnown).toEqual(collected.boardKnown)
  })

  test('수집 중에 지운 게시판의 boardKnown은 되살아나지 않는다', () => {
    const board = { id: 'b1', name: '공고판', url: 'https://a.b/', category: 'school' as const }
    const live = st({ boards: [board] })
    const collected = st({ boardKnown: { iris: ['a'], b1: ['b'], gone: ['c'] } })
    expect(applyCollected(live, collected, NOW).boardKnown).toEqual({ iris: ['a'], b1: ['b'] })
  })

  test('분야 게시판의 boardKnown은 live에 등록하지 않아도 남는다', () => {
    const id = FIELD_BOARDS[0].id
    const collected = st({ boardKnown: { [id]: ['a'], gone: ['c'] } })
    expect(applyCollected(st(), collected, NOW).boardKnown).toEqual({ [id]: ['a'] })
  })
})
