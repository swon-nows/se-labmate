import type { RawItem } from '../../../shared/types'
import { parseFeed } from '../boards/generic'
import { finish } from './common'

export function parseGeekNews(body: string, now: Date): RawItem[] {
  const posts = parseFeed(body)
  if (posts === null) throw new Error('GeekNews 피드를 읽지 못했습니다')
  const out: RawItem[] = []
  for (const post of posts) {
    // 제목은 고쳐질 수 있어 글 번호로 가른다.
    const n = /[?&]id=(\d+)/.exec(post.key)?.[1] ?? post.key
    const it = finish({
      id: `geeknews:${n}`,
      category: 'news',
      source: 'GeekNews',
      title: post.title,
      url: post.url,
      date: post.date ?? now.toISOString(),
      summary: ''
    })
    if (it) out.push(it)
  }
  return out
}
