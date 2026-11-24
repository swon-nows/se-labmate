import type { AppState } from '../../shared/types'
import { unseenCounts } from './feed'
import { notificationBody, shouldNotify, shouldRunDaily } from './schedule'

export interface TickDeps {
  getState(): AppState
  update(next: AppState): void
  now(): Date
  isOnline(): boolean
  collectNow(): Promise<void>
  notify(body: string): void
}

// 한 번의 일정 확인. 이전 확인이 끝나기 전에 온 호출은 건너뛰고, 돌려주는 Promise는 거부하지 않는다.
export function createTick(d: TickDeps): () => Promise<void> {
  let busy = false
  return async () => {
    if (busy) return
    busy = true
    try {
      const s = d.getState()
      const now = d.now()
      // 깨어난 직후처럼 아직 오프라인이면 오늘 몫을 쓰지 않는다. 다음 확인(30초 뒤)에 다시 본다.
      if (!d.isOnline() || !shouldRunDaily(now, s.settings.notifyTime, s.lastDailyRunAt)) return
      // 수집 전에 먼저 저장해서, 수집 중에 앱이 꺼져도 같은 날 다시 돌지 않게 한다.
      d.update({ ...s, lastDailyRunAt: now.toISOString() })
      await d.collectNow()
      const after = d.getState()
      if (shouldNotify(after)) {
        d.notify(notificationBody(unseenCounts(after)))
        d.update({ ...after, lastNotifiedAt: d.now().toISOString() })
      }
    } catch (e) {
      console.error('일정 확인 실패', e)
    } finally {
      busy = false
    }
  }
}
