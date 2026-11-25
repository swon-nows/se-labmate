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

// 주석·script·style을 공백으로 바꾼다. 닫히지 않은 것은 브라우저처럼 끝까지 지워 한 번씩만 훑는다.
export function stripBlocks(html: string): string {
  return html.replace(/<!--[\s\S]*?(?:-->|$)|<(script|style)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ')
}

export interface Anchor {
  attrs: string
  inner: string
  start: number
  end: number
}

// <a …>…</a>를 문서 순서대로 돌려준다. 요소를 통째로 건너뛰며 읽으므로 각 글자는 한 번만 훑고,
// 닫는 태그가 더 없으면 뒤의 <a>도 닫을 곳이 없으므로 거기서 멈춘다.
export function anchors(html: string): Anchor[] {
  const open = /<a\b[^<>]*>/gi
  const close = /<\/a\s*>/gi
  const out: Anchor[] = []
  for (let m = open.exec(html); m; m = open.exec(html)) {
    const innerStart = m.index + m[0].length
    close.lastIndex = innerStart
    const c = close.exec(html)
    if (!c) break
    const end = c.index + c[0].length
    out.push({
      attrs: m[0].slice(2, -1),
      inner: html.slice(innerStart, c.index),
      start: m.index,
      end
    })
    open.lastIndex = end
  }
  return out
}

// JSON이 아니면 null: 호출하는 쪽이 고정 문구로 오류를 내 응답 조각이 오류 문구에 섞이지 않게 한다.
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
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
