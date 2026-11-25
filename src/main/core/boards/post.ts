import { isHttpUrl } from '../text'

export interface Post {
  key: string
  title: string
  url: string
  date: string | null // ISO 또는 null(날짜 모름)
  summary: string
}

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()

const NAMED: Record<string, string> = {
  nbsp: ' ',
  lt: '<',
  gt: '>',
  quot: '"',
  amp: '&',
  apos: "'"
}

// 한 번에 풀어서 &amp;lt;가 <가 되지 않게 한다. 범위 밖 숫자 엔티티는 그대로 둔다.
const decodeEntity = (whole: string, ref: string): string => {
  if (ref[0] !== '#') return NAMED[ref.toLowerCase()]
  const code =
    ref[1].toLowerCase() === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
  return code <= 0x10ffff ? String.fromCodePoint(code) : whole
}

export function htmlText(fragment: string): string {
  return squash(
    fragment
      .replace(/<[^<>]*>/g, ' ')
      .replace(/&(#x[0-9a-f]+|#\d+|nbsp|lt|gt|quot|amp|apos);/gi, decodeEntity)
  )
}

export function dateOf(y: string, m: string, d: string): string | null {
  const [mo, da] = [Number(m), Number(d)]
  if (!/^\d{4}$/.test(y) || !(mo >= 1 && mo <= 12 && da >= 1 && da <= 31)) return null
  const t = new Date(Date.UTC(Number(y), mo - 1, da))
  // 2월 31일 같은 날짜는 Date가 다음 달로 넘겨 버리므로 되짚어 본다.
  return t.getUTCMonth() === mo - 1 && t.getUTCDate() === da ? t.toISOString() : null
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
