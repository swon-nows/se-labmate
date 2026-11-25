import type { FetchText } from '../fetch-text'
import { dateOf, finishPosts, type Post } from './post'

const HOST = 'architecture.snu.ac.kr'

export function snuDaaeCategory(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname !== HOST) return null
    return /^\/posts\/(notice|news|events|forms)(?:\/|$)/.exec(u.pathname)?.[1] ?? 'notice'
  } catch {
    return null
  }
}

export async function readSnuDaae(category: string, fetchText: FetchText): Promise<Post[]> {
  const json = await fetchText(
    `https://${HOST}/rest/activities/getPosts`,
    { 'Content-Type': 'application/json' },
    JSON.stringify({ page: 1, category, search: '' })
  )
  return parseSnuDaae(json)
}

export function parseSnuDaae(json: string): Post[] {
  let data: unknown = null
  try {
    data = JSON.parse(json)
  } catch {
    // 오류 문구에 응답 조각이 섞이지 않게 아래의 고정 문구로 처리한다
  }
  const { err, list } = (data ?? {}) as { err?: unknown; list?: unknown }
  if (err !== 0 || !Array.isArray(list)) throw new Error('서울대 건축학과 응답에 목록이 없습니다')
  return finishPosts(
    list.map((row: unknown) => {
      const r = (row ?? {}) as Record<string, unknown>
      const idx = typeof r.idx === 'number' || typeof r.idx === 'string' ? String(r.idx) : ''
      const d = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(
        typeof r.post_date === 'string' ? r.post_date : ''
      )
      return {
        key: idx,
        title: typeof r.title === 'string' ? r.title : '',
        url: `https://${HOST}/post/${encodeURIComponent(idx)}`,
        date: d ? dateOf(d[1], d[2], d[3]) : null,
        summary: ''
      }
    })
  )
}
