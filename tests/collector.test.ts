import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { collect, type CollectDeps } from '../src/main/collector'
import { pastItems, takeNew } from '../src/main/core/feed'
import { defaultState, loadState, saveState } from '../src/main/store'
import type { Profile } from '../src/shared/types'
import { NOW, mk, st } from './helpers'

const fx = (n: string): string => readFileSync(`tests/fixtures/${n}`, 'utf8')
const FILE: Record<string, string> = {
  'api.openalex.org': 'openalex.json',
  'export.arxiv.org': 'arxiv.xml',
  'api.github.com': 'github.json'
}

// URL의 호스트로 fixture를 돌려주는 가짜 fetchText. 부른 URL과 호스트별 마지막 헤더를 기록한다.
function deps(o: { openAlexKey?: string | null; fail?: string[] } = {}): CollectDeps & {
  calls: string[]
  headers: Record<string, Record<string, string> | undefined>
} {
  const calls: string[] = []
  const headers: Record<string, Record<string, string> | undefined> = {}
  return {
    calls,
    headers,
    openAlexKey: o.openAlexKey ?? null,
    now: () => new Date(NOW),
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

const PROFILE: Profile = {
  keywordsEn: ['graph neural network'],
  keywordsKo: ['인공지능'],
  country: 'KR'
}
const withProfile = st({ profile: PROFILE })

test('네 출처를 모아 합친다', async () => {
  const out = await collect(withProfile, deps({ openAlexKey: 'K' }))
  const cats = new Set(Object.values(out.items).map((i) => i.category))
  expect(cats).toEqual(new Set(['paper', 'repo', 'news']))
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
      fail: ['api.openalex.org', 'export.arxiv.org', 'api.github.com', 'news.google.com'],
      openAlexKey: 'K'
    })
  )
  expect(out.items).toEqual(before.items)
  expect(Object.keys(out.sourceErrors).sort()).toEqual([
    'GitHub',
    'Google 뉴스(영문)',
    'Google 뉴스(한국어)',
    'OpenAlex',
    'arXiv'
  ])
})

test('꺼진 카테고리는 요청하지 않는다', async () => {
  const d = deps({})
  await collect(st({ ...withProfile, enabled: { repo: false, news: false } }), d)
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
      'Google 뉴스(한국어)': 'HTTP 503',
      'Google 뉴스(영문)': 'HTTP 503',
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
