import { createHash } from 'node:crypto'
import type { Board, RawItem } from '../../../shared/types'
import type { FetchText } from '../fetch-text'
import { normalizeTitle } from '../text'
import { diffPosts } from './diff'
import { parseFeed, parseHtmlList } from './generic'
import { readIris } from './iris'
import { parseNrf } from './nrf'
import type { Post } from './post'
import { readSnuDaae, snuDaaeCategory } from './snu-daae'

export function boardId(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 10)
}

export async function readPosts(url: string, fetchText: FetchText): Promise<Post[]> {
  const { hostname, pathname } = new URL(url)
  if (hostname === 'www.iris.go.kr' || hostname === 'iris.go.kr') return readIris(fetchText)
  if ((hostname === 'www.nrf.re.kr' || hostname === 'nrf.re.kr') && pathname === '/biz/notice/list')
    return parseNrf(await fetchText(url))
  const category = snuDaaeCategory(url)
  if (category !== null) return readSnuDaae(category, fetchText)
  const body = await fetchText(url)
  // 항목이 없는 피드는 아직 글이 없는 것일 뿐이다. 피드도 아니고 HTML 목록도 없을 때만 실패다.
  const feed = parseFeed(body)
  if (feed !== null) return feed
  const posts = parseHtmlList(body, url)
  if (posts.length === 0) throw new Error('글 목록을 찾지 못했습니다')
  return posts
}

// 과제 공고는 IRIS와 한국연구재단에 같은 공고가 함께 올라오므로 제목으로 묶는다.
export async function readBoard(
  board: Board,
  fetchText: FetchText,
  known: string[] | undefined,
  now: Date
): Promise<{ fresh: RawItem[]; known: string[] }> {
  const grant = board.category === 'grant'
  const posts = (await readPosts(board.url, fetchText))
    .map((p) => ({
      ...p,
      id: grant ? `grant:${normalizeTitle(p.title)}` : `board:${board.id}:${p.key}`
    }))
    .filter((p) => p.id !== 'grant:')
  const diff = diffPosts(posts, known, now)
  return {
    fresh: diff.fresh.map((p) => ({
      id: p.id,
      category: board.category,
      source: board.name,
      title: p.title,
      url: p.url,
      date: p.date ?? now.toISOString(),
      summary: p.summary
    })),
    known: diff.known
  }
}
