import { expect, test } from 'vitest'
import {
  DOWNLOAD_BASE,
  findInstaller,
  installerName,
  newerRelease,
  RELEASES_PAGE
} from '../../src/main/core/update'

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
    url: RELEASES_PAGE + 'tag/v0.2.4',
    phase: 'ready',
    percent: null
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

test('설치 파일 이름은 플랫폼과 아키텍처로 정한다', () => {
  expect(installerName('0.2.5', 'darwin', 'arm64')).toBe('se-labmate-0.2.5-arm64.dmg')
  expect(installerName('0.2.5', 'darwin', 'x64')).toBe('se-labmate-0.2.5-x64.dmg')
  expect(installerName('0.2.5', 'win32', 'x64')).toBe('se-labmate-0.2.5-x64.exe')
  expect(installerName('0.2.5', 'win32', 'arm64')).toBe('se-labmate-0.2.5-x64.exe')
  expect(installerName('0.2.5', 'linux', 'x64')).toBeNull()
  expect(installerName('0.2.5', 'darwin', 'ia32')).toBeNull()
})

test('설치 파일 이름은 버전 형식이 맞을 때만 만든다', () => {
  for (const v of ['0.2', '../x', '1.2.3-beta']) expect(installerName(v, 'win32', 'x64')).toBeNull()
})

const SHA = 'a'.repeat(64)
const asset = (name: string, size: number, extra = {}): object => ({
  name,
  browser_download_url: DOWNLOAD_BASE + 'v0.2.5/' + name,
  size,
  digest: 'sha256:' + SHA,
  ...extra
})
const release = (assets: unknown): string => JSON.stringify({ assets })
const ARM = 'se-labmate-0.2.5-arm64.dmg'
const X64 = 'se-labmate-0.2.5-x64.dmg'
const EXE = 'se-labmate-0.2.5-x64.exe'
const three = release([asset(ARM, 100), asset(X64, 200), asset(EXE, 300)])

test('플랫폼에 맞는 설치 파일을 고른다', () => {
  expect(findInstaller(three, '0.2.5', 'darwin', 'arm64')).toEqual({
    name: ARM,
    url: DOWNLOAD_BASE + 'v0.2.5/' + ARM,
    size: 100,
    sha256: SHA
  })
  expect(findInstaller(three, '0.2.5', 'darwin', 'x64')?.name).toBe(X64)
  expect(findInstaller(three, '0.2.5', 'win32', 'x64')).toMatchObject({ name: EXE, size: 300 })
  expect(findInstaller(three, '0.2.5', 'linux', 'x64')).toBeNull()
})

test('앱이 만든 주소와 다른 내려받기 주소는 받지 않는다', () => {
  const url = (browser_download_url: string): string =>
    release([asset(EXE, 300, { browser_download_url })])
  const find = (body: string): unknown => findInstaller(body, '0.2.5', 'win32', 'x64')
  expect(
    find(url('https://example.com/swon-nows/se-labmate/releases/download/v0.2.5/' + EXE))
  ).toBeNull()
  expect(find(url('https://github.com/swon-nows/other/releases/download/v0.2.5/' + EXE))).toBeNull()
  expect(find(url(DOWNLOAD_BASE + 'v0.2.4/' + EXE))).toBeNull()
  expect(find(url(DOWNLOAD_BASE + 'v0.2.5/' + EXE + '?x=1'))).toBeNull()
  expect(find(release([asset(EXE, 300, { browser_download_url: undefined })]))).toBeNull()
})

test('크기가 1 이상 500 000 000 이하의 정수가 아니면 받지 않는다', () => {
  for (const size of [0, -1, 1.5, '300', null, 500_000_001])
    expect(findInstaller(release([asset(EXE, 300, { size })]), '0.2.5', 'win32', 'x64')).toBeNull()
  expect(findInstaller(release([asset(EXE, 1)]), '0.2.5', 'win32', 'x64')?.size).toBe(1)
  expect(findInstaller(release([asset(EXE, 500_000_000)]), '0.2.5', 'win32', 'x64')?.size).toBe(
    500_000_000
  )
})

test('digest를 믿을 수 없으면 sha256만 비운다', () => {
  const digests: unknown[] = [
    undefined,
    'md5:' + SHA,
    'sha256:' + 'A'.repeat(64),
    'sha256:' + 'a'.repeat(63),
    5
  ]
  for (const digest of digests)
    expect(findInstaller(release([asset(EXE, 300, { digest })]), '0.2.5', 'win32', 'x64')).toEqual({
      name: EXE,
      url: DOWNLOAD_BASE + 'v0.2.5/' + EXE,
      size: 300,
      sha256: null
    })
})

test('assets가 없거나 JSON이 아니면 찾지 않는다', () => {
  for (const body of [
    '{}',
    '{"assets":{}}',
    '{"assets":"x"}',
    '{"assets":[null,5]}',
    'not json',
    'null'
  ])
    expect(findInstaller(body, '0.2.5', 'win32', 'x64')).toBeNull()
})
