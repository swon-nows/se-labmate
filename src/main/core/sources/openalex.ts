import type { RawItem } from '../../../shared/types'
import { normalizeTitle } from '../text'
import { finish, quoteAll, ymd } from './common'

interface Work {
  id?: string
  doi?: string | null
  title?: string | null
  publication_date?: string
  primary_location?: {
    landing_page_url?: string | null
    source?: { display_name?: string | null } | null
  } | null
}

export function buildOpenAlexUrl(keywords: string[], today: Date, apiKey: string): string {
  const u = new URL('https://api.openalex.org/works')
  u.searchParams.set(
    'filter',
    `title_and_abstract.search:${quoteAll(keywords, '|')},from_publication_date:${ymd(today, 30)},to_publication_date:${ymd(today)}`
  )
  u.searchParams.set('sort', 'publication_date:desc')
  u.searchParams.set('per-page', '25')
  u.searchParams.set('select', 'id,doi,title,publication_date,primary_location,type,cited_by_count')
  u.searchParams.set('api_key', apiKey)
  return u.toString()
}

export function parseOpenAlex(body: string): RawItem[] {
  const results = JSON.parse(body)?.results as Work[] | undefined
  if (!Array.isArray(results)) throw new Error('OpenAlex 응답에 results가 없습니다')
  const out: RawItem[] = []
  for (const w of results) {
    const title = w.title ?? ''
    const it = finish({
      id: 'paper:' + normalizeTitle(title),
      category: 'paper',
      source: 'OpenAlex',
      title,
      url: w.doi ?? w.primary_location?.landing_page_url ?? w.id ?? '',
      date: w.publication_date ?? '',
      summary: w.primary_location?.source?.display_name ?? ''
    })
    if (it) out.push(it)
  }
  return out
}
