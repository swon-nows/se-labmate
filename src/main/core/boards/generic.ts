import { xml, textOf } from '../sources/common'
import { normalizeTitle } from '../text'
import { anchors, dateOf, finishPosts, htmlText, stripBlocks, type Post } from './post'

const HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const DATE = /(?<!\d)(20\d{2})\s?[.\-/]\s?(\d{1,2})\s?[.\-/]\s?(\d{1,2})(?!\d)/g

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

export function parseBoardPage(body: string, baseUrl: string): Post[] {
  return parseFeed(body) ?? parseHtmlList(body, baseUrl)
}

export function parseFeed(body: string): Post[] | null {
  if (!/^(<\?xml|<rss|<feed)/.test(body.trimStart())) return null
  let doc: Record<string, unknown>
  try {
    doc = record(xml.parse(body))
  } catch {
    return null
  }
  const channel = record(doc.rss).channel
  const feed = doc.feed
  if (channel && typeof channel === 'object') {
    const items = (record(channel).item ?? []) as Record<string, unknown>[]
    return finishPosts(
      items.map((e) => {
        const url = textOf(e.link).trim()
        return {
          key: textOf(e.guid).trim() || url,
          title: textOf(e.title),
          url,
          date: textOf(e.pubDate).trim() || null,
          summary: ''
        }
      })
    )
  }
  if (feed && typeof feed === 'object') {
    const entries = (record(feed).entry ?? []) as Record<string, unknown>[]
    return finishPosts(
      entries.map((e) => {
        const links = [e.link].flat().map(record)
        const link = links.find((l) => l['@_rel'] === undefined || l['@_rel'] === 'alternate')
        const url = String(link?.['@_href'] ?? '').trim()
        return {
          key: textOf(e.id).trim() || url,
          title: textOf(e.title),
          url,
          date: textOf(e.updated).trim() || textOf(e.published).trim() || null,
          summary: ''
        }
      })
    )
  }
  return null
}

interface Link {
  start: number
  end: number
  url: string
  title: string
}

// 같은 목록의 글 주소는 숫자만 다르다: 호스트 + 경로(숫자 묶음은 #) + 쿼리 키 이름.
function shape(u: URL): string {
  let path = u.pathname
  try {
    path = decodeURIComponent(path) // 한글 경로의 %XX 속 숫자까지 #으로 바뀌지 않게 한다.
  } catch {
    // 깨진 인코딩은 그대로 쓴다.
  }
  return `${u.host}${path.replace(/\d+/g, '#')}?${[...u.searchParams.keys()].sort().join('&')}`
}

const datesIn = (html: string): RegExpMatchArray[] => [...htmlText(html).matchAll(DATE)]

export function parseHtmlList(html: string, baseUrl: string): Post[] {
  let host: string
  try {
    host = new URL(baseUrl).host
  } catch {
    return []
  }
  const page = stripBlocks(html)

  const groups = new Map<string, Link[]>()
  for (const a of anchors(page)) {
    const h = HREF.exec(a.attrs)
    const href = htmlText(h ? (h[1] ?? h[2] ?? h[3]) : '')
    if (href === '' || /^(#|javascript:|mailto:|tel:)/.test(href)) continue
    let u: URL
    try {
      u = new URL(href, baseUrl)
    } catch {
      continue
    }
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.host !== host) continue
    u.hash = ''
    const title = htmlText(a.inner)
    if (title.length < 4) continue
    const key = shape(u)
    const link = { start: a.start, end: a.end, url: u.href, title }
    const group = groups.get(key)
    if (group) group.push(link)
    else groups.set(key, [link])
  }

  let best: { score: number; posts: Post[] } | null = null
  for (const items of groups.values()) {
    const seen = new Set<string>()
    const uniq = items.filter((l) => !seen.has(l.url) && seen.add(l.url))
    if (uniq.length < 5) continue
    const avg = uniq.reduce((n, l) => n + l.title.length, 0) / uniq.length
    if (avg < 10) continue
    // 링크 뒤(다음 링크 전까지)에서 첫 날짜, 없으면 링크 앞(앞 링크 뒤부터)에서 마지막 날짜. 칸마다 한 번씩만 훑는다.
    const dates = uniq.map((l, i) => {
      const after = datesIn(page.slice(l.end, uniq[i + 1]?.start ?? l.end + 600))[0]
      const before = after
        ? undefined
        : datesIn(page.slice(i > 0 ? uniq[i - 1].end : Math.max(0, l.start - 600), l.start)).at(-1)
      const m = after ?? before
      return m ? dateOf(m[1], m[2], m[3]) : null
    })
    const dated = dates.filter((d) => d !== null).length
    const score = uniq.length * Math.min(avg, 40) * (dated * 2 >= uniq.length ? 3 : 1)
    if (best && score <= best.score) continue
    best = {
      score,
      posts: uniq.map((l, i) => ({
        key: normalizeTitle(l.title) + (dates[i] ? `:${dates[i].slice(0, 10)}` : ''),
        title: l.title,
        url: l.url,
        date: dates[i],
        summary: ''
      }))
    }
  }
  return best ? finishPosts(best.posts) : []
}
