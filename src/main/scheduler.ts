import { powerMonitor } from 'electron'
import type { AppState } from '../shared/types'
import { unseenCounts } from './core/feed'
import { notificationBody, shouldNotify, shouldRunDaily } from './core/schedule'

export interface SchedulerDeps {
  getState(): AppState
  update(next: AppState): void
  collectNow(): Promise<void> // 거부하지 않는다
  notify(body: string): void
}

// 30초마다, 그리고 절전에서 깨어날 때 일정을 확인한다. 이전 확인이 끝나기 전의 호출은 건너뛴다.
export function startScheduler(d: SchedulerDeps): void {
  let busy = false
  const tick = async (): Promise<void> => {
    if (busy) return
    busy = true
    try {
      const s = d.getState()
      const now = new Date()
      if (!shouldRunDaily(now, s.settings.notifyTime, s.lastDailyRunAt)) return
      // 수집 전에 먼저 저장해서, 수집 중에 앱이 꺼져도 같은 날 다시 돌지 않게 한다.
      d.update({ ...s, lastDailyRunAt: now.toISOString() })
      await d.collectNow()
      const after = d.getState()
      if (shouldNotify(after)) {
        d.notify(notificationBody(unseenCounts(after)))
        d.update({ ...after, lastNotifiedAt: new Date().toISOString() })
      }
    } catch (e) {
      console.error('일정 확인 실패', e)
    } finally {
      busy = false
    }
  }
  setInterval(tick, 30_000)
  powerMonitor.on('resume', tick)
  void tick()
}
