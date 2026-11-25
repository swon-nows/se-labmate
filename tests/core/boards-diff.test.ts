import { expect, test } from 'vitest'
import { diffPosts } from '../../src/main/core/boards/diff'

const now = new Date('2026-11-25T03:00:00Z')
const s = (id: string, date: string | null): { id: string; url: string; date: string | null } => ({
  id,
  url: 'https://a.b/' + id,
  date
})

test('처음 읽을 때는 최근 30일의 글을 최신순으로 10건까지', () => {
  const posts = [
    s('old', '2026-07-01T00:00:00.000Z'),
    s('undated', null),
    ...Array.from({ length: 12 }, (_, i) =>
      s('n' + i, `2026-11-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`)
    )
  ]
  const { fresh, known } = diffPosts(posts, undefined, now)
  expect(fresh.map((p) => p.id)).toEqual([
    'n11',
    'n10',
    'n9',
    'n8',
    'n7',
    'n6',
    'n5',
    'n4',
    'n3',
    'n2'
  ])
  expect(known).toContain('old')
  expect(known).toContain('https://a.b/undated')
  expect(known).toHaveLength(28)
})

test('그다음부터는 처음 보는 글만', () => {
  const first = diffPosts([s('a', null), s('b', null)], undefined, now)
  expect(first.fresh).toEqual([])
  expect(diffPosts([s('c', null), s('a', null)], first.known, now).fresh.map((p) => p.id)).toEqual([
    'c'
  ])
})

test('주소가 같으면 제목(id)이 바뀌어도 새 글이 아니다. id가 같으면 주소가 바뀌어도 새 글이 아니다', () => {
  const k = diffPosts([s('a', null)], undefined, now).known
  expect(diffPosts([{ id: 'a2', url: 'https://a.b/a', date: null }], k, now).fresh).toEqual([])
  expect(diffPosts([{ id: 'a', url: 'https://a.b/other', date: null }], k, now).fresh).toEqual([])
})

test('한 번 빈 목록이 와도 본 글을 잊지 않는다', () => {
  const k1 = diffPosts([s('a', null), s('b', null)], undefined, now).known
  const k2 = diffPosts([], k1, now).known
  expect(diffPosts([s('a', null), s('b', null)], k2, now).fresh).toEqual([])
})

test('known은 600개까지, 이번 목록에 있는 것이 뒤에 남는다', () => {
  const old = Array.from({ length: 600 }, (_, i) => 'x' + i)
  const { known } = diffPosts([s('pinned', null)], ['pinned', ...old], now)
  expect(known).toHaveLength(600)
  expect(known.slice(-2)).toEqual(['pinned', 'https://a.b/pinned'])
  expect(known).not.toContain('x0')
})
