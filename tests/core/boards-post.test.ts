import { expect, test } from 'vitest'
import { parseHtmlList } from '../../src/main/core/boards/generic'
import { parseNrf } from '../../src/main/core/boards/nrf'
import {
  anchors,
  dateOf,
  finishPosts,
  htmlText,
  parseJson,
  stripBlocks,
  type Post
} from '../../src/main/core/boards/post'

const p = (o: Partial<Post>): Post => ({
  key: 'k',
  title: 't',
  url: 'https://a.b/1',
  date: null,
  summary: '',
  ...o
})

test('htmlText는 태그를 공백으로 바꾸고 엔티티를 풀며 공백을 정리한다', () => {
  expect(htmlText('<b>R&amp;D</b>  예산 &lt;확대&gt;&nbsp;&#39;안내&#x27;')).toBe(
    "R&D 예산 <확대> '안내'"
  )
  expect(htmlText('a<br>b')).toBe('a b')
  expect(htmlText('&amp;lt;')).toBe('&lt;') // &amp;는 마지막에 풀어 두 번 풀리지 않게 한다
  expect(htmlText('&quot;x&quot; &#65;&#x42;')).toBe('"x" AB')
  expect(htmlText('&#38;lt;')).toBe('&lt;') // 숫자 엔티티로 푼 &도 다시 풀리지 않는다
  expect(htmlText('&#99999999999; &#x110000; &bogus;')).toBe('&#99999999999; &#x110000; &bogus;')
  expect(htmlText('1 < 2 <b>x</b>')).toBe('1 < 2 x')
})

test('dateOf는 UTC 자정 ISO, 범위 밖이면 null', () => {
  expect(dateOf('2026', '11', '2')).toBe('2026-11-02T00:00:00.000Z')
  expect(dateOf('2026', '13', '1')).toBeNull()
  expect(dateOf('2026', '0', '1')).toBeNull()
  expect(dateOf('2026', '1', '32')).toBeNull()
  expect(dateOf('2026', '2', '31')).toBeNull() // Date가 3월 3일로 넘기지 않게
  expect(dateOf('2026', '4', '31')).toBeNull()
  expect(dateOf('2024', '2', '29')).toBe('2024-02-29T00:00:00.000Z')
  expect(dateOf('2026', '2', '29')).toBeNull()
  expect(dateOf('26', '11', '25')).toBeNull() // 두 자리 해는 1926으로 읽히지 않게
  expect(dateOf('', '11', '25')).toBeNull()
})

test('finishPosts는 제목을 정리하고 잘못된 글과 중복 key를 버린다', () => {
  expect(
    finishPosts([
      p({ key: '1', title: '  공지   사항 ' }),
      p({ key: '1', title: '중복' }),
      p({ key: '2', url: 'javascript:alert(1)' }),
      p({ key: '', title: 'x' }),
      p({ key: '3', title: '   ' }),
      p({ key: '4', title: '<script>alert(1)</script>', date: '2026-11-25' }),
      p({ key: '5', date: 'nope' })
    ])
  ).toEqual([
    p({ key: '1', title: '공지 사항' }),
    p({ key: '4', title: '<script>alert(1)</script>', date: '2026-11-25T00:00:00.000Z' }),
    p({ key: '5', date: null })
  ])
})

test('finishPosts는 300 코드 포인트가 넘는 제목을 300에서 자르고 …를 붙인다', () => {
  const astral = '\u{1D400}' // UTF-16으로 두 칸인 글자: 코드 포인트로 세는지 본다
  const [long, exact] = finishPosts([
    p({ key: '1', title: '가'.repeat(299) + astral + astral }),
    p({ key: '2', title: '가'.repeat(299) + astral })
  ])
  expect(long.title).toBe('가'.repeat(299) + astral + '…')
  expect(exact.title).toBe('가'.repeat(299) + astral)
})

test('stripBlocks는 주석·script·style을 공백으로 바꾼다', () => {
  expect(
    stripBlocks('a<!-- x -->b<script>var a = "<a>"</script>c<STYLE type="text/css">p{}</STYLE>d')
  ).toBe('a b c d')
  expect(stripBlocks('<script><!-- x --></script>y')).toBe(' y') // script 안의 주석 표시
  expect(stripBlocks('<!-- <script> -->z')).toBe(' z') // 주석 안의 script 표시
  expect(stripBlocks('<scripts>x</scripts>')).toBe('<scripts>x</scripts>')
})

test('stripBlocks는 닫히지 않은 블록을 끝까지 지운다', () => {
  expect(stripBlocks('a<!-- x')).toBe('a ')
  expect(stripBlocks('a<!-- 1 -->b<!-- 2')).toBe('a b ')
  expect(stripBlocks('a<script>alert(1)')).toBe('a ')
  expect(stripBlocks('a<style>p{}<a href="/1">x</a>')).toBe('a ')
})

test('anchors는 <a>…</a>를 문서 순서대로 돌려준다', () => {
  const html = 'x<a href="/1" class="c">첫째</a> y <A HREF="/2">둘째</A >z'
  expect(anchors(html)).toEqual([
    { attrs: ' href="/1" class="c"', inner: '첫째', start: 1, end: html.indexOf('</a>') + 4 },
    {
      attrs: ' HREF="/2"',
      inner: '둘째',
      start: html.indexOf('<A'),
      end: html.indexOf('</A >') + 5
    }
  ])
  expect(anchors('<abbr>x</abbr><article>y</article>')).toEqual([])
  expect(anchors('<a>x</a>')).toEqual([{ attrs: '', inner: 'x', start: 0, end: 8 }])
})

test('anchors: 닫는 태그가 없으면 거기서 멈추고, 겹친 <a>는 첫 </a>까지 한 요소로 본다', () => {
  expect(anchors('<a href="/1">x <a href="/2">y')).toEqual([])
  const one = '<a href="/1">x</a><a href="/2">y'
  expect(anchors(one).map((a) => a.inner)).toEqual(['x'])
  const nested = '<a href="/1">x<a href="/2">y</a>z</a>'
  expect(anchors(nested)).toEqual([
    { attrs: ' href="/1"', inner: 'x<a href="/2">y', start: 0, end: nested.indexOf('z') }
  ])
})

test('parseJson은 JSON이 아니면 null', () => {
  expect(parseJson('{"a":1}')).toEqual({ a: 1 })
  expect(parseJson('<html>점검 중</html>')).toBeNull()
  expect(parseJson('')).toBeNull()
})

test('깨진 HTML도 선형 시간에 읽는다', () => {
  const nrf = (body: string): string =>
    `<div class="public-notice-list"><div class="public-notice-block">${body}`
  const timed = <T>(f: () => T): T => {
    const t = performance.now()
    const r = f()
    expect(performance.now() - t).toBeLessThan(1000)
    return r
  }
  const valid = Array.from(
    { length: 50_000 },
    (_, i) => `<a href="/v?id=${i}">게시글 제목 번호 ${i}</a> 2026.11.01 `
  ).join('')
  // 묶음마다 쿼리 키 이름이 달라 모양이 다르고, 링크는 묶음끼리 번갈아 나온다.
  const interleaved = (groups: number): string => {
    const out: string[] = []
    for (let j = 0; j < 5; j++)
      for (let g = 0; g < groups; g++)
        out.push(`<a href="/v?k${g}=${j}">게시글 제목 묶음 ${g} 번호 ${j}</a> `)
    return out.join('')
  }
  const cases: [string, number][] = [
    ['<!--'.repeat(500_000), 0], // 약 2MB
    ['<a title-name '.repeat(150_000), 0], // 닫는 > 가 없다
    ['<a class="title-name">x '.repeat(100_000), 0], // </a>가 없다
    ['<a href="/v?id=1">abcdefghijkl '.repeat(100_000), 0],
    [valid, 50_000], // 정상 목록이 커도 느려지지 않는다
    [interleaved(2000), 5], // 묶음이 많아도 날짜는 일부 묶음에서만 읽는다
    [interleaved(20_000), 5]
  ]
  for (const [input, count] of cases) {
    expect(timed(() => parseNrf(nrf(input)))).toEqual([])
    expect(timed(() => parseHtmlList(input, 'https://a.b/'))).toHaveLength(count)
  }
})
