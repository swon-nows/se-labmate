import { activeSources, allUnreachable } from '../../shared/sources'
import type { AppState } from '../../shared/types'
import { KEY_UNREADABLE } from './collect-runner'
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
  let notBefore = 0 // 모두 닿지 못한 뒤 다시 해 볼 수 있는 시각(ms)
  return async () => {
    if (busy) return
    busy = true
    try {
      const s = d.getState()
      const now = d.now()
      if (now.getTime() < notBefore) return
      // 깨어난 직후처럼 아직 오프라인이면 오늘 몫을 쓰지 않는다. 다음 확인(30초 뒤)에 다시 본다.
      if (!d.isOnline() || !shouldRunDaily(now, s.settings.notifyTime, s.lastDailyRunAt)) return
      // 수집 전에 먼저 저장해서, 수집 중에 앱이 꺼져도 같은 날 다시 돌지 않게 한다.
      d.update({ ...s, lastDailyRunAt: now.toISOString() })
      await d.collectNow()
      const after = d.getState()
      // 깨어난 직후 온라인 표시만 남은 경우처럼 모두 닿지 못했으면 오늘 몫을 되돌리고 5분 뒤에 다시 본다.
      // 닿았지만 실패한 것(사이트가 바뀜 등)은 다시 해도 같으므로 평소처럼 오늘 몫을 쓴다.
      // 키를 풀지 못한 OpenAlex는 요청하지 않았으므로 닿았는지 따지는 데 넣지 않는다.
      const sources = after.profile
        ? activeSources(
            after.profile,
            after.settings,
            after.openAlexKeyEnc !== null && after.sourceErrors.OpenAlex !== KEY_UNREADABLE,
            after.boards
          ).map((x) => x.name)
        : []
      if (allUnreachable(sources, after.sourceErrors)) {
        notBefore = d.now().getTime() + 5 * 60_000 // 쓰기가 던져도 5분 간격은 지킨다
        d.update({ ...after, lastDailyRunAt: s.lastDailyRunAt })
        return
      }
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
