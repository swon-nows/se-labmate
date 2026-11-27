import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { DEADLINE_WINDOW_DAYS, parseDeadlines } from '../../src/main/core/sources/deadlines'
import { NOW } from '../helpers'

const fixture = readFileSync('tests/fixtures/ccf-deadlines.json', 'utf8')
const now = new Date(NOW)

// 인라인 자료: 등급이 있는 AI 학회 하나, 판 하나. over로 학회를, edition으로 판을 덮어쓴다.
const conf = (
  edition: Record<string, unknown> = {},
  over: Record<string, unknown> = {}
): Record<string, unknown> => ({
  title: 'TC',
  description: 'Test Conference',
  sub: 'AI',
  rank: { ccf: 'A', core: 'N', thcpl: 'N' },
  confs: [
    {
      year: 2027,
      id: 'tc27',
      link: 'https://tc.example/2027',
      timeline: [{ deadline: '2027-01-10 12:00:00' }],
      timezone: 'UTC',
      ...edition
    }
  ],
  ...over
})
const parse = (data: unknown, subs = ['AI']): ReturnType<typeof parseDeadlines> =>
  parseDeadlines(JSON.stringify(data), now, subs)
const wall = (ms: number): string => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

describe('고정 파일', () => {
  test('AI 분야: 90일 안에 다음 마감이 있는 등급 있는 학회만, 마감이 가까운 순서로', () => {
    expect(parseDeadlines(fixture, now, ['AI']).map((i) => i.id)).toEqual([
      'deadline:rss27:2026-12-04',
      'deadline:aamas27:2026-12-11',
      'deadline:icaps27:2026-12-14',
      'deadline:acl27:2027-01-04',
      'deadline:ijcai27:2027-01-11',
      'deadline:icml27:2027-01-22'
    ])
  })

  test('항목 하나의 모든 필드', () => {
    const icml = parseDeadlines(fixture, now, ['AI']).find((i) => i.id.startsWith('deadline:icml'))
    expect(icml).toEqual({
      id: 'deadline:icml27:2027-01-22',
      category: 'conference',
      source: 'CCF Deadlines',
      title: 'ICML 2027: International Conference on Machine Learning',
      url: 'https://icml.cc/Conferences/2027',
      date: NOW,
      deadline: '2027-01-23T11:59:59.000Z',
      summary:
        'Deadline 2027-01-22 (AoE) · Abstract 2027-01-14 · August 2-4, 2027 · Riocentro, Rio de Janeiro, Brazil'
    })
  })

  test('초록 마감이 없으면 그 부분이 없다', () => {
    const rss = parseDeadlines(fixture, now, ['AI']).find((i) => i.id.startsWith('deadline:rss'))
    expect(rss?.summary).toBe('Deadline 2026-12-04 (AoE) · July 6-11, 2027 · Athens, Greece')
  })

  test('같은 판의 두 번째 접수: 지난 마감은 건너뛰고 다음 마감을 쓴다', () => {
    const aamas = parseDeadlines(fixture, now, ['AI']).find((i) => i.id.includes('aamas27'))
    expect(aamas).toMatchObject({
      id: 'deadline:aamas27:2026-12-11',
      deadline: '2026-12-12T11:59:59.000Z'
    })
  })
})

describe('분야 거르기', () => {
  test('subs에 없는 분야는 뺀다', () => {
    expect(parseDeadlines(fixture, now, ['DB'])).toEqual([])
    const icmlDb = { ...conf({ id: 'icml27' }), sub: 'DB' }
    expect(parse([icmlDb], ['AI'])).toEqual([])
    expect(parse([icmlDb], ['DB'])).toHaveLength(1)
  })

  test('등급이 하나도 없는 학회는 뺀다', () => {
    const unranked = { ...conf(), rank: { ccf: 'N', core: 'N', thcpl: 'N' } }
    expect(parse([unranked])).toEqual([])
    expect(parse([{ ...conf(), rank: { ccf: 'N', core: 'B', thcpl: 'N' } }])).toHaveLength(1)
    expect(parse([{ ...conf(), rank: undefined }])).toEqual([])
  })
})

describe('90일 창', () => {
  const edge = (ms: number): ReturnType<typeof parseDeadlines> =>
    parse([conf({ timeline: [{ deadline: wall(ms) }] })])
  const end = now.getTime() + DEADLINE_WINDOW_DAYS * 864e5

  test('창의 끝은 포함하고 1초 뒤는 뺀다', () => {
    expect(edge(end)).toHaveLength(1)
    expect(edge(end + 1000)).toEqual([])
  })
  test('지금과 같은 마감은 지난 것이다', () => {
    expect(edge(now.getTime())).toEqual([])
    expect(edge(now.getTime() + 1000)).toHaveLength(1)
  })
})

describe('시간대', () => {
  const at = (timezone: unknown): ReturnType<typeof parseDeadlines> => parse([conf({ timezone })])
  test.each([
    ['UTC+8', '2027-01-10T04:00:00.000Z'],
    ['UTC-7', '2027-01-10T19:00:00.000Z'],
    ['UTC', '2027-01-10T12:00:00.000Z'],
    ['UTC+0', '2027-01-10T12:00:00.000Z'],
    ['AoE', '2027-01-11T00:00:00.000Z'],
    ['PT', '2027-01-10T20:00:00.000Z'],
    ['Mars', '2027-01-11T00:00:00.000Z']
  ])('%s', (timezone, iso) => {
    const [item] = at(timezone)
    expect(item.deadline).toBe(iso)
    expect(item.summary).toContain(`(${timezone})`)
  })
  test('시간대가 없거나 문자열이 아니면 AoE', () => {
    for (const tz of [undefined, '', 5]) {
      const [item] = at(tz)
      expect(item.deadline).toBe('2027-01-11T00:00:00.000Z')
      expect(item.summary).toContain('(AoE)')
    }
  })
})

describe('모양이 틀린 자료는 던지지 않고 건너뛴다', () => {
  test.each([
    ['마감이 TBD', [conf({ timeline: [{ deadline: 'TBD' }] })]],
    ['timeline이 배열이 아님', [conf({ timeline: 'soon' })]],
    ['confs가 없음', [conf({}, { confs: undefined })]],
    ['id가 없음', [conf({ id: undefined })]],
    ['id가 비었음', [conf({ id: '' })]],
    ['http가 아닌 주소', [conf({ link: 'javascript:alert(1)' })]],
    ['주소가 문자열이 아님', [conf({ link: 7 })]],
    ['year가 숫자가 아님', [conf({ year: '2027' })]],
    ['제목이 비었음', [conf({}, { title: '' })]],
    ['null과 문자열 원소', [null, 'x', 3, conf({ timeline: [] })]],
    ['판이 null', [conf({}, { confs: [null, 'x'] })]]
  ])('%s', (_name, data) => {
    expect(parse(data)).toEqual([])
  })

  test('잘못된 것 옆의 멀쩡한 것은 남는다', () => {
    const items = parse([null, conf({ id: undefined }), conf({ id: 'ok27' })])
    expect(items.map((i) => i.id)).toEqual(['deadline:ok27:2027-01-10'])
  })

  test('한 판의 여러 접수에서 모양이 틀린 것은 건너뛰고 가장 이른 유효한 마감을 쓴다', () => {
    const [item] = parse([
      conf({
        timeline: [
          null,
          { deadline: 'TBD' },
          { deadline: '2027-02-01 00:00:00' },
          { deadline: '2027-01-10 12:00:00' }
        ]
      })
    ])
    expect(item.id).toBe('deadline:tc27:2027-01-10')
  })
})

test.each(['not json', '{"message":"x"}', '<html>'])('%j는 고정 문구로 던진다', (body) => {
  expect(() => parseDeadlines(body, now, ['AI'])).toThrow('학회 마감 목록을 읽지 못했습니다')
})

describe('요약과 제목', () => {
  test('초록 마감이 마감과 같은 날이면 쓰지 않는다', () => {
    const [same] = parse([
      conf({
        timeline: [{ abstract_deadline: '2027-01-10 01:00:00', deadline: '2027-01-10 12:00:00' }]
      })
    ])
    expect(same.summary).toBe('Deadline 2027-01-10 (UTC)')
    const [other] = parse([
      conf({
        timeline: [{ abstract_deadline: '2027-01-03 01:00:00', deadline: '2027-01-10 12:00:00' }]
      })
    ])
    expect(other.summary).toBe('Deadline 2027-01-10 (UTC) · Abstract 2027-01-03')
  })

  test('설명이 없으면 제목은 이름과 연도뿐이다', () => {
    expect(parse([conf({}, { description: undefined })])[0].title).toBe('TC 2027')
  })

  test('제목은 공백을 정리하고 300자에서, 요약도 300자에서 자른다', () => {
    const [item] = parse([
      conf({ place: 'p'.repeat(400) }, { description: `a\n  b ${'x'.repeat(400)}` })
    ])
    expect(item.title).toHaveLength(300)
    expect(item.title.startsWith('TC 2027: a b x')).toBe(true)
    expect(item.summary).toHaveLength(300)
  })
})

test('50건까지, 마감이 가까운 것부터', () => {
  const all = Array.from({ length: 60 }, (_, i) =>
    // 배열은 먼 마감부터 놓아 정렬을 확인한다. i=0이 가장 멀고 지금으로부터 60시간 뒤다.
    conf(
      { id: `c${i}`, timeline: [{ deadline: wall(now.getTime() + (60 - i) * 3_600_000) }] },
      { title: `T${i}` }
    )
  )
  const items = parse(all)
  expect(items).toHaveLength(50)
  expect(items[0].id.startsWith('deadline:c59:')).toBe(true)
  expect(items[49].id.startsWith('deadline:c10:')).toBe(true)
})
