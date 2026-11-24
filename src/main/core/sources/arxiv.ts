import type { RawItem } from '../../../shared/types'
import { normalizeTitle } from '../text'
import { finish, squash, textOf, xml } from './common'

export function buildArxivUrl(keywords: string[]): string {
  const u = new URL('https://export.arxiv.org/api/query')
  u.searchParams.set('search_query', keywords.map((k) => `all:"${k}"`).join(' OR '))
  u.searchParams.set('sortBy', 'submittedDate')
  u.searchParams.set('sortOrder', 'descending')
  u.searchParams.set('max_results', '30')
  return u.toString()
}

export function parseArxiv(body: string): RawItem[] {
  const feed = xml.parse(body)?.feed
  if (!feed || typeof feed !== 'object') throw new Error('arXiv 응답에 feed가 없습니다')
  const out: RawItem[] = []
  for (const e of (feed.entry ?? []) as Record<string, unknown>[]) {
    const title = squash(textOf(e.title))
    const it = finish({
      id: 'paper:' + normalizeTitle(title),
      category: 'paper',
      source: 'arXiv',
      title,
      url: textOf(e.id).trim(),
      date: textOf(e.published).trim(),
      summary: [...squash(textOf(e.summary))].slice(0, 200).join('')
    })
    if (it) out.push(it)
  }
  return out
}
