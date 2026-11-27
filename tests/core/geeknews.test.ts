import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { parseGeekNews } from '../../src/main/core/sources/geeknews'
import { NOW } from '../helpers'

const fixture = readFileSync('tests/fixtures/geeknews.xml', 'utf8')
const now = new Date(NOW)

const entry = (id: string, href = 'https://news.hada.io/topic?id=1', updated?: string): string =>
  `<entry><title>제목 ${id}</title><link rel='alternate' href='${href}'/><id>${id}</id>${
    updated ? `<updated>${updated}</updated>` : ''
  }</entry>`
const atom = (...entries: string[]): string =>
  `<?xml version='1.0'?><feed xmlns='http://www.w3.org/2005/Atom'>${entries.join('')}</feed>`

describe('고정 파일', () => {
  test('스무 건이 피드 순서대로, 모두 News이고 id는 글 번호다', () => {
    const items = parseGeekNews(fixture, now)
    expect(items).toHaveLength(20)
    expect(items.every((i) => i.category === 'news' && i.source === 'GeekNews')).toBe(true)
    const ids = items.map((i) => i.id)
    expect(new Set(ids).size).toBe(20)
    expect(ids.every((id) => /^geeknews:\d+$/.test(id))).toBe(true)
    const feedOrder = [
      ...fixture.matchAll(/<id>https:\/\/news\.hada\.io\/topic\?id=(\d+)<\/id>/g)
    ].map((m) => `geeknews:${m[1]}`)
    expect(ids).toEqual(feedOrder)
  })

  test('첫 항목의 모든 필드', () => {
    expect(parseGeekNews(fixture, now)[0]).toEqual({
      id: 'geeknews:37934',
      category: 'news',
      source: 'GeekNews',
      title:
        'Show GN: RealView - 머스크가 공개한 테슬라 Reality View 구조를 코드로 구현, 맥북 한 대로 학습',
      url: 'https://news.hada.io/topic?id=37934&utm_source=geeknews&utm_medium=rss&utm_campaign=news',
      date: '2026-11-27T02:49:37.000Z',
      summary: ''
    })
  })
})

describe('인라인 Atom', () => {
  test('<id>에 id= 번호가 없으면 id 전체 글을 쓴다', () => {
    const [item] = parseGeekNews(atom(entry('https://news.hada.io/x/abc', undefined, NOW)), now)
    expect(item.id).toBe('geeknews:https://news.hada.io/x/abc')
  })

  test('&id= 로 붙은 번호도 읽는다', () => {
    const [item] = parseGeekNews(
      atom(entry('https://news.hada.io/topic?a=1&amp;id=42', undefined, NOW)),
      now
    )
    expect(item.id).toBe('geeknews:42')
  })

  test('주소가 http(s)가 아닌 글은 버린다', () => {
    const items = parseGeekNews(
      atom(entry('a?id=1', 'javascript:alert(1)', NOW), entry('b?id=2', undefined, NOW)),
      now
    )
    expect(items.map((i) => i.id)).toEqual(['geeknews:2'])
  })

  test('날짜가 없으면 지금으로 한다', () => {
    const [item] = parseGeekNews(atom(entry('a?id=1')), now)
    expect(item.date).toBe(NOW)
  })

  test('글이 없는 Atom은 빈 목록', () => {
    expect(parseGeekNews(atom(), now)).toEqual([])
  })
})

describe('읽을 수 없는 본문', () => {
  test.each(['<html><body>x</body></html>', 'not xml', '{"a":1}'])('%j → 오류', (body) => {
    expect(() => parseGeekNews(body, now)).toThrow('GeekNews 피드를 읽지 못했습니다')
  })
})
