import { powerMonitor } from 'electron'

// 30초마다, 그리고 절전에서 깨어날 때 일정을 확인한다. tick은 거부하지 않고 겹침도 스스로 막는다.
export function startScheduler(tick: () => Promise<void>): void {
  setInterval(tick, 30_000)
  powerMonitor.on('resume', tick)
  void tick()
}
