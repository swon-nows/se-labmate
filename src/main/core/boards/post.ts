import { isHttpUrl } from '../text'

export interface Post {
  key: string
  title: string
  url: string
  date: string | null // ISO 또는 null(날짜 모름)
  summary: string
}

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()

// 숫자 엔티티는 유효한 코드 포인트만 풀고, 나머지는 그대로 둔다.
const fromCode = (whole: string, code: number): string =>
  Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole

export function htmlText(fragment: string): string {
  return squash(
    fragment
      .replace(/<[^>]*>/g, ' ')
      .replace(/&#x([0-9a-f]+);/gi, (m, h: string) => fromCode(m, parseInt(h, 16)))
      .replace(/&#(\d+);/g, (m, d: string) => fromCode(m, parseInt(d, 10)))
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&') // 마지막에 풀어야 &amp;lt;가 <가 되지 않는다
  )
}

export function dateOf(y: string, m: string, d: string): string | null {
  const [mo, da] = [Number(m), Number(d)]
  if (!(mo >= 1 && mo <= 12 && da >= 1 && da <= 31)) return null
  const t = new Date(Date.UTC(Number(y), mo - 1, da))
  return Number.isNaN(t.getTime()) ? null : t.toISOString()
}

export function finishPosts(posts: Post[]): Post[] {
  const seen = new Set<string>()
  const out: Post[] = []
  for (const p of posts) {
    const title = squash(p.title)
    if (title === '' || p.key === '' || !isHttpUrl(p.url) || seen.has(p.key)) continue
    seen.add(p.key)
    const t = p.date === null ? NaN : new Date(p.date).getTime()
    out.push({ ...p, title, date: Number.isNaN(t) ? null : new Date(t).toISOString() })
  }
  return out
}
