import { XMLParser } from 'fast-xml-parser'
import type { RawItem } from '../../../shared/types'
import { isHttpUrl } from '../text'

// parseTagValue: false — 숫자처럼 보이는 제목이 숫자로 바뀌지 않게 한다.
// htmlEntities: true — 기본 설정이 풀지 않는 &#39; 같은 숫자 참조를 푼다(&amp;lt; 는 &lt; 로 한 번만 풀린다).
export const xml = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  htmlEntities: true,
  isArray: (n) => n === 'entry' || n === 'item'
})

export const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()

// fast-xml-parser가 속성 있는 요소를 { '#text': '…', '@_x': '…' } 로 주므로 글자만 꺼낸다.
export function textOf(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (v && typeof v === 'object') return textOf((v as Record<string, unknown>)['#text'])
  return ''
}

// 공통 규칙: 날짜가 유효하지 않거나 제목이 비었거나 주소가 http(s)가 아니거나
// id가 접두어뿐이면(제목에 글자·숫자가 없는 경우) null(버림).
export function finish(raw: Omit<RawItem, 'date'> & { date: string }): RawItem | null {
  const t = new Date(raw.date).getTime()
  if (Number.isNaN(t) || raw.title.trim() === '' || !isHttpUrl(raw.url) || raw.id.endsWith(':'))
    return null
  return { ...raw, date: new Date(t).toISOString() }
}

// UTC 기준 YYYY-MM-DD, daysAgo일 전
export const ymd = (d: Date, daysAgo = 0): string =>
  new Date(d.getTime() - daysAgo * 864e5).toISOString().slice(0, 10)

export const quoteAll = (keywords: string[], sep: string): string =>
  keywords.map((k) => `"${k}"`).join(sep)
