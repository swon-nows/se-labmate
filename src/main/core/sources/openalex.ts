import type { RawItem } from '../../../shared/types'
import { normalizeTitle } from '../text'
import { finish, quoteAll, ymd } from './common'
import { abstractText, keySentence } from './summary'

interface Work {
  id?: unknown
  doi?: unknown
  title?: unknown
  publication_date?: unknown
  primary_location?: {
    landing_page_url?: unknown
    source?: { display_name?: unknown } | null
  } | null
  keywords?: unknown
  primary_topic?: { display_name?: unknown } | null
  abstract_inverted_index?: unknown
}
interface Kw {
  display_name?: unknown
  score?: unknown
}

// 외부 JSON이라 필드 타입을 믿지 않는다: 문자열이 아니면 빈 글. 레코드 하나가 소스 전체를 막으면 안 된다.
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const score = (k: Kw): number => (typeof k.score === 'number' ? k.score : 0)
const opt = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export function buildOpenAlexUrl(keywords: string[], today: Date, apiKey: string): string {
  const u = new URL('https://api.openalex.org/works')
  u.searchParams.set(
    'filter',
    `title_and_abstract.search:${quoteAll(keywords, '|')},from_publication_date:${ymd(today, 30)},to_publication_date:${ymd(today)}`
  )
  u.searchParams.set('sort', 'publication_date:desc')
  u.searchParams.set('per-page', '25')
  u.searchParams.set(
    'select',
    'id,doi,title,publication_date,primary_location,type,cited_by_count,keywords,primary_topic,abstract_inverted_index'
  )
  u.searchParams.set('api_key', apiKey)
  return u.toString()
}

export function parseOpenAlex(body: string): RawItem[] {
  const results: unknown = JSON.parse(body)?.results
  if (!Array.isArray(results)) throw new Error('OpenAlex 응답에 results가 없습니다')
  const out: RawItem[] = []
  for (const entry of results) {
    if (!entry || typeof entry !== 'object') continue
    const w = entry as Work
    const title = opt(w.title) ?? ''
    const venue = str(w.primary_location?.source?.display_name)
    const keywords = ((Array.isArray(w.keywords) ? w.keywords : []) as (Kw | null)[])
      .filter((k): k is Kw => !!k && typeof k === 'object' && str(k.display_name) !== '')
      .sort((a, b) => score(b) - score(a))
      .map((k) => str(k.display_name))
      .slice(0, 5)
    const topic = str(w.primary_topic?.display_name)
    if (keywords.length === 0 && topic) keywords.push(topic)
    const it = finish({
      id: 'paper:' + normalizeTitle(title),
      category: 'paper',
      source: 'OpenAlex',
      title,
      url: opt(w.doi) ?? opt(w.primary_location?.landing_page_url) ?? opt(w.id) ?? '',
      date: opt(w.publication_date) ?? '',
      summary: keySentence(abstractText(w.abstract_inverted_index)),
      ...(venue ? { venue } : {}),
      ...(keywords.length ? { keywords } : {})
    })
    if (it) out.push(it)
  }
  return out
}
