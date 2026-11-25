import type { AppState, CollectStatus } from '../../shared/types'
import { applyCollected } from './merge'

export interface CollectRunnerDeps {
  getState(): AppState
  update(next: AppState): void
  collect(state: AppState): Promise<AppState>
  now(): Date
  onStatus(status: CollectStatus): void
}

export interface CollectRunner {
  collectNow(): Promise<void> // 도는 중이면 그 수집에 합류한다
  collectFresh(): Promise<void> // 도는 중이면 끝난 뒤 그때 상태로 한 번 더 돈다(여러 번 불러도 한 번)
  status(): CollectStatus
}

// 돌려주는 Promise는 어느 것도 거부하지 않는다.
export function createCollectRunner(d: CollectRunnerDeps): CollectRunner {
  let current: Promise<void> | null = null
  let queued: Promise<void> | null = null
  let lastFinishedAt: string | null = null

  const status = (): CollectStatus => ({
    running: current !== null,
    lastFinishedAt,
    errors: d.getState().sourceErrors
  })

  async function run(): Promise<void> {
    try {
      const collected = await d.collect(d.getState())
      // await 뒤에 getState()를 다시 읽어야 수집 중에 바뀐 확인·저장·숨김을 잃지 않는다.
      d.update(applyCollected(d.getState(), collected, d.now().toISOString()))
    } catch (e) {
      console.error('수집 실패', e)
    } finally {
      current = null
      lastFinishedAt = d.now().toISOString()
      d.onStatus(status())
    }
  }

  function collectNow(): Promise<void> {
    if (!current) {
      // run은 다음 마이크로태스크에 시작한다: current가 정해진 뒤에야 finally가 그것을 지울 수 있다.
      current = Promise.resolve().then(run)
      d.onStatus(status())
    }
    return current
  }

  function collectFresh(): Promise<void> {
    if (!current) return collectNow()
    queued ??= current.then(() => {
      queued = null
      return collectNow()
    })
    return queued
  }

  return { collectNow, collectFresh, status }
}

export const KEY_UNREADABLE =
  '저장된 키를 읽을 수 없습니다. Settings에서 키를 다시 입력해 주십시오.'

// 저장된 키를 풀지 못하면 키 없이 수집한다. 수집기는 건너뛴 출처의 오류를 지우므로 수집 뒤에 남긴다.
export function markUnreadableKey(collected: AppState, decryptedKey: string | null): AppState {
  if (collected.openAlexKeyEnc === null || decryptedKey !== null) return collected
  if (!collected.settings.enabled.paper) return collected
  return { ...collected, sourceErrors: { ...collected.sourceErrors, OpenAlex: KEY_UNREADABLE } }
}
