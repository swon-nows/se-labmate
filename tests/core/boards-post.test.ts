import { expect, test } from 'vitest'
import { dateOf, finishPosts, htmlText, type Post } from '../../src/main/core/boards/post'

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
})

test('dateOf는 UTC 자정 ISO, 범위 밖이면 null', () => {
  expect(dateOf('2026', '11', '2')).toBe('2026-11-02T00:00:00.000Z')
  expect(dateOf('2026', '13', '1')).toBeNull()
  expect(dateOf('2026', '0', '1')).toBeNull()
  expect(dateOf('2026', '1', '32')).toBeNull()
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
