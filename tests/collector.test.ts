import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { collect, type CollectDeps } from '../src/main/collector'
import { boardId } from '../src/main/core/boards/index'
import { pastItems, takeNew } from '../src/main/core/feed'
import { defaultState, loadState, saveState } from '../src/main/store'
import type { Profile } from '../src/shared/types'
import { NOW, mk, st } from './helpers'

const fx = (n: string): string => readFileSync(`tests/fixtures/${n}`, 'utf8')
const FILE: Record<string, string> = {
  'api.openalex.org': 'openalex.json',
  'export.arxiv.org': 'arxiv.xml',
  'api.github.com': 'github.json',
  'www.iris.go.kr': 'boards/iris.json',
  'www.nrf.re.kr': 'boards/nrf.html',
  'architecture.snu.ac.kr': 'boards/snu-daae.json',
  'cse.snu.ac.kr': 'boards/cse-snu.html'
}

type Opts = { openAlexKey?: string | null; fail?: string[] }

// URL의 호스트로 fixture를 돌려주는 가짜 fetchText(POST 본문은 보지 않는다). 부른 URL과 호스트별 마지막 헤더를 기록한다.
function fakeDeps(
  o: Opts,
  now: string
): CollectDeps & {
  calls: string[]
  headers: Record<string, Record<string, string> | undefined>
} {
  const calls: string[] = []
  const headers: Record<string, Record<string, string> | undefined> = {}
  return {
    calls,
    headers,
    openAlexKey: o.openAlexKey ?? null,
    now: () => new Date(now),
    fetchText: async (url, h) => {
      const u = new URL(url)
      calls.push(url)
      headers[u.hostname] = h
      if (o.fail?.includes(u.hostname)) throw new Error('network down')
      if (u.hostname === 'news.google.com')
        return fx(u.searchParams.get('hl') === 'ko' ? 'gnews-ko.xml' : 'gnews-en.xml')
      return fx(FILE[u.hostname])
    }
  }
}
const deps = (o: Opts = {}): ReturnType<typeof fakeDeps> => fakeDeps(o, NOW)

const PROFILE: Profile = {
  keywordsEn: ['graph neural network'],
  keywordsKo: ['인공지능'],
  country: 'KR'
}
const withProfile = st({ profile: PROFILE })

test('모든 출처를 모아 합친다', async () => {
  const out = await collect(withProfile, deps({ openAlexKey: 'K' }))
  const cats = new Set(Object.values(out.items).map((i) => i.category))
  expect(cats).toEqual(new Set(['paper', 'repo', 'news', 'grant']))
  expect(out.sourceErrors).toEqual({})
})

test('키가 없으면 OpenAlex를 부르지 않는다', async () => {
  const d = deps({ openAlexKey: null })
  await collect(withProfile, d)
  expect(d.calls.some((u) => u.includes('api.openalex.org'))).toBe(false)
})

test('한 출처가 실패해도 나머지는 계속한다', async () => {
  const out = await collect(withProfile, deps({ fail: ['api.github.com'] }))
  expect(Object.keys(out.sourceErrors)).toEqual(['GitHub'])
  expect(Object.values(out.items).some((i) => i.category === 'paper')).toBe(true)
})

test('인터넷이 끊겨도 저장된 항목은 그대로다', async () => {
  const before = { ...withProfile, items: { 'paper:x': mk({ id: 'paper:x' }) } }
  const out = await collect(
    before,
    deps({
      fail: [
        'api.openalex.org',
        'export.arxiv.org',
        'api.github.com',
        'news.google.com',
        'www.iris.go.kr',
        'www.nrf.re.kr'
      ],
      openAlexKey: 'K'
    })
  )
  expect(out.items).toEqual(before.items)
  expect(out.boardKnown).toEqual({})
  expect(Object.keys(out.sourceErrors).sort()).toEqual([
    'GitHub',
    'Google News (EN)',
    'Google News (KO)',
    'IRIS',
    'OpenAlex',
    'arXiv',
    '한국연구재단'
  ])
})

test('꺼진 카테고리는 요청하지 않는다', async () => {
  const d = deps({})
  await collect(st({ ...withProfile, enabled: { repo: false, news: false, grant: false } }), d)
  expect(d.calls.length).toBeGreaterThan(0)
  expect(d.calls.every((u) => u.includes('arxiv.org'))).toBe(true)
})

test('성공하면 이전 오류가 지워진다', async () => {
  const out = await collect({ ...withProfile, sourceErrors: { arXiv: 'HTTP 503' } }, deps({}))
  expect(out.sourceErrors.arXiv).toBeUndefined()
})

test('프로필이 없으면 아무것도 하지 않는다', async () => {
  const d = deps({})
  expect(await collect(defaultState(), d)).toEqual(defaultState())
  expect(d.calls).toEqual([])
})

test('입력 상태를 바꾸지 않는다', async () => {
  const before = {
    ...withProfile,
    items: { 'paper:x': mk({ id: 'paper:x' }) },
    sourceErrors: { arXiv: 'HTTP 503' }
  }
  const copy = structuredClone(before)
  const out = await collect(before, deps({ openAlexKey: 'K', fail: ['api.openalex.org'] }))
  expect(before).toEqual(copy)
  expect(out.sourceErrors).toEqual({ OpenAlex: 'network down' })
})

test('GitHub에만 정해진 헤더를 보낸다', async () => {
  const d = deps({ openAlexKey: 'K' })
  await collect(withProfile, d)
  expect(d.headers['api.github.com']).toEqual({
    Accept: 'application/vnd.github+json',
    'User-Agent': 'research-assistant'
  })
  expect(d.headers['export.arxiv.org']).toBeUndefined()
})

test('건너뛴 출처의 이전 오류는 지워지고 실패한 출처만 남는다', async () => {
  const before = st({
    ...withProfile,
    enabled: { news: false },
    sourceErrors: {
      OpenAlex: 'HTTP 401',
      'Google News (KO)': 'HTTP 503',
      'Google News (EN)': 'HTTP 503',
      GitHub: 'HTTP 403'
    }
  })
  const out = await collect(before, deps({ openAlexKey: null, fail: ['api.github.com'] }))
  expect(Object.keys(out.sourceErrors)).toEqual(['GitHub'])
  expect(out.sourceErrors.GitHub).toBe('network down')
})

test('영문 키워드와 한글 키워드를 알맞은 출처로 보낸다', async () => {
  const d = deps({ openAlexKey: 'K' })
  await collect(withProfile, d)
  const urls = d.calls.map((c) => new URL(c))
  const text = (u: URL): string => [...u.searchParams.values()].join(' ')
  const to = (host: string, hl?: string): string[] =>
    urls
      .filter((u) => u.hostname === host && (hl === undefined || u.searchParams.get('hl') === hl))
      .map(text)

  const ko = to('news.google.com', 'ko')
  expect(ko).toHaveLength(1)
  expect(ko[0]).toContain('인공지능')
  expect(ko[0]).not.toContain('graph neural network')

  for (const en of [
    to('news.google.com', 'en-US'),
    to('export.arxiv.org'),
    to('api.github.com'),
    to('api.openalex.org')
  ]) {
    expect(en).toHaveLength(1)
    expect(en[0]).toContain('graph neural network')
    expect(en[0]).not.toContain('인공지능')
  }
})

test('한국어 뉴스는 국가가 KR이고 한글 키워드가 있을 때만 요청한다', async () => {
  for (const profile of [
    { ...PROFILE, country: 'OTHER' as const },
    { ...PROFILE, keywordsKo: [] }
  ]) {
    const d = deps({})
    await collect(st({ profile }), d)
    const hls = d.calls.map((c) => new URL(c).searchParams.get('hl'))
    expect(hls).not.toContain('ko')
    expect(hls).toContain('en-US')
  }
})

test('다시 실행하면 같은 결과가 와도 새 소식이 없고, 받았던 항목은 지난 소식에 있다', async () => {
  const first = await collect(withProfile, deps({ openAlexKey: 'K' }))
  const taken = takeNew(first, NOW)
  const takenIds = taken.groups.flatMap((g) => g.items.map((i) => i.id))
  expect(takenIds.length).toBeGreaterThan(0)

  const file = join(mkdtempSync(join(tmpdir(), 'ra-')), 'state.json') // 임시 폴더는 운영체제에 맡긴다
  saveState(file, taken.state)
  const again = await collect(loadState(file), deps({ openAlexKey: 'K' }))

  expect(takeNew(again, NOW).groups).toEqual([])
  const past = new Set(pastItems(again, Infinity).map((i) => i.id))
  for (const id of takenIds) expect(past.has(id)).toBe(true)
})

describe('게시판과 과제 공고', () => {
  const NOW = '2026-11-25T03:00:00.000Z'
  const deps = (o: Opts = {}): ReturnType<typeof fakeDeps> => fakeDeps(o, NOW)
  const withProfileKR = withProfile
  const url = 'https://architecture.snu.ac.kr/posts/notice'
  const board = { id: boardId(url), name: '건축학과', url, category: 'school' as const }
  const cse = 'https://cse.snu.ac.kr/ko/community/notice'
  const board2 = { id: boardId(cse), name: '컴퓨터공학부', url: cse, category: 'school' as const }
  const hosts = (d: { calls: string[] }): string[] => d.calls.map((c) => new URL(c).hostname)

  test('한국이면 IRIS와 한국연구재단의 공고가 과제 공고로 들어오고, 같은 제목은 한 번만', async () => {
    const out = await collect(withProfileKR, deps({}))
    const grants = Object.values(out.items).filter((i) => i.category === 'grant')
    expect(
      grants
        .filter((g) => g.title === '2026년도 제5차 과학기술분야 연구기획과제 공모')
        .map((g) => g.source)
    ).toEqual(['IRIS'])
    expect(grants.some((g) => g.source === '한국연구재단')).toBe(true)
    expect(Object.keys(out.boardKnown).sort()).toEqual(['iris', 'nrf'])
  })

  test('그 외 국가면 과제 공고를 요청하지 않는다', async () => {
    const d = deps({})
    const out = await collect(st({ profile: { ...PROFILE, country: 'OTHER' } }), d)
    expect(hosts(d)).not.toContain('www.iris.go.kr')
    expect(hosts(d)).not.toContain('www.nrf.re.kr')
    expect(Object.values(out.items).some((i) => i.category === 'grant')).toBe(false)
    expect(out.boardKnown).toEqual({})
  })

  test('등록한 게시판: 처음에는 최근 글 10건, 다시 수집하면 0건', async () => {
    const s1 = await collect({ ...withProfileKR, boards: [board] }, deps({}))
    const school = Object.values(s1.items).filter((i) => i.category === 'school')
    expect(school).toHaveLength(10)
    expect(
      school.every((i) => i.source === '건축학과' && i.id.startsWith(`board:${board.id}:`))
    ).toBe(true)
    const s2 = await collect(s1, deps({}))
    expect(Object.keys(s2.items).length).toBe(Object.keys(s1.items).length)
  })

  test('게시판 하나가 실패해도 나머지는 계속하고, 그 게시판의 boardKnown은 그대로다', async () => {
    const before = { ...withProfileKR, boards: [board, board2], boardKnown: { [board.id]: ['x'] } }
    const out = await collect(before, deps({ fail: ['architecture.snu.ac.kr'] }))
    expect(out.sourceErrors).toEqual({ 건축학과: 'network down' })
    expect(out.boardKnown[board.id]).toEqual(['x'])
    expect(Object.keys(out.boardKnown).sort()).toEqual([board.id, board2.id, 'iris', 'nrf'].sort())
    expect(Object.values(out.items).some((i) => i.source === '컴퓨터공학부')).toBe(true)
    expect(Object.values(out.items).some((i) => i.source === '건축학과')).toBe(false)
  })

  test('꺼진 카테고리의 게시판은 요청하지 않고 옛 오류도 지운다', async () => {
    const d = deps({})
    const before = st({
      ...withProfileKR,
      boards: [board],
      enabled: { school: false, grant: false },
      sourceErrors: { 건축학과: 'HTTP 500', IRIS: 'HTTP 500', 'Google 뉴스(영문)': 'HTTP 503' }
    })
    const out = await collect(before, d)
    expect(hosts(d)).not.toContain('architecture.snu.ac.kr')
    expect(hosts(d)).not.toContain('www.iris.go.kr')
    expect(hosts(d)).not.toContain('www.nrf.re.kr')
    expect(out.sourceErrors).toEqual({})
    expect(out.boardKnown).toEqual({})
  })
})
