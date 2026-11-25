import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Mock } from 'vitest'
import { KEY_UNREADABLE } from '../../src/main/core/collect-runner'
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
  at(iso: string): void // 시계를 옮긴다
}

function setup(initial: AppState, collectNow: () => Promise<void>, online = true): Harness {
  let state = initial
  let clock = NOW
  const notify = vi.fn<(body: string) => void>()
  const collect = vi.fn(collectNow)
  const tick = createTick({
    getState: () => state,
    update: (next) => {
      state = next
    },
    now: () => new Date(clock),
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
    },
    at: (iso: string) => {
      clock = iso
    }
  }
}

const later = (minutes: number): string =>
  new Date(Date.parse(NOW) + minutes * 60_000).toISOString()

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
    expect(t.notify).toHaveBeenCalledWith('1 new (Papers 1)')
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

  test('켜진 출처가 모두 닿지 않으면(오프라인) 오늘 몫을 쓰지 않고 5분 뒤에 다시 돈다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let fail = true
    const t = setup(due(), async () => {
      const s = t.get()
      if (fail)
        t.set({
          ...s,
          sourceErrors: {
            arXiv: '요청 시간 초과',
            GitHub: '네트워크 오류',
            'Google News (EN)': '네트워크 오류',
            IRIS: '네트워크 오류',
            한국연구재단: '요청 시간 초과'
          }
        })
      else
        t.set({
          ...s,
          sourceErrors: {},
          items: { a: mk({ id: 'a', collectedAt: t.get().lastDailyRunAt ?? NOW }) }
        })
    })
    await t.tick()
    expect(t.collect).toHaveBeenCalledTimes(1)
    expect(t.get().lastDailyRunAt).toBe(OLD_RUN)
    expect(t.notify).not.toHaveBeenCalled()

    t.at(later(1))
    await t.tick()
    expect(t.collect).toHaveBeenCalledTimes(1)

    fail = false
    t.at(later(5))
    await t.tick()
    expect(t.collect).toHaveBeenCalledTimes(2)
    expect(t.get().lastDailyRunAt).toBe(later(5))
    expect(t.notify).toHaveBeenCalledTimes(1)

    t.at(later(10))
    await t.tick()
    expect(t.collect).toHaveBeenCalledTimes(2)
    expect(t.notify).toHaveBeenCalledTimes(1)
  })

  test('모두 실패해도 닿기는 했으면(사이트가 바뀜) 오늘 몫을 쓰고 평소대로 알린다', async () => {
    const t = setup(due(), async () => {
      t.set({
        ...t.get(),
        sourceErrors: {
          arXiv: 'HTTP 404',
          GitHub: 'HTTP 404',
          'Google News (EN)': '네트워크 오류',
          IRIS: 'IRIS 응답에 목록이 없습니다',
          한국연구재단: '한국연구재단 페이지에서 목록을 찾지 못했습니다'
        },
        items: { a: mk({ id: 'a' }) }
      })
    })
    await t.tick()
    expect(t.get().lastDailyRunAt).toBe(NOW)
    expect(t.notify).toHaveBeenCalledTimes(1)
    expect(t.notify).toHaveBeenCalledWith('1 new (Papers 1)')
    t.at(later(5))
    await t.tick()
    expect(t.collect).toHaveBeenCalledTimes(1)
  })

  test('키를 풀지 못한 OpenAlex는 요청하지 않았으므로 오프라인 판단에 넣지 않는다', async () => {
    const t = setup({ ...due(), openAlexKeyEnc: 'ZW5j' }, async () => {
      t.set({
        ...t.get(),
        sourceErrors: {
          OpenAlex: KEY_UNREADABLE,
          arXiv: '네트워크 오류',
          GitHub: '네트워크 오류',
          'Google News (EN)': '네트워크 오류',
          IRIS: '네트워크 오류',
          한국연구재단: '네트워크 오류'
        }
      })
    })
    await t.tick()
    expect(t.get().lastDailyRunAt).toBe(OLD_RUN)
  })

  test('일부 출처만 실패하면 평소대로 오늘 몫을 쓴다', async () => {
    const t = setup(due(), async () => {
      t.set({ ...t.get(), sourceErrors: { GitHub: 'HTTP 403' }, items: { a: mk({ id: 'a' }) } })
    })
    await t.tick()
    expect(t.get().lastDailyRunAt).toBe(NOW)
    expect(t.notify).toHaveBeenCalledTimes(1)
  })

  test('모두 실패해 되돌리는 쓰기가 던져도 5분 동안은 다시 돌지 않고, 5분 뒤에는 돈다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const errors = {
      arXiv: '요청 시간 초과',
      GitHub: '네트워크 오류',
      'Google News (EN)': '네트워크 오류',
      IRIS: '네트워크 오류',
      한국연구재단: '네트워크 오류'
    }
    let state = due()
    let clock = NOW
    let fail = true
    const collect = vi.fn(async () => {
      state = { ...state, sourceErrors: fail ? errors : {} }
    })
    const tick = createTick({
      getState: () => state,
      // 메모리에 반영한 뒤 던지는 쓰기(index.ts의 update에서 저장 뒤 트레이 갱신이 던지는 경우)
      update: (next) => {
        state = next
        if (fail && next.lastDailyRunAt === OLD_RUN) throw new Error('write failed')
      },
      now: () => new Date(clock),
      isOnline: () => true,
      collectNow: collect,
      notify: vi.fn()
    })
    await tick()
    expect(state.lastDailyRunAt).toBe(OLD_RUN)
    clock = later(1)
    await tick()
    expect(collect).toHaveBeenCalledTimes(1)
    fail = false
    clock = later(5)
    await tick()
    expect(collect).toHaveBeenCalledTimes(2)
    expect(state.lastDailyRunAt).toBe(later(5))
  })
})
