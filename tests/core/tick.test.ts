import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Mock } from 'vitest'
import { unseenCounts } from '../../src/main/core/feed'
import { notificationBody } from '../../src/main/core/schedule'
import { createTick } from '../../src/main/core/tick'
import type { AppState } from '../../src/shared/types'
import { NOW, mk, st } from '../helpers'

const profile = { keywordsEn: ['xai'], keywordsKo: [], country: 'KR' as const }
const OLD_RUN = '2026-11-20T00:00:00.000Z' // 어느 시간대에서도 NOW 기준 일정이 지난 값
const due = (): AppState => st({ profile, lastDailyRunAt: OLD_RUN })

interface Harness {
  tick(): Promise<void>
  notify: Mock<(body: string) => void>
  collect: Mock<() => Promise<void>>
  get(): AppState
  set(s: AppState): void
}

function setup(initial: AppState, collectNow: () => Promise<void>, online = true): Harness {
  let state = initial
  const notify = vi.fn<(body: string) => void>()
  const collect = vi.fn(collectNow)
  const tick = createTick({
    getState: () => state,
    update: (next) => {
      state = next
    },
    now: () => new Date(NOW),
    isOnline: () => online,
    collectNow: collect,
    notify
  })
  return {
    tick,
    notify,
    collect,
    get: () => state,
    set: (s: AppState) => {
      state = s
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createTick', () => {
  test('오프라인이면 수집하지 않고 lastDailyRunAt도 그대로', async () => {
    const t = setup(due(), async () => {}, false)
    await t.tick()
    expect(t.collect).not.toHaveBeenCalled()
    expect(t.get().lastDailyRunAt).toBe(OLD_RUN)
  })

  test('일정이 됐고 온라인이면: 먼저 저장, 한 번 수집, 새 항목이 있으면 알림 한 번', async () => {
    let savedAtCollect: string | null = null
    const t = setup(due(), async () => {
      savedAtCollect = t.get().lastDailyRunAt
      t.set({ ...t.get(), items: { a: mk({ id: 'a' }) } })
    })
    await t.tick()
    expect(savedAtCollect).toBe(NOW)
    expect(t.collect).toHaveBeenCalledTimes(1)
    expect(t.notify).toHaveBeenCalledTimes(1)
    expect(t.notify).toHaveBeenCalledWith(notificationBody(unseenCounts(t.get())))
    expect(t.notify).toHaveBeenCalledWith('새 소식 1건 (논문 1)')
    expect(t.get().lastNotifiedAt).toBe(NOW)
  })

  test('새 항목이 없으면 알림이 없다', async () => {
    const t = setup(due(), async () => {})
    await t.tick()
    expect(t.notify).not.toHaveBeenCalled()
    expect(t.get().lastNotifiedAt).toBeNull()
  })

  test('일정이 아직이면 아무것도 하지 않는다', async () => {
    const before = st({ profile, lastDailyRunAt: NOW })
    const t = setup(before, async () => {})
    await t.tick()
    expect(t.collect).not.toHaveBeenCalled()
    expect(t.notify).not.toHaveBeenCalled()
    expect(t.get()).toBe(before)
  })

  test('수집을 기다리는 중에 온 두 번째 호출은 건너뛴다', async () => {
    let finish: () => void = () => {}
    const t = setup(due(), () => new Promise<void>((r) => (finish = r)))
    const first = t.tick()
    await t.tick()
    expect(t.collect).toHaveBeenCalledTimes(1)
    finish()
    await first
  })

  test('collectNow가 던져도 다음 호출은 돈다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const t = setup(due(), () => Promise.reject(new Error('boom')))
    await expect(t.tick()).resolves.toBeUndefined()
    t.set(due())
    await t.tick()
    expect(t.collect).toHaveBeenCalledTimes(2)
  })
})
