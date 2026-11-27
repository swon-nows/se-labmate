import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { boardId, readBoard, readPosts } from '../../src/main/core/boards/index'
import type { FetchText } from '../../src/main/core/fetch-text'
import { normalizeTitle } from '../../src/main/core/text'
import { BUILTIN_BOARDS } from '../../src/shared/sources'

const fx = (n: string): string => readFileSync(`tests/fixtures/boards/${n}`, 'utf8')
const NOW = new Date('2026-11-25T03:00:00.000Z')

// 늘 같은 본문을 돌려주고, 부른 주소와 본문을 기록하는 가짜 fetchText.
function fake(body: string): FetchText & { calls: [string, string | undefined][] } {
  const calls: [string, string | undefined][] = []
  const f = async (url: string, _h?: Record<string, string>, b?: string): Promise<string> => {
    calls.push([url, b])
    return body
  }
  return Object.assign(f, { calls })
}

test('IRIS 주소는 IRIS 목록을 POST로 읽는다', async () => {
  for (const url of [BUILTIN_BOARDS[0].url, 'https://iris.go.kr/']) {
    const f = fake(fx('iris.json'))
    const posts = await readPosts(url, f)
    expect(f.calls).toEqual([
      [
        'https://www.iris.go.kr/contents/retrieveBsnsAncmBtinSituList.do',
        'pageIndex=1&ancmPrg=ancmIng'
      ],
      [
        'https://www.iris.go.kr/contents/retrieveBsnsAncmBtinSituList.do',
        'pageIndex=1&ancmPrg=ancmPre'
      ]
    ])
    expect(posts).toHaveLength(4)
  }
})

test('한국연구재단 공모 목록은 받은 주소를 GET으로 읽어 parseNrf로 푼다', async () => {
  const f = fake(fx('nrf.html'))
  const posts = await readPosts(BUILTIN_BOARDS[1].url, f)
  expect(f.calls).toEqual([[BUILTIN_BOARDS[1].url, undefined]])
  expect(posts.length).toBeGreaterThan(0)
  expect(posts.every((p) => p.url.startsWith('https://www.nrf.re.kr/biz/notice/view?'))).toBe(true)
})

test('서울대 건축학과 주소는 그 게시판의 분류로 POST한다', async () => {
  const f = fake(fx('snu-daae.json'))
  const posts = await readPosts('https://architecture.snu.ac.kr/posts/news', f)
  expect(f.calls).toEqual([
    [
      'https://architecture.snu.ac.kr/rest/activities/getPosts',
      '{"page":1,"category":"news","search":""}'
    ]
  ])
  expect(posts.length).toBeGreaterThan(0)
})

test('그 밖의 주소는 GET으로 읽어 일반 읽기로 푼다', async () => {
  const html = fake(fx('cse-snu.html'))
  expect(await readPosts('https://cse.snu.ac.kr/ko/community/notice', html)).toHaveLength(20)
  expect(html.calls).toEqual([['https://cse.snu.ac.kr/ko/community/notice', undefined]])

  const feed = fake(fx('gsds-feed.xml'))
  expect(await readPosts('https://gsds.snu.ac.kr/feed/', feed)).toHaveLength(10)

  // 한국연구재단이라도 공모 목록이 아니면 일반 읽기다.
  const other = fake(fx('gsds-feed.xml'))
  expect(await readPosts('https://www.nrf.re.kr/cms/board/list', other)).toHaveLength(10)
})

test('피드도 아니고 HTML 목록도 없으면 글 목록을 찾지 못했다고 던진다', async () => {
  const f = fake('<html><body><a href="/a">메뉴</a></body></html>')
  await expect(readPosts('https://a.b/', f)).rejects.toThrow('글 목록을 찾지 못했습니다')
})

test('항목이 없는 피드는 오류가 아니라 빈 목록이다', async () => {
  const rss = '<rss version="2.0"><channel><title>x</title></channel></rss>'
  await expect(readPosts('https://a.b/feed', fake(rss))).resolves.toEqual([])
  const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><title>x</title></feed>'
  await expect(readPosts('https://a.b/atom', fake(atom))).resolves.toEqual([])
})

test('boardId는 같은 주소에 같은 값, 길이 10의 16진수', () => {
  const id = boardId('https://a.b/notice')
  expect(id).toBe(boardId('https://a.b/notice'))
  expect(id).toMatch(/^[0-9a-f]{10}$/)
  expect(boardId('https://a.b/news')).not.toBe(id)
})

test('readBoard: 과제 공고는 제목으로 id를 만들고 출처·분류·요약을 게시판에서 가져온다', async () => {
  const { fresh, known } = await readBoard(BUILTIN_BOARDS[0], fake(fx('iris.json')), undefined, NOW)
  expect(fresh[0]).toEqual({
    id: 'grant:' + normalizeTitle('2026년도 제5차 과학기술분야 연구기획과제 공모'),
    category: 'grant',
    source: 'IRIS',
    title: '2026년도 제5차 과학기술분야 연구기획과제 공모',
    url: 'https://www.iris.go.kr/contents/retrieveBsnsAncmView.do?ancmId=024799&ancmPrg=ancmIng',
    date: '2026-11-13T00:00:00.000Z',
    summary: '한국연구재단 · 접수 2026-11-13 ~ 2026-11-26'
  })
  expect(known).toContain(fresh[0].id)
  expect(known).toContain(fresh[0].url)
})

test('readBoard: 게시판 글의 id와 날짜 없는 글, 제목이 비는 과제 공고', async () => {
  const rss = `<rss><channel>
    <item><title>2027 연구과제 공고</title><link>https://a.b/1</link><guid>g1</guid><pubDate>Mon, 23 Nov 2026 00:00:00 GMT</pubDate></item>
    <item><title>- - -</title><link>https://a.b/2</link><guid>g2</guid></item>
  </channel></rss>`
  const board = { id: 'b1', name: '공고판', url: 'https://a.b/feed', category: 'school' as const }
  const school = await readBoard(board, fake(rss), ['x'], NOW)
  expect(school.fresh.map((i) => [i.id, i.source, i.category, i.date])).toEqual([
    ['board:b1:g1', '공고판', 'school', '2026-11-23T00:00:00.000Z'],
    ['board:b1:g2', '공고판', 'school', NOW.toISOString()]
  ])
  const grant = await readBoard({ ...board, category: 'grant' }, fake(rss), ['x'], NOW)
  expect(grant.fresh.map((i) => i.id)).toEqual(['grant:' + normalizeTitle('2027 연구과제 공고')])
})

test('readBoard: 처음 읽을 때는 최근 날짜의 글만 새 글이고, 모든 글의 id와 주소를 기록한다', async () => {
  const rss = `<rss><channel>
    <item><title>최근 글</title><link>https://a.b/1</link><guid>g1</guid><pubDate>Mon, 23 Nov 2026 00:00:00 GMT</pubDate></item>
    <item><title>날짜 없는 글</title><link>https://a.b/2</link><guid>g2</guid></item>
  </channel></rss>`
  const board = { id: 'b1', name: '공고판', url: 'https://a.b/feed', category: 'school' as const }
  const { fresh, known } = await readBoard(board, fake(rss), undefined, NOW)
  expect(fresh.map((i) => i.id)).toEqual(['board:b1:g1'])
  expect(known).toEqual(
    expect.arrayContaining(['board:b1:g1', 'https://a.b/1', 'board:b1:g2', 'https://a.b/2'])
  )
})

test('readBoard: upcoming이면 처음 읽을 때 먼 미래 날짜의 글도 새 글이다', async () => {
  const rss = `<rss><channel>
    <item><title>2027 총회</title><link>https://a.b/1</link><guid>g1</guid><pubDate>Tue, 01 Jun 2027 00:00:00 GMT</pubDate></item>
  </channel></rss>`
  const board = { id: 'b1', name: '일정', url: 'https://a.b/feed', category: 'conference' as const }
  const without = await readBoard(board, fake(rss), undefined, NOW)
  const upcoming = await readBoard(board, fake(rss), undefined, NOW, true)
  expect(without.fresh).toEqual([])
  expect(upcoming.fresh.map((i) => i.id)).toEqual(['board:b1:g1'])
  expect(upcoming.fresh[0].date).toBe('2027-06-01T00:00:00.000Z')
})
