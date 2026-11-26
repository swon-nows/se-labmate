import type { RawItem } from '../../../shared/types'
import { htmlText } from '../boards/post'
import { finish } from './common'

export const GITHUB_TRENDING_URL = 'https://github.com/trending?since=weekly'

const PATH = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const num = (s: string): number => Number(s.replace(/,/g, ''))

// <p>나 <p …>의 시작만 찾는다(<path> 같은 다른 태그는 건너뛴다).
function paragraphStart(entry: string, from: number): number {
  let p = entry.indexOf('<p', from)
  while (p !== -1 && !/[\s>]/.test(entry.charAt(p + 2))) p = entry.indexOf('<p', p + 2)
  return p
}

// 태그 하나의 여는 부분 뒤부터 end 앞까지의 글자. 여는 부분이나 end가 없으면 null.
function textUntil(entry: string, tagStart: number, end: string): string | null {
  const open = entry.indexOf('>', tagStart)
  const close = open === -1 ? -1 : entry.indexOf(end, open)
  return close === -1 ? null : htmlText(entry.slice(open + 1, close))
}

// 한 항목(<article> … </article>)에서 저장소 하나를 읽는다. 읽을 수 없으면 null.
function readEntry(entry: string, now: Date): RawItem | null {
  const h = entry.indexOf('<h2')
  const from = h === -1 ? -1 : entry.indexOf('href="/', h)
  const quote = from === -1 ? -1 : entry.indexOf('"', from + 7)
  if (quote === -1) return null
  const path = entry.slice(from + 7, quote)
  if (!PATH.test(path)) return null

  const i = entry.indexOf(' this week')
  if (i === -1) return null
  const week = /([\d,]+)\s+stars?$/.exec(entry.slice(Math.max(0, i - 40), i))
  if (!week) return null

  const sg = entry.indexOf(`href="/${path}/stargazers"`)
  const total = sg === -1 ? null : textUntil(entry, sg, '</a>')
  const stars = total === null ? undefined : /[\d,]+/.exec(total)?.[0]

  const p = paragraphStart(entry, h)
  const summary = p === -1 ? '' : (textUntil(entry, p, '</p>') ?? '')

  return finish({
    id: 'repo:' + path.toLowerCase(),
    category: 'repo',
    source: 'GitHub',
    title: path,
    url: 'https://github.com/' + path,
    date: now.toISOString(),
    summary,
    stars: stars === undefined ? undefined : num(stars),
    weekStars: num(week[1])
  })
}

// GitHub에는 이 목록을 주는 API가 없어 공개 페이지(github.com/trending)를 읽는다.
// 문서 전체에 정규식을 돌리지 않고 <article> 하나씩 indexOf로 잘라 읽는다.
export function parseTrending(html: string, now: Date, limit: number): RawItem[] {
  const items = new Map<string, RawItem>()
  for (let a = html.indexOf('<article'); a !== -1;) {
    const close = html.indexOf('</article>', a)
    const end = close === -1 ? html.length : close
    const item = readEntry(html.slice(a, end), now)
    if (item && !items.has(item.id)) items.set(item.id, item)
    a = html.indexOf('<article', end)
  }
  if (items.size === 0) throw new Error('GitHub Trending 목록을 찾지 못했습니다')
  // Array.prototype.sort는 안정 정렬이라 같은 값은 페이지 순서를 지킨다.
  return [...items.values()].sort((x, y) => (y.weekStars ?? 0) - (x.weekStars ?? 0)).slice(0, limit)
}
