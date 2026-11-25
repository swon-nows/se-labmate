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
    summary: '한국연구재단 · 접수 2026.11.13 ~ 2026.11.26'
  })
  expect(() => parseIris('{"message":"error"}', 'ancmIng')).toThrow('IRIS 응답에 목록이 없습니다')
  expect(() => parseIris('<html>점검 중</html>', 'ancmIng')).toThrow('IRIS 응답에 목록이 없습니다')
  expect(parseIris('{"listBsnsAncmBtinSitu":[]}', 'ancmPre')).toEqual([])
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

test('서울대 건축학과', () => {
  const posts = parseSnuDaae(fx('snu-daae.json'))
  expect(posts).toHaveLength(27)
  expect(posts[0]).toMatchObject({
    key: '25520',
    url: 'https://architecture.snu.ac.kr/post/25520',
    date: '2026-11-18T00:00:00.000Z',
    summary: ''
  })
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
