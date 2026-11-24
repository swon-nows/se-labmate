import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  KEY_UNREADABLE,
  createCollectRunner,
  markUnreadableKey
} from '../../src/main/core/collect-runner'
import type { CollectRunner } from '../../src/main/core/collect-runner'
import type { AppState, CollectStatus } from '../../src/shared/types'
import { NOW, mk, st } from '../helpers'

interface Deferred<T> {
  promise: Promise<T>
  resolve(v: T): void
  reject(e: unknown): void
}
function deferred<T>(): Deferred<T> {
  const d = {} as Deferred<T>
  d.promise = new Promise<T>((resolve, reject) => Object.assign(d, { resolve, reject }))
  return d
}
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

interface Harness {
  runner: CollectRunner
  statuses: CollectStatus[]
  calls: { state: AppState; done: Deferred<AppState> }[]
  get(): AppState
  set(s: AppState): void
}

function setup(initial: AppState): Harness {
  let state = initial
  const statuses: CollectStatus[] = []
  const calls: { state: AppState; done: Deferred<AppState> }[] = []
  const runner = createCollectRunner({
    getState: () => state,
    update: (next) => {
      state = next
    },
    now: () => new Date(NOW),
    onStatus: (s) => statuses.push(s),
    collect: (s) => {
      const done = deferred<AppState>()
      calls.push({ state: s, done })
      return done.promise
    }
  })
  return {
    runner,
    statuses,
    calls,
    get: () => state,
    set: (s: AppState) => {
      state = s
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createCollectRunner', () => {
  test('도는 중에 다시 부르면 수집은 한 번이고 둘 다 끝난다', async () => {
    const t = setup(st())
    const a = t.runner.collectNow()
    const b = t.runner.collectNow()
    await flush()
    expect(t.calls).toHaveLength(1)
    t.calls[0].done.resolve(t.calls[0].state)
    await expect(Promise.all([a, b])).resolves.toEqual([undefined, undefined])
    expect(t.calls).toHaveLength(1)
  })

  test('상태는 시작에 running true, 끝에 running false·lastFinishedAt·errors', async () => {
    const t = setup(st())
    const p = t.runner.collectNow()
    expect(t.statuses).toEqual([{ running: true, lastFinishedAt: null, errors: {} }])
    expect(t.runner.status().running).toBe(true)
    await flush()
    t.calls[0].done.resolve(st({ sourceErrors: { GitHub: 'HTTP 403' } }))
    await p
    expect(t.statuses[1]).toEqual({
      running: false,
      lastFinishedAt: NOW,
      errors: { GitHub: 'HTTP 403' }
    })
    expect(t.runner.status()).toEqual(t.statuses[1])
  })

  test('수집 중에 확인한 항목은 결과를 합친 뒤에도 확인된 채다', async () => {
    const before = st({ items: { a: mk({ id: 'a' }) } })
    const t = setup(before)
    const p = t.runner.collectNow()
    await flush()
    t.set({ ...before, items: { a: mk({ id: 'a', seenAt: NOW }) } })
    t.calls[0].done.resolve({ ...before, items: { a: mk({ id: 'a' }), b: mk({ id: 'b' }) } })
    await p
    expect(t.get().items.a.seenAt).toBe(NOW)
    expect(t.get().items.b).toBeDefined()
  })

  test('collect가 거부해도 running false로 끝나고, resolve하고, 다음 호출은 새로 돈다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const t = setup(st())
    const p = t.runner.collectNow()
    await flush()
    t.calls[0].done.reject(new Error('bad state'))
    await expect(p).resolves.toBeUndefined()
    expect(t.statuses.at(-1)?.running).toBe(false)
    void t.runner.collectNow()
    await flush()
    expect(t.calls).toHaveLength(2)
  })

  test('도는 중의 collectFresh는 여러 번이어도 끝난 뒤 그때 상태로 한 번만 더 돈다', async () => {
    const t = setup(st())
    const first = t.runner.collectNow()
    await flush()
    const fresh = [t.runner.collectFresh(), t.runner.collectFresh(), t.runner.collectFresh()]
    expect(fresh[1]).toBe(fresh[0])
    expect(fresh[2]).toBe(fresh[0])
    const profile = { keywordsEn: ['physics-informed'], keywordsKo: [], country: 'OTHER' as const }
    t.set({ ...t.get(), profile })
    t.calls[0].done.resolve(t.calls[0].state)
    await first
    await flush()
    expect(t.calls).toHaveLength(2)
    expect(t.calls[1].state.profile).toEqual(profile)
    t.calls[1].done.resolve(t.calls[1].state)
    await Promise.all(fresh)
    await flush()
    expect(t.calls).toHaveLength(2)
    expect(t.statuses.map((s) => s.running)).toEqual([true, false, true, false])
  })

  test('쉬는 중의 collectFresh는 바로 돈다', async () => {
    const t = setup(st())
    const p = t.runner.collectFresh()
    await flush()
    expect(t.calls).toHaveLength(1)
    t.calls[0].done.resolve(t.calls[0].state)
    await p
    await flush()
    expect(t.calls).toHaveLength(1)
  })
})

describe('markUnreadableKey', () => {
  const withKey = st({ openAlexKeyEnc: 'enc', sourceErrors: { GitHub: 'HTTP 403' } })
  test('저장된 키를 풀지 못했고 논문이 켜져 있으면 OpenAlex 오류를 남긴다', () => {
    expect(markUnreadableKey(withKey, null).sourceErrors).toEqual({
      GitHub: 'HTTP 403',
      OpenAlex: KEY_UNREADABLE
    })
    expect(KEY_UNREADABLE).toBe('저장된 키를 읽을 수 없습니다. 설정에서 키를 다시 입력해 주십시오.')
  })
  test('키를 풀었거나, 저장된 키가 없거나, 논문이 꺼져 있으면 그대로', () => {
    expect(markUnreadableKey(withKey, 'k')).toBe(withKey)
    const noKey = st()
    expect(markUnreadableKey(noKey, null)).toBe(noKey)
    const paperOff = st({ openAlexKeyEnc: 'enc', enabled: { paper: false } })
    expect(markUnreadableKey(paperOff, null)).toBe(paperOff)
  })
})
