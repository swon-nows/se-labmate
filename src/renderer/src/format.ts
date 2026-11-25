const pad = (n: number): string => String(n).padStart(2, '0')
const dayNumber = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5

// 날짜는 현지 날짜 기준으로 센다.
export function relativeDate(iso: string, now: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const days = dayNumber(now) - dayNumber(d)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days >= 2 && days <= 7) return `${days}d ago`
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatStars(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`
}

// 키워드는 따옴표로 묶은 구절 그대로 찾으므로, 낱말이 다섯 이상이면 거의 아무것도 맞지 않는다.
export function longKeywords(input: string): string[] {
  return input
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.split(/\s+/).length >= 5)
}
