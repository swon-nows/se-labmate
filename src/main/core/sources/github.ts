import type { RawItem } from '../../../shared/types'
import { finish, quoteAll, ymd } from './common'

interface Repo {
  full_name?: string
  html_url?: string
  created_at?: string
  description?: string | null
  stargazers_count?: number
}

// 검색 질의의 논리 연산자 5개 제한과 256자 제한 때문에, 키워드를 6개 이하·256자 이하가 되게 앞에서부터 묶어
// 요청 여러 개로 만든다.
export function buildGithubUrls(keywords: string[], today: Date): string[] {
  const suffix = ` in:name,description,topics created:>=${ymd(today, 90)}`
  const q = (chunk: string[]): string => quoteAll(chunk, ' OR ') + suffix
  const chunks: string[][] = []
  for (const k of keywords) {
    const last = chunks[chunks.length - 1]
    if (last && last.length < 6 && q([...last, k]).length <= 256) last.push(k)
    else chunks.push([k])
  }
  return chunks.map((chunk) => {
    const u = new URL('https://api.github.com/search/repositories')
    u.searchParams.set('q', q(chunk))
    u.searchParams.set('sort', 'stars')
    u.searchParams.set('order', 'desc')
    u.searchParams.set('per_page', '20')
    return u.toString()
  })
}

export function parseGithub(body: string): RawItem[] {
  const items = JSON.parse(body)?.items as Repo[] | undefined
  if (!Array.isArray(items)) throw new Error('GitHub 응답에 items가 없습니다')
  const out: RawItem[] = []
  for (const r of items) {
    const name = r.full_name ?? ''
    const it = finish({
      id: 'repo:' + name.toLowerCase(),
      category: 'repo',
      source: 'GitHub',
      title: name,
      url: r.html_url ?? '',
      date: r.created_at ?? '',
      summary: r.description ?? '',
      stars: r.stargazers_count
    })
    if (it) out.push(it)
  }
  return out
}
