import { CATEGORIES, CATEGORY_LABEL } from '../../shared/types'
import type { AppState, Category } from '../../shared/types'
import { isVisible } from './feed'

// 현지 시각 기준: 오늘 HH:MM이 아직 안 왔으면 어제 HH:MM (24시간이 아니라 달력 하루 전)
export function lastDue(now: Date, notifyTime: string): Date {
  const [hh, mm] = notifyTime.split(':').map(Number)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm)
  // 어제 시각도 생성자로 직접 만든다: setDate는 이미 보정된 날짜를 옮겨서 서머타임 전환일에 한 시간 어긋난다.
  return today.getTime() > now.getTime()
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, hh, mm)
    : today
}

export function shouldRunDaily(
  now: Date,
  notifyTime: string,
  lastDailyRunAt: string | null
): boolean {
  if (lastDailyRunAt === null) return false // 프로필이 아직 없음
  return new Date(lastDailyRunAt).getTime() < lastDue(now, notifyTime).getTime()
}

export function shouldNotify(state: AppState): boolean {
  const since = state.lastNotifiedAt === null ? -Infinity : Date.parse(state.lastNotifiedAt)
  return Object.values(state.items).some(
    (i) => i.seenAt === null && isVisible(i, state.settings) && Date.parse(i.collectedAt) > since
  )
}

export function notificationBody(counts: Partial<Record<Category, number>>): string {
  const parts = CATEGORIES.filter((c) => (counts[c] ?? 0) > 0).map(
    (c) => `${CATEGORY_LABEL[c]} ${counts[c]}`
  )
  const total = CATEGORIES.reduce((sum, c) => sum + (counts[c] ?? 0), 0)
  return parts.length === 0 ? '새 소식 0건' : `새 소식 ${total}건 (${parts.join(' · ')})`
}
