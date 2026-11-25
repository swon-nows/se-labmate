import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { parseIris, readIris } from '../../src/main/core/boards/iris'
import { parseNrf } from '../../src/main/core/boards/nrf'
import { parseSnuDaae, readSnuDaae, snuDaaeCategory } from '../../src/main/core/boards/snu-daae'

const fx = (n: string): string => readFileSync(`tests/fixtures/boards/${n}`, 'utf8')

test('IRIS', () => {
  const posts = parseIris(fx('iris.json'), 'ancmIng')
  expect(posts).toHaveLength(4)
  expect(posts[0]).toEqual({
    key: '024799',
    title: '2026년도 제5차 과학기술분야 연구기획과제 공모',
    url: 'https://www.iris.go.kr/contents/retrieveBsnsAncmView.do?ancmId=024799&ancmPrg=ancmIng',
    date: '2026-11-13T00:00:00.000Z',
    summary: '한국연구재단 · 접수 2026-11-13 ~ 2026-11-26'
  })
  expect(() => parseIris('{"message":"error"}', 'ancmIng')).toThrow('IRIS 응답에 목록이 없습니다')
  expect(() => parseIris('<html>점검 중</html>', 'ancmIng')).toThrow('IRIS 응답에 목록이 없습니다')
  expect(parseIris('{"listBsnsAncmBtinSitu":[]}', 'ancmPre')).toEqual([])
})

test('IRIS 요약은 있는 항목만 이어 붙인다', () => {
  const summary = (extra: Record<string, string>): string | undefined =>
    parseIris(
      JSON.stringify({
        listBsnsAncmBtinSitu: [{ ancmId: '1', ancmTl: '제목 하나', ancmDe: '2026-11-01', ...extra }]
      }),
      'ancmIng'
    )[0]?.summary
  expect(summary({})).toBe('')
  expect(summary({ sorgnNm: '한국연구재단' })).toBe('한국연구재단')
  expect(summary({ rcveStrDe: '2026.11.13' })).toBe('접수 2026-11-13')
  expect(summary({ rcveEndDe: '2026.11.26' })).toBe('접수 2026-11-26')
  expect(summary({ sorgnNm: '한국연구재단', rcveEndDe: '2026.11.26' })).toBe(
    '한국연구재단 · 접수 2026-11-26'
  )
  expect(summary({ rcveStrDe: '2026.11.13', rcveEndDe: '2026.11.26' })).toBe(
    '접수 2026-11-13 ~ 2026-11-26'
  )
})

test('readIris는 접수 중과 접수 예정을 POST로 읽는다', async () => {
  const calls: [string, Record<string, string> | undefined, string | undefined][] = []
  const posts = await readIris(async (u, h, b) => {
    calls.push([u, h, b])
    return fx('iris.json')
  })
  expect(calls.map((c) => c[2])).toEqual([
    'pageIndex=1&ancmPrg=ancmIng',
    'pageIndex=1&ancmPrg=ancmPre'
  ])
  expect(calls[0][0]).toBe('https://www.iris.go.kr/contents/retrieveBsnsAncmBtinSituList.do')
  expect(calls[0][1]).toMatchObject({
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
  })
  expect(posts).toHaveLength(4) // 같은 key는 한 번만
})

// IRIS는 한 쪽에 10건을 주고 쪽 크기 인자는 무시한다. 끝을 지난 쪽은 빈 목록이다.
const irisPage = (from: number, n: number): string =>
  JSON.stringify({
    listBsnsAncmBtinSitu: Array.from({ length: n }, (_, i) => ({
      ancmId: String(from + i),
      ancmTl: `공고 ${from + i}`,
      ancmDe: '2026-11-01'
    }))
  })

test('readIris는 10건이 찬 쪽 다음 쪽을 더 읽고, 덜 찬 쪽에서 멈춘다', async () => {
  const bodies: (string | undefined)[] = []
  const posts = await readIris(async (_u, _h, b) => {
    bodies.push(b)
    if (b === 'pageIndex=1&ancmPrg=ancmIng') return irisPage(0, 10)
    if (b === 'pageIndex=2&ancmPrg=ancmIng') return irisPage(10, 3)
    return irisPage(100, 0)
  })
  expect(posts).toHaveLength(13)
  expect(bodies).toEqual([
    'pageIndex=1&ancmPrg=ancmIng',
    'pageIndex=2&ancmPrg=ancmIng',
    'pageIndex=1&ancmPrg=ancmPre'
  ])
})

test('readIris는 목록마다 세 쪽까지만 읽는다', async () => {
  const bodies: (string | undefined)[] = []
  const posts = await readIris(async (_u, _h, b) => {
    bodies.push(b)
    return irisPage(bodies.length * 10, 10)
  })
  expect(bodies).toEqual([
    'pageIndex=1&ancmPrg=ancmIng',
    'pageIndex=2&ancmPrg=ancmIng',
    'pageIndex=3&ancmPrg=ancmIng',
    'pageIndex=1&ancmPrg=ancmPre',
    'pageIndex=2&ancmPrg=ancmPre',
    'pageIndex=3&ancmPrg=ancmPre'
  ])
  expect(posts).toHaveLength(60)
})

test('한국연구재단', () => {
  const posts = parseNrf(fx('nrf.html'))
  expect(posts.map((p) => p.key)).toEqual(['285561', '285270', '284986', '285818']) // 접수마감 2건 제외
  expect(posts[0]).toEqual({
    key: '285561',
    title: '2027년도「유럽핵입자물리연구소(CERN) 협력사업」 이론물리 공동연구 대학원생 파견 공고',
    url: 'https://www.nrf.re.kr/biz/notice/view?menu_no=362&post_no=285561&biz_no=359',
    date: '2026-11-09T00:00:00.000Z',
    summary: '접수 2026-11-09 ~ 2026-12-11'
  })
  expect(() => parseNrf('<html><body>점검 중</body></html>')).toThrow(
    '한국연구재단 페이지에서 목록을 찾지 못했습니다'
  )
  expect(parseNrf('<div class="public-notice-list"></div>')).toEqual([])
})

const nrfLink = (no: string, biz: string | null, title = `공고 ${no}`): string =>
  `<a href="javascript:;" class="title-name view_btn" data-post_no="${no}"${
    biz === null ? '' : ` data-biz_no="${biz}"`
  }>${title}</a>`
const nrfList = (...blocks: string[]): string =>
  `<div class="public-notice-list">${blocks.map((b) => `<div class="public-notice-block">${b}</div>`).join('')}</div>`

test('한국연구재단: 주석 안의 링크는 글이 아니다', () => {
  const fake = '<a class="title-name view_btn" data-post_no="999" data-biz_no="1">가짜</a>'
  const posts = parseNrf(nrfList(`<!-- ${fake} -->${nrfLink('100', '5')}`))
  expect(posts.map((p) => p.key)).toEqual(['100'])
  expect(posts[0].title).toBe('공고 100')
  expect(parseNrf(nrfList(`<!-- ${fake}`))).toEqual([]) // 닫히지 않은 주석은 끝까지 가려진다
})

test('한국연구재단: 접수일자 줄이 없거나 종료일이 없는 경우', () => {
  const [both, startOnly, none] = parseNrf(
    nrfList(
      `${nrfLink('1', '5')}<span>접수일자 : 2026-11-09 ~ 2026-12-11</span>`,
      `${nrfLink('2', '5')}<span>접수일자 : 2026-11-09</span>`,
      nrfLink('3', '5')
    )
  )
  expect(both.summary).toBe('접수 2026-11-09 ~ 2026-12-11')
  expect(startOnly).toMatchObject({ date: '2026-11-09T00:00:00.000Z', summary: '접수 2026-11-09' })
  expect(none).toMatchObject({ date: null, summary: '' })
})

test('한국연구재단: 주소에는 숫자만 넣는다', () => {
  const posts = parseNrf(
    nrfList(
      nrfLink('12a', '3'), // 글 번호가 숫자가 아니면 건너뛴다
      nrfLink('77&x=1', '3'),
      nrfLink('78', 'x1'),
      nrfLink('79', null),
      nrfLink('80', '')
    )
  )
  expect(posts.map((p) => p.url)).toEqual([
    'https://www.nrf.re.kr/biz/notice/view?menu_no=362&post_no=78',
    'https://www.nrf.re.kr/biz/notice/view?menu_no=362&post_no=79',
    'https://www.nrf.re.kr/biz/notice/view?menu_no=362&post_no=80'
  ])
})

test('서울대 건축학과', () => {
  const posts = parseSnuDaae(fx('snu-daae.json'))
  expect(posts).toHaveLength(27)
  expect(posts[0]).toMatchObject({
    key: '25520',
    url: 'https://architecture.snu.ac.kr/post/25520',
    date: '2026-11-18T00:00:00.000Z',
    summary: ''
  })
  expect(parseSnuDaae('{"err":0,"list":[]}')).toEqual([])
  expect(() => parseSnuDaae('{"err":1}')).toThrow('서울대 건축학과 응답에 목록이 없습니다')
  expect(() => parseSnuDaae('{"err":1,"list":[]}')).toThrow(
    '서울대 건축학과 응답에 목록이 없습니다'
  )
  expect(snuDaaeCategory('https://architecture.snu.ac.kr/posts/events')).toBe('events')
  expect(snuDaaeCategory('https://architecture.snu.ac.kr/')).toBe('notice')
  expect(snuDaaeCategory('https://architecture.snu.ac.kr/posts/unknown')).toBe('notice')
  expect(snuDaaeCategory('https://cse.snu.ac.kr/posts/notice')).toBeNull()
  expect(snuDaaeCategory('not a url')).toBeNull()
})

test('readSnuDaae는 JSON 본문으로 POST한다', async () => {
  const calls: [string, Record<string, string> | undefined, string | undefined][] = []
  const posts = await readSnuDaae('events', async (u, h, b) => {
    calls.push([u, h, b])
    return fx('snu-daae.json')
  })
  expect(calls).toHaveLength(1)
  expect(calls[0][0]).toBe('https://architecture.snu.ac.kr/rest/activities/getPosts')
  expect(calls[0][1]).toMatchObject({ 'Content-Type': 'application/json' })
  expect(calls[0][2]).toBe('{"page":1,"category":"events","search":""}')
  expect(posts).toHaveLength(27)
})
