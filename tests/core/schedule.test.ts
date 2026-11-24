import { expect, test } from 'vitest'
import {
  lastDue,
  notificationBody,
  shouldNotify,
  shouldRunDaily
} from '../../src/main/core/schedule'
import { mk, st } from '../helpers'

const L = (y: number, m: number, d: number, h: number, mi: number): Date =>
  new Date(y, m - 1, d, h, mi)

test('lastDue', () => {
  expect(lastDue(L(2026, 11, 24, 9, 0), '09:00')).toEqual(L(2026, 11, 24, 9, 0))
  expect(lastDue(L(2026, 11, 24, 8, 59), '09:00')).toEqual(L(2026, 11, 23, 9, 0))
  expect(lastDue(L(2026, 11, 24, 0, 5), '23:50')).toEqual(L(2026, 11, 23, 23, 50)) // 자정 넘김
})

test('하루 한 번만', () => {
  const ranYesterday = L(2026, 11, 23, 9, 0).toISOString()
  expect(shouldRunDaily(L(2026, 11, 24, 8, 59), '09:00', ranYesterday)).toBe(false)
  expect(shouldRunDaily(L(2026, 11, 24, 9, 0), '09:00', ranYesterday)).toBe(true)
  expect(shouldRunDaily(L(2026, 11, 24, 9, 1), '09:00', L(2026, 11, 24, 9, 0).toISOString())).toBe(
    false
  )
  expect(shouldRunDaily(L(2026, 11, 24, 14, 0), '09:00', L(2026, 11, 20, 9, 0).toISOString())).toBe(
    true
  ) // 며칠 꺼 둠
  expect(shouldRunDaily(L(2026, 11, 24, 7, 0), '09:00', L(2026, 11, 22, 9, 0).toISOString())).toBe(
    true
  ) // 어제 분을 놓침
  expect(shouldRunDaily(L(2026, 11, 24, 14, 0), '09:00', null)).toBe(false)
})

test('shouldNotify', () => {
  const t0 = '2026-11-23T00:00:00.000Z'
  const t1 = '2026-11-24T00:00:00.000Z'
  expect(
    shouldNotify(st({ items: { a: mk({ id: 'a', collectedAt: t1 }) }, lastNotifiedAt: t0 }))
  ).toBe(true)
  expect(
    shouldNotify(st({ items: { a: mk({ id: 'a', collectedAt: t0 }) }, lastNotifiedAt: t1 }))
  ).toBe(false) // 그 뒤 새로 온 것이 없음
  expect(
    shouldNotify(
      st({ items: { a: mk({ id: 'a', collectedAt: t1, seenAt: t1 }) }, lastNotifiedAt: t0 })
    )
  ).toBe(false)
  expect(shouldNotify(st({ items: {}, lastNotifiedAt: null }))).toBe(false)
})

test('shouldNotify 경계', () => {
  const t0 = '2026-11-23T00:00:00.000Z'
  const t1 = '2026-11-24T00:00:00.000Z'
  // 알린 적 없고 보이는 미확인이 하나 있음
  expect(
    shouldNotify(st({ items: { a: mk({ id: 'a', collectedAt: t1 }) }, lastNotifiedAt: null }))
  ).toBe(true)
  // 숨긴 항목은 알리지 않는다
  expect(
    shouldNotify(
      st({ items: { a: mk({ id: 'a', collectedAt: t1, hidden: true }) }, lastNotifiedAt: t0 })
    )
  ).toBe(false)
  // 꺼 둔 카테고리는 알리지 않는다
  expect(
    shouldNotify(
      st({
        items: { a: mk({ id: 'a', category: 'news', collectedAt: t1 }) },
        enabled: { news: false },
        lastNotifiedAt: t0
      })
    )
  ).toBe(false)
  // 마지막 알림과 같은 시각에 모은 것은 이미 알렸다
  expect(
    shouldNotify(st({ items: { a: mk({ id: 'a', collectedAt: t1 }) }, lastNotifiedAt: t1 }))
  ).toBe(false)
})

test('알림 문구', () => {
  expect(notificationBody({ paper: 3, repo: 2, news: 1, conference: 1 })).toBe(
    '새 소식 7건 (논문 3 · 저장소 2 · 뉴스 1 · 학회 1)'
  )
  expect(notificationBody({ news: 2 })).toBe('새 소식 2건 (뉴스 2)')
  expect(notificationBody({})).toBe('새 소식 0건')
  expect(notificationBody({ paper: 0, news: 2 })).toBe('새 소식 2건 (뉴스 2)')
})
