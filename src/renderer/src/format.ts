const pad = (n: number): string => String(n).padStart(2, '0')
const dayNumber = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5

// 날짜는 현지 날짜 기준으로 센다.
export function relativeDate(iso: string, now: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const days = dayNumber(now) - dayNumber(d)
  if (days <= 0) return '오늘'
  if (days === 1) return '어제'
  if (days <= 7) return `${days}일 전`
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatStars(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`
}
