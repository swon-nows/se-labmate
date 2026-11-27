import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { collect, type CollectDeps } from '../src/main/collector'
import { boardId } from '../src/main/core/boards/index'
import { pastItems, takeNew } from '../src/main/core/feed'
import { applyCollected } from '../src/main/core/merge'
import { validateBoard } from '../src/main/core/profile'
import { DEADLINES_URL } from '../src/main/core/sources/deadlines'
import { GITHUB_TRENDING_URL } from '../src/main/core/sources/github'
import { defaultState, loadState, saveState } from '../src/main/store'
import { BUILTIN_BOARDS, FIELD_BOARDS } from '../src/shared/sources'
import type { AppState, ConferenceField, Profile } from '../src/shared/types'
import { NOW, mk, st } from './helpers'

const fx = (n: string): string => readFileSync(`tests/fixtures/${n}`, 'utf8')
const FILE: Record<string, string> = {
  'api.openalex.org': 'openalex.json',
  'export.arxiv.org': 'arxiv.xml',
  'github.com': 'github-trending.html',
  'www.iris.go.kr': 'boards/iris.json',
  'www.nrf.re.kr': 'boards/nrf.html',
  'architecture.snu.ac.kr': 'boards/snu-daae.json',
  'cse.snu.ac.kr': 'boards/cse-snu.html',
  'ccfddl.com': 'ccf-deadlines.json'
}

// bodies: 호스트 → 그 호스트가 돌려줄 본문(fixture 대신)
type Opts = { openAlexKey?: string | null; fail?: string[]; bodies?: Record<string, string> }

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
      if (o.bodies && Object.hasOwn(o.bodies, u.hostname)) return o.bodies[u.hostname]
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

// 요청마다 답을 직접 풀어 주는 가짜 fetchText: 어떤 요청이 언제 시작됐는지 볼 수 있다. patch는 받은 본문을 고친다.
type Gate = { host: string; open: boolean; answer: () => void }
function gatedDeps(
  o: Opts,
  patch: (host: string, text: string) => string = (_h, t) => t
): CollectDeps & { gates: Gate[] } {
  const inner = deps(o)
  const gates: Gate[] = []
  return {
    ...inner,
    gates,
    fetchText: (url, h) =>
      new Promise<string>((resolve, reject) => {
        const host = new URL(url).hostname
        const gate: Gate = {
          host,
          open: true,
          answer: () => {
            gate.open = false
            void inner.fetchText(url, h).then((t) => resolve(patch(host, t)), reject)
          }
        }
        gates.push(gate)
      })
  }
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
// 게시판은 요청이 이어지므로 새로 생기는 요청까지 더 나오지 않을 때까지 답한다.
const answer = async (g: { gates: Gate[] }, ...hosts: string[]): Promise<void> => {
  for (let more = true; more;) {
    const now = g.gates.filter((x) => x.open && hosts.includes(x.host))
    more = now.length > 0
    for (const x of now) x.answer()
    await tick()
  }
}
const STARTED = [
  'api.openalex.org',
  'architecture.snu.ac.kr',
  'export.arxiv.org',
  'github.com',
  'news.google.com',
  'www.iris.go.kr',
  'www.nrf.re.kr'
]

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
  const out = await collect(withProfile, deps({ fail: ['github.com'] }))
  expect(Object.keys(out.sourceErrors)).toEqual(['GitHub'])
  expect(Object.values(out.items).some((i) => i.category === 'paper')).toBe(true)
})

test('출처를 한꺼번에 시작하고, 늦게 온 OpenAlex도 같은 논문에서는 arXiv보다 앞선다', async () => {
  const SHARED = 'Subgraph Filtering for Fair Graph Neural Networks' // OpenAlex 고정 파일의 논문
  const g = gatedDeps({ openAlexKey: 'K' }, (host, text) =>
    host === 'export.arxiv.org'
      ? text.replace(
          'Finite-difference neural policy iteration for high-dimensional degenerate Hamilton--Jacobi equations',
          SHARED
        )
      : text
  )
  const url = 'https://architecture.snu.ac.kr/posts/notice'
  const board = { id: boardId(url), name: '건축학과', url, category: 'school' as const }
  const done = collect({ ...withProfile, boards: [board] }, g)
  await tick()
  // 아무 답도 오기 전에 모든 출처의 첫 요청이 나가 있다.
  expect([...new Set(g.gates.map((x) => x.host))].sort()).toEqual(STARTED)
  await answer(g, ...STARTED.filter((h) => h !== 'api.openalex.org'))
  await answer(g, 'api.openalex.org')
  const out = await done
  const shared = Object.values(out.items).filter((i) => i.title === SHARED)
  expect(shared.map((i) => i.source)).toEqual(['OpenAlex'])
})

test('한 출처가 먼저 실패해도 아직 오지 않은 나머지는 끝까지 기다려 합친다', async () => {
  const g = gatedDeps({ openAlexKey: 'K', fail: ['api.openalex.org'] })
  const done = collect(withProfile, g)
  await tick()
  await answer(g, 'api.openalex.org')
  await answer(g, ...STARTED.filter((h) => h !== 'api.openalex.org'))
  const out = await done
  expect(out.sourceErrors).toEqual({ OpenAlex: 'network down' })
  expect(Object.values(out.items).some((i) => i.source === 'arXiv')).toBe(true)
  expect(Object.values(out.items).some((i) => i.category === 'repo')).toBe(true)
})

test('인터넷이 끊겨도 저장된 항목은 그대로다', async () => {
  const before = { ...withProfile, items: { 'paper:x': mk({ id: 'paper:x' }) } }
  const out = await collect(
    before,
    deps({
      fail: [
        'api.openalex.org',
        'export.arxiv.org',
        'github.com',
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

test('GitHub는 Trending 페이지를 헤더 없이 한 번만 부른다', async () => {
  const d = deps({ openAlexKey: 'K' })
  await collect(withProfile, d)
  const github = d.calls.filter((u) => new URL(u).hostname === 'github.com')
  expect(github).toEqual([GITHUB_TRENDING_URL])
  expect(d.calls.some((u) => new URL(u).hostname === 'api.github.com')).toBe(false)
  expect(d.headers['github.com']).toBeUndefined()
  expect(d.headers['export.arxiv.org']).toBeUndefined()
})

test('저장소는 키워드와 무관하게 설정한 개수만큼 가져온다', async () => {
  const repos = (s: AppState): string[] =>
    Object.values(s.items)
      .filter((i) => i.category === 'repo')
      .map((i) => i.id)
  expect(repos(await collect(withProfile, deps()))).toHaveLength(10)
  const three = st({ ...withProfile, settings: { ...withProfile.settings, repoCount: 3 } })
  expect(repos(await collect(three, deps()))).toHaveLength(3)
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
  const out = await collect(before, deps({ openAlexKey: null, fail: ['github.com'] }))
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

const markSeen = (s: AppState): AppState => ({
  ...s,
  items: Object.fromEntries(Object.entries(s.items).map(([id, i]) => [id, { ...i, seenAt: NOW }]))
})

test('v1에서 올라와도 본 항목은 본 채로 남고, 새 소식은 처음 읽는 과제 공고뿐이다', async () => {
  const seen = markSeen(await collect(withProfile, deps({ openAlexKey: 'K' })))
  // v1 모양: 게시판이 없고, OpenAlex의 저널 이름은 summary에 있었고, 논문 키워드와 과제 공고는 없었다.
  const v1Items = Object.fromEntries(
    Object.entries(seen.items)
      .filter(([, i]) => i.category !== 'grant')
      .map(([id, i]) => {
        const plain = { ...i, venue: undefined, keywords: undefined } // JSON에 쓰면 빠진다
        if (i.source === 'OpenAlex') return [id, { ...plain, summary: i.venue ?? '' }]
        return [id, i.source === 'arXiv' ? plain : i]
      })
  )
  const v1 = { ...seen, version: 1, boards: undefined, boardKnown: undefined, items: v1Items }
  const dir = mkdtempSync(join(tmpdir(), 'ra-')) // 임시 폴더는 운영체제에 맡긴다
  writeFileSync(join(dir, 'state.json'), JSON.stringify(v1))
  const loaded = loadState(join(dir, 'state.v2.json'), undefined, join(dir, 'state.json'))
  const after = applyCollected(loaded, await collect(loaded, deps({ openAlexKey: 'K' })), NOW)

  const v1Ids = Object.keys(v1Items)
  expect(v1Ids.length).toBeGreaterThan(0)
  expect(v1Ids.filter((id) => after.items[id]?.seenAt !== NOW)).toEqual([])
  const unseen = Object.values(after.items).filter((i) => i.seenAt === null)
  expect(unseen.length).toBeGreaterThan(0)
  expect(unseen.every((i) => i.category === 'grant')).toBe(true)
  for (const b of BUILTIN_BOARDS)
    expect(unseen.filter((i) => i.source === b.name).length).toBeLessThanOrEqual(10)
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
    expect(s1.boardKnown[board.id].length).toBeGreaterThan(0)
    const s2 = await collect(s1, deps({}))
    expect(Object.keys(s2.items).length).toBe(Object.keys(s1.items).length)
    // items를 비워도 boardKnown만으로 새 글이 없다: 저장된 id로 걸러진 것이 아니다.
    const s3 = await collect({ ...s1, items: {} }, deps({}))
    expect(Object.values(s3.items).filter((i) => i.category === 'school')).toHaveLength(0)
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

  test('게시판을 지웠다가 같은 주소로 다시 등록해도 같은 id이고 본 글이 새 글로 돌아오지 않는다', async () => {
    const input = { name: '건축학과', url, category: 'school' as const }
    const first = validateBoard(input, [])
    if (!first.ok) throw new Error(first.error)
    const seen = markSeen(await collect({ ...withProfileKR, boards: [first.board] }, deps({})))
    const before = Object.keys(seen.items).sort()
    expect(before.some((id) => id.startsWith(`board:${first.board.id}:`))).toBe(true)

    // ipc의 removeBoard처럼 목록에서 빼고 그 게시판의 boardKnown을 지운다.
    const boardKnown = { ...seen.boardKnown }
    delete boardKnown[first.board.id]
    const removed = await collect({ ...seen, boards: [], boardKnown }, deps({}))

    const again = validateBoard(input, removed.boards)
    if (!again.ok) throw new Error(again.error)
    expect(again.board.id).toBe(first.board.id)
    const readded = await collect({ ...removed, boards: [again.board] }, deps({}))

    expect(Object.values(readded.items).filter((i) => i.seenAt === null)).toEqual([])
    expect(Object.keys(readded.items).sort()).toEqual(before)
    const known = readded.boardKnown[again.board.id]
    expect(new Set(known).size).toBe(known.length)
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

describe('학회 분야', () => {
  const withFields = (
    conferenceFields: ConferenceField[],
    country: Profile['country'] = 'KR'
  ): AppState =>
    st({
      profile: { ...PROFILE, country },
      settings: { ...defaultState().settings, conferenceFields }
    })
  const host = (url: string): string => new URL(url).hostname
  const conferences = (s: AppState): AppState['items'][string][] =>
    Object.values(s.items).filter((i) => i.category === 'conference')
  const ccf = (s: AppState): AppState['items'][string][] =>
    conferences(s).filter((i) => i.source === 'CCF Deadlines')

  // 최근 글 둘: 학회 행사 글과 일반 공지
  const feed = (h: string, posts: [string, string][]): string =>
    `<rss><channel>${posts
      .map(
        ([title, date], i) =>
          `<item><title>${title}</title><link>https://${h}/${i}</link><guid>${h}-${i}</guid><pubDate>${date}</pubDate></item>`
      )
      .join('')}</channel></rss>`
  const RECENT = 'Fri, 20 Nov 2026 00:00:00 GMT'
  const TWO: (h: string) => string = (h) =>
    feed(h, [
      ['2026 추계학술대회 논문모집 안내', RECENT],
      ['사무국 부재 안내', RECENT]
    ])
  const structural = FIELD_BOARDS.filter((b) => b.field === 'structural')
  const answers = (boards: { url: string }[]): Record<string, string> =>
    Object.fromEntries(boards.map((b) => [host(b.url), TWO(host(b.url))]))

  test('AI: CCF Deadlines를 한 번 요청해 마감이 있는 학회 여섯 건을 저장하고, 다시 수집하면 더하지 않는다', async () => {
    const d = deps()
    const out = await collect(withFields(['ai'], 'OTHER'), d)
    expect(d.calls.filter((u) => u === DEADLINES_URL)).toHaveLength(1)
    expect(d.calls.filter((u) => host(u) === 'ccfddl.com')).toHaveLength(1)
    expect(ccf(out)).toHaveLength(6)
    expect(ccf(out).every((i) => i.deadline !== undefined)).toBe(true)
    expect(d.calls.some((u) => host(u) === 'aiassociation.kr')).toBe(false)
    expect(out.sourceErrors).toEqual({})
    const again = await collect(out, deps())
    expect(Object.keys(again.items).sort()).toEqual(Object.keys(out.items).sort())
  })

  test('분야를 고르지 않으면 ccfddl.com을 요청하지 않는다', async () => {
    const d = deps()
    const out = await collect(withFields([], 'OTHER'), d)
    expect(d.calls.some((u) => host(u) === 'ccfddl.com')).toBe(false)
    expect(conferences(out)).toEqual([])
  })

  test('CCF Deadlines가 실패하면 그 출처의 오류만 남고 나머지는 온다', async () => {
    const out = await collect(withFields(['ai'], 'OTHER'), deps({ fail: ['ccfddl.com'] }))
    expect(out.sourceErrors).toEqual({ 'CCF Deadlines': 'network down' })
    expect(ccf(out)).toEqual([])
    expect(Object.values(out.items).some((i) => i.category === 'paper')).toBe(true)
  })

  test('Structural engineering(한국): 분야 게시판마다 요청하고 boardKnown에 키가 생긴다', async () => {
    const d = deps({ bodies: answers(structural) })
    const out = await collect(withFields(['structural']), d)
    for (const b of structural) expect(d.calls).toContain(b.url)
    expect(Object.keys(out.boardKnown).sort()).toEqual(
      ['iris', 'nrf', ...structural.map((b) => b.id)].sort()
    )
    expect(out.sourceErrors).toEqual({})
    // 일정 목록(fib)의 글은 지난 날짜라 처음에는 새 글이 아니다. 나머지 아홉 게시판에서 행사 글 하나씩.
    expect(
      conferences(out)
        .map((i) => i.source)
        .sort()
    ).toEqual(
      structural
        .filter((b) => b.kind === 'notices')
        .map((b) => b.name)
        .sort()
    )
  })

  test('그 외 국가에서는 국내 학회 게시판을 요청하지 않는다', async () => {
    const d = deps({ bodies: answers(structural) })
    await collect(withFields(['structural'], 'OTHER'), d)
    expect(d.calls.map(host)).toContain('www.eeri.org')
    expect(d.calls.map(host)).toContain('www.fib-international.org')
    expect(d.calls.some((u) => host(u).endsWith('.or.kr'))).toBe(false)
  })

  test('공지 게시판은 제목이 행사 글인 새 글만 새 소식이고, 걸러 낸 글도 다시 새 글이 되지 않는다', async () => {
    const eeri = structural.find((b) => b.id === 'conf-eeri') as (typeof structural)[number]
    const o = { bodies: answers([eeri]) }
    const first = await collect(withFields(['structural'], 'OTHER'), deps(o))
    expect(conferences(first).map((i) => [i.source, i.title])).toEqual([
      ['EERI', '2026 추계학술대회 논문모집 안내']
    ])
    expect(first.boardKnown[eeri.id]).toHaveLength(4) // 두 글의 id와 주소: 거른 글도 읽은 글이다
    const second = await collect(first, deps(o))
    expect(Object.keys(second.items).sort()).toEqual(Object.keys(first.items).sort())
    const third = await collect({ ...second, items: {} }, deps(o))
    expect(conferences(third)).toEqual([])
  })

  test('분류 이름이 제목 앞에 붙는 게시판(대한건축학회)은 그것을 떼고 보이고, 뗀 제목으로 거른다', async () => {
    const aik = structural.find((b) => b.id === 'conf-aik') as (typeof structural)[number]
    const h = host(aik.url)
    const body = feed(h, [
      ['학술행사 제39회 AIK 월례세미나', RECENT],
      ['학술행사 제22회 건축의날 기념식 안내', RECENT],
      ['학술행사장 대관 세미나실 안내', RECENT]
    ])
    const out = await collect(
      withFields(['structural'], 'KR'),
      deps({ bodies: { ...answers(structural), [h]: body } })
    )
    expect(
      conferences(out)
        .filter((i) => i.source === '대한건축학회')
        .map((i) => i.title)
        .sort()
    ).toEqual(['제39회 AIK 월례세미나', '학술행사장 대관 세미나실 안내'].sort())
  })

  test('사용자가 등록한 게시판은 제목을 거르지 않는다', async () => {
    const url = 'https://society.example/feed'
    const board = {
      id: boardId(url),
      name: '내 학회',
      url,
      category: 'conference' as const
    }
    const out = await collect(
      { ...withFields([], 'OTHER'), boards: [board] },
      deps({ bodies: { 'society.example': TWO('society.example') } })
    )
    expect(
      conferences(out)
        .map((i) => i.title)
        .sort()
    ).toEqual(['2026 추계학술대회 논문모집 안내', '사무국 부재 안내'].sort())
  })

  test('일정 목록(fib)은 처음에 다가오는 행사를 제목과 상관없이 보인다', async () => {
    const fib = structural.find((b) => b.id === 'conf-fib') as (typeof structural)[number]
    const out = await collect(
      withFields(['structural'], 'OTHER'),
      deps({
        bodies: {
          [host(fib.url)]: feed(host(fib.url), [
            ['Commission 7 meeting', 'Mon, 01 Mar 2027 00:00:00 GMT'],
            ['Past gathering', 'Mon, 01 Jun 2026 00:00:00 GMT']
          ]),
          'www.eeri.org': feed('www.eeri.org', [])
        }
      })
    )
    expect(conferences(out).map((i) => [i.source, i.title])).toEqual([
      ['fib', 'Commission 7 meeting']
    ])
    expect(out.boardKnown[fib.id]).toHaveLength(4)
  })
})
