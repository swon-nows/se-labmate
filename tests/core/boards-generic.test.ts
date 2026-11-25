import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { parseBoardPage, parseFeed, parseHtmlList } from '../../src/main/core/boards/generic'
import { normalizeTitle } from '../../src/main/core/text'

const fx = (n: string): string => readFileSync(`tests/fixtures/boards/${n}`, 'utf8')

test('서울대 컴퓨터공학부 공지', () => {
  const posts = parseBoardPage(fx('cse-snu.html'), 'https://cse.snu.ac.kr/ko/community/notice')
  expect(posts).toHaveLength(20)
  expect(posts[0]).toEqual({
    key: normalizeTitle('2027학년도 1학기 국가장학금 신청 안내') + ':2026-11-24',
    title: '2027학년도 1학기 국가장학금 신청 안내',
    url: 'https://cse.snu.ac.kr/ko/community/notice/25899',
    date: '2026-11-24T00:00:00.000Z',
    summary: ''
  })
})

test('한국콘크리트학회', () => {
  const posts = parseBoardPage(fx('kci.html'), 'https://www.kci.or.kr/')
  expect(posts).toHaveLength(23)
  expect(posts[0].url).toBe('https://www.kci.or.kr/board/?_0000_method=view&ncode=a001&num=6843')
  expect(posts[0].date).toBe('2026-11-17T00:00:00.000Z')
})

test('서울대 본부 공지', () => {
  const posts = parseBoardPage(fx('snu-main.html'), 'https://www.snu.ac.kr/snunow/notice/genernal')
  expect(posts).toHaveLength(7)
  expect(posts[0].url).toBe('https://www.snu.ac.kr/snunow/notice/genernal?md=v&bbsidx=179675')
  expect(posts[2].date).toBe('2026-11-02T00:00:00.000Z')
})

test('RSS', () => {
  const posts = parseBoardPage(fx('gsds-feed.xml'), 'https://gsds.snu.ac.kr/feed/')
  expect(posts).toHaveLength(10)
  expect(posts[0]).toMatchObject({
    key: 'https://gsds.snu.ac.kr/?p=18938',
    title: 'UIUC 박용주 교수, Fast Code Sandboxes for AI Agents, 11월 18일(수)',
    date: '2026-11-16T10:55:25.000Z'
  })
})

test('Atom: link가 여럿이면 alternate, id가 없으면 주소가 key', () => {
  const body = `\n<feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>첫 글</title><link href="https://a.b/1"/><id>tag:1</id><updated>2026-11-20T00:00:00Z</updated></entry>
    <entry><title>둘째 글</title><link rel="self" href="https://a.b/feed/2"/><link rel="alternate" href="https://a.b/2"/><published>2026-11-19T00:00:00Z</published></entry>
  </feed>`
  expect(parseBoardPage(body, 'https://a.b/feed')).toEqual([
    {
      key: 'tag:1',
      title: '첫 글',
      url: 'https://a.b/1',
      date: '2026-11-20T00:00:00.000Z',
      summary: ''
    },
    {
      key: 'https://a.b/2',
      title: '둘째 글',
      url: 'https://a.b/2',
      date: '2026-11-19T00:00:00.000Z',
      summary: ''
    }
  ])
})

test('피드가 아니면 parseFeed는 null, 항목이 없는 피드는 빈 배열', () => {
  expect(parseFeed('<html><body></body></html>')).toBeNull()
  expect(
    parseFeed('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"></html>')
  ).toBeNull()
  expect(parseFeed('<rss version="2.0"><channel><title>x</title></channel></rss>')).toEqual([])
})

test('목록이 없으면 빈 배열', () => {
  expect(
    parseBoardPage(
      '<html><body><a href="/a">메뉴</a><a href="/b">소개</a></body></html>',
      'https://a.b/'
    )
  ).toEqual([])
  expect(parseBoardPage('', 'https://a.b/')).toEqual([])
})

test('위험한 링크와 다른 사이트 링크는 글로 치지 않는다', () => {
  const link = (n: number, title = `연구개발 지원사업 공고 ${n}번`): string =>
    `<a href="/view?id=${n}&amp;type=1">${title}</a>`
  const html = `<html><body>
    ${link(1, '<b>R&amp;D</b> 연구개발 지원사업 공고')}
    <a href="javascript:alert(1)">클릭하면 위험한 링크 제목입니다</a>
    ${link(2)}${link(3)}
    <a href="https://evil.example/view?id=9&amp;type=1">다른 사이트로 가는 링크 제목입니다</a>
    ${link(4)}${link(5)}${link(6)}
  </body></html>`
  const posts = parseHtmlList(html, 'https://a.b/list')
  expect(posts.map((p) => p.url)).toEqual(
    [1, 2, 3, 4, 5, 6].map((n) => `https://a.b/view?id=${n}&type=1`)
  )
  expect(posts[0].title).toBe('R&D 연구개발 지원사업 공고')
})

test('스크립트와 주석 안의 링크는 읽지 않고, 날짜는 링크 뒤 글에서 찾는다', () => {
  const rows = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<li><a href="/n/${n}">공지사항 제목 ${n}번째 글</a> <span>2026.11.${10 + n}</span></li>`
    )
    .join('')
  const html = `<script>var a = '<a href="/n/99">스크립트 안의 링크 제목입니다</a>'</script><!-- <a href="/n/98">주석 안의 링크 제목입니다</a> --><ul>${rows}</ul>`
  const posts = parseHtmlList(html, 'https://a.b/')
  expect(posts.map((p) => p.url)).toEqual([1, 2, 3, 4, 5].map((n) => `https://a.b/n/${n}`))
  expect(posts[0].date).toBe('2026-11-11T00:00:00.000Z')
  expect(posts[0].key).toBe(`${normalizeTitle('공지사항 제목 1번째 글')}:2026-11-11`)
})

test('링크 뒤에 날짜가 없으면 앞의 마지막 날짜를 쓰고, 날짜가 전혀 없으면 key에도 붙지 않는다', () => {
  const rows = [1, 2, 3, 4].map(
    (n) => `<li><a href="/b/${n}">게시판 글 제목 번호 ${n}</a> 2026-11-${10 + n}</li>`
  )
  rows.push('<li>2026-11-15 <a href="/b/5">게시판 글 제목 번호 5</a></li>')
  expect(parseHtmlList(`<ul>${rows.join('')}</ul>`, 'https://a.b/').map((p) => p.date)).toEqual(
    [11, 12, 13, 14, 15].map((d) => `2026-11-${d}T00:00:00.000Z`)
  )
  const none = [1, 2, 3, 4, 5].map((n) => `<a href="/c/${n}">날짜 없는 글 제목 ${n}번</a>`).join('')
  const posts = parseHtmlList(none, 'https://a.b/')
  expect(posts).toHaveLength(5)
  expect(posts[0].date).toBeNull()
  expect(posts[0].key).toBe(normalizeTitle('날짜 없는 글 제목 1번'))
})

test('큰 문서도 오래 걸리지 않는다', () => {
  const filler = '<p>가나다라마바사 2026.11.01 아자차카타파하</p>'.repeat(60_000) // 약 2.5MB
  const rows = Array.from(
    { length: 3000 },
    (_, i) => `<li><a href="/p/${i}">게시글 제목 번호 ${i}</a> 2026.11.01</li>`
  )
  const t = Date.now()
  const posts = parseHtmlList(
    `${filler}<ul>${rows.join(filler.slice(0, 200))}</ul>${filler}`,
    'https://a.b/'
  )
  expect(posts).toHaveLength(3000)
  expect(Date.now() - t).toBeLessThan(3000)
})
