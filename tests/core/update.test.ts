import { expect, test } from 'vitest'
import { newerRelease, RELEASES_PAGE } from '../../src/main/core/update'

const ok = (tag: string, extra = {}): string =>
  JSON.stringify({
    tag_name: tag,
    html_url: RELEASES_PAGE + 'tag/' + tag,
    draft: false,
    prerelease: false,
    ...extra
  })

test('더 새로운 릴리스는 버전과 주소를 돌려준다', () => {
  expect(newerRelease('0.2.3', ok('v0.2.4'))).toEqual({
    version: '0.2.4',
    url: RELEASES_PAGE + 'tag/v0.2.4'
  })
  expect(newerRelease('0.2.3', ok('0.2.4'))?.version).toBe('0.2.4') // v 없는 태그
})

test('같거나 오래된 릴리스는 알리지 않는다', () => {
  expect(newerRelease('0.2.3', ok('v0.2.3'))).toBeNull()
  expect(newerRelease('0.2.3', ok('v0.2.2'))).toBeNull()
})

test('숫자로 비교한다', () => {
  expect(newerRelease('0.9.9', ok('v0.10.0'))?.version).toBe('0.10.0')
  expect(newerRelease('0.10.0', ok('v0.9.9'))).toBeNull()
  expect(newerRelease('1.0.0', ok('v0.99.99'))).toBeNull()
  expect(newerRelease('0.2.9', ok('v1.0.0'))?.version).toBe('1.0.0')
})

test('초안과 시험판은 알리지 않는다', () => {
  expect(newerRelease('0.2.3', ok('v0.2.4', { draft: true }))).toBeNull()
  expect(newerRelease('0.2.3', ok('v0.2.4', { prerelease: true }))).toBeNull()
})

test('릴리스 페이지 밖의 주소는 받지 않는다', () => {
  const bad = (html_url: unknown): string => ok('v9.9.9', { html_url })
  expect(newerRelease('0.2.3', bad('https://example.com/releases/tag/v9.9.9'))).toBeNull()
  expect(newerRelease('0.2.3', bad('javascript:alert(1)'))).toBeNull()
  expect(newerRelease('0.2.3', bad(undefined))).toBeNull()
  expect(newerRelease('0.2.3', bad(5))).toBeNull()
})

test('태그 형식이 맞지 않으면 알리지 않는다', () => {
  for (const tag of ['v0.2', 'v0.2.4-beta', 'latest', 7, undefined])
    expect(newerRelease('0.2.3', ok('v0.2.4', { tag_name: tag }))).toBeNull()
})

test('JSON 객체가 아닌 본문은 알리지 않는다', () => {
  for (const body of ['not json', 'null', '[]', '"x"', '{"message":"Not Found"}'])
    expect(newerRelease('0.2.3', body)).toBeNull()
})

test('현재 버전을 읽을 수 없으면 알리지 않는다', () => {
  expect(newerRelease('dev', ok('v0.2.4'))).toBeNull()
  expect(newerRelease('', ok('v0.2.4'))).toBeNull()
})
