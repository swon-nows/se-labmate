import type { RawItem } from '../../../shared/types'
import { normalizeTitle } from '../text'
import { finish, quoteAll, textOf, xml } from './common'

export function buildGnewsUrl(keywords: string[], edition: 'ko' | 'en'): string {
  const u = new URL('https://news.google.com/rss/search')
  u.searchParams.set('q', `${quoteAll(keywords, ' OR ')} when:7d`)
  const [hl, gl, ceid] = edition === 'ko' ? ['ko', 'KR', 'KR:ko'] : ['en-US', 'US', 'US:en']
  u.searchParams.set('hl', hl)
  u.searchParams.set('gl', gl)
  u.searchParams.set('ceid', ceid)
  return u.toString()
}

export function parseGnews(body: string, limit = 30): RawItem[] {
  const channel = xml.parse(body)?.rss?.channel
  if (!channel || typeof channel !== 'object')
    throw new Error('Google 뉴스 응답에 rss.channel이 없습니다')
  const out: RawItem[] = []
  for (const e of (channel.item ?? []) as Record<string, unknown>[]) {
    const source = textOf(e.source).trim()
    const url = textOf(e.link).trim()
    let title = textOf(e.title).trim()
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3))
    const name = source || 'Google News'
    // guid는 같은 기사도 몇 시간 뒤 바뀌므로 id는 제목과 언론사로 정한다.
    const key = normalizeTitle(title)
    if (key === '') continue
    const it = finish({
      id: `news:${key}:${normalizeTitle(name)}`,
      category: 'news',
      source: name,
      title,
      url,
      date: textOf(e.pubDate).trim(),
      summary: ''
    })
    if (it) out.push(it)
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}
