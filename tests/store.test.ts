import * as fs from 'node:fs'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { defaultState, loadState, saveState } from '../src/main/store'
import { mk, NOW, st } from './helpers'

// renameSync만 바꿔 끼울 수 있게 한다. 기본은 진짜 함수를 그대로 부른다.
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  return { ...real, renameSync: vi.fn(real.renameSync) }
})
const rename = vi.mocked(fs.renameSync)
const platform = process.platform
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  rename.mockReset() // vi.fn(real.renameSync)의 진짜 함수로 돌아간다
})
const busy = (): never => {
  throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' })
}

// 임시 폴더는 지우지 않고 운영체제에 맡긴다.
const tmp = (): string => mkdtempSync(join(tmpdir(), 'ra-'))
const corruptFiles = (dir: string): string[] =>
  readdirSync(dir).filter((n) => n.startsWith('state.corrupt-'))

test('없으면 기본 상태', () => {
  const dir = tmp()
  expect(loadState(join(dir, 'state.json'))).toEqual(defaultState())
})

test('기본 상태의 저장소 개수는 10', () => {
  expect(defaultState().settings.repoCount).toBe(10)
})

// repoCount가 없거나 틀린 v2 파일(옛 버전이 쓴 파일, 손으로 고친 파일)도 늘 올바른 값으로 읽힌다.
test.each([
  ['없으면', undefined, 10],
  ['5면 그대로', 5, 5],
  ['1이면 그대로', 1, 1],
  ['25면 그대로', 25, 25],
  ['99는', 99, 10],
  ['0은', 0, 10],
  ['2.5는', 2.5, 10],
  ['문자열 "7"은', '7', 10]
])('v2 파일의 repoCount가 %s', (_, stored, expected) => {
  const f = join(tmp(), 'state.v2.json')
  const s = defaultState()
  writeFileSync(f, JSON.stringify({ ...s, settings: { ...s.settings, repoCount: stored } }))
  expect(loadState(f).settings.repoCount).toBe(expected)
})

test('기본 상태에서는 고른 학회 분야가 없다', () => {
  expect(defaultState().settings.conferenceFields).toEqual([])
})

// conferenceFields가 없거나 틀린 v2 파일(옛 버전이 쓴 파일, 손으로 고친 파일)도 늘 올바른 값으로 읽힌다.
test.each([
  ['없으면', undefined, []],
  ['["ai"]면 그대로', ['ai'], ['ai']],
  ['두 분야면 그대로', ['ai', 'structural'], ['ai', 'structural']],
  ['["x"]는', ['x'], []],
  ['["ai", "x"]는', ['ai', 'x'], []],
  ['문자열 "ai"는', 'ai', []],
  ['null은', null, []]
])('v2 파일의 conferenceFields가 %s', (_, stored, expected) => {
  const f = join(tmp(), 'state.v2.json')
  const s = defaultState()
  writeFileSync(f, JSON.stringify({ ...s, settings: { ...s.settings, conferenceFields: stored } }))
  expect(loadState(f).settings.conferenceFields).toEqual(expected)
})

test('repoCount와 conferenceFields가 둘 다 틀려도 둘 다 고쳐 읽는다', () => {
  const f = join(tmp(), 'state.v2.json')
  const s = defaultState()
  writeFileSync(
    f,
    JSON.stringify({ ...s, settings: { ...s.settings, repoCount: 99, conferenceFields: ['x'] } })
  )
  expect(loadState(f).settings).toMatchObject({ repoCount: 10, conferenceFields: [] })
})

test('저장하고 다시 읽기', () => {
  const f = join(tmp(), 'state.json')
  const s = st({
    profile: { keywordsEn: ['graph neural network'], keywordsKo: ['인공지능'], country: 'KR' },
    items: { 'paper:x': mk({ id: 'paper:x' }) }
  })
  saveState(f, s)
  expect(loadState(f)).toEqual(s)
  expect(existsSync(f + '.tmp')).toBe(false)
})

test('깨진 파일은 남겨 두고 기본 상태로 시작', () => {
  const dir = tmp()
  const f = join(dir, 'state.json')
  writeFileSync(f, '{"version":1,"items":{')
  const onCorrupt = vi.fn<(backupPath: string) => void>()
  expect(loadState(f, onCorrupt)).toEqual(defaultState())
  expect(corruptFiles(dir)).toHaveLength(1)
  expect(onCorrupt).toHaveBeenCalledTimes(1)
  expect(onCorrupt).toHaveBeenCalledWith(join(dir, corruptFiles(dir)[0]))
})

test('읽히지만 모양이 틀린 파일도 깨진 것으로 본다', () => {
  const dir = tmp()
  const f = join(dir, 'state.json')
  writeFileSync(f, '{"version":2}')
  const onCorrupt = vi.fn<(backupPath: string) => void>()
  expect(loadState(f, onCorrupt)).toEqual(defaultState())
  expect(corruptFiles(dir)).toHaveLength(1)
  expect(existsSync(f)).toBe(false)
  expect(onCorrupt).toHaveBeenCalledTimes(1)
  expect(onCorrupt).toHaveBeenCalledWith(join(dir, corruptFiles(dir)[0]))
})

test('없는 폴더에도 저장한다', () => {
  const f = join(tmp(), 'new', 'dir', 'state.json')
  const s = st({ items: { 'paper:x': mk({ id: 'paper:x' }) } })
  saveState(f, s)
  expect(loadState(f)).toEqual(s)
})

test('멀쩡하거나 없는 파일이면 onCorrupt를 부르지 않는다', () => {
  const f = join(tmp(), 'state.json')
  const onCorrupt = vi.fn()
  loadState(f, onCorrupt)
  saveState(f, st())
  loadState(f, onCorrupt)
  expect(onCorrupt).not.toHaveBeenCalled()
})

test('Windows에서는 이름 바꾸기가 잠시 막혀도 50ms 간격으로 다시 해 본다', () => {
  Object.defineProperty(process, 'platform', { value: 'win32' })
  const f = join(tmp(), 'state.json')
  rename.mockImplementationOnce(busy).mockImplementationOnce(busy)
  const started = Date.now()
  saveState(f, st())
  expect(rename).toHaveBeenCalledTimes(3)
  expect(Date.now() - started).toBeGreaterThanOrEqual(90)
  expect(loadState(f)).toEqual(st())
})

test('Windows에서 계속 막히면 다섯 번 다시 해 본 뒤 던지고, 다른 운영체제는 바로 던진다', () => {
  const f = join(tmp(), 'state.json')
  rename.mockImplementation(busy)
  Object.defineProperty(process, 'platform', { value: 'win32' })
  expect(() => saveState(f, st())).toThrow('EBUSY')
  expect(rename).toHaveBeenCalledTimes(6)
  rename.mockClear()
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  expect(() => saveState(f, st())).toThrow('EBUSY')
  expect(rename).toHaveBeenCalledTimes(1)
})

test('바꿔 끼운 renameSync는 다음 시험에서 진짜로 돌아온다', () => {
  const f = join(tmp(), 'state.json')
  saveState(f, st())
  expect(existsSync(f)).toBe(true)
})

const v1State = (): Record<string, unknown> => {
  const v1: Record<string, unknown> = {
    ...defaultState(),
    version: 1,
    // 옛 파일에는 repoCount와 conferenceFields가 없다
    settings: { ...defaultState().settings, repoCount: undefined, conferenceFields: undefined },
    profile: { keywordsEn: ['xai'], keywordsKo: [], country: 'KR' },
    openAlexKeyEnc: 'ZW5j',
    lastDailyRunAt: NOW,
    items: {
      'paper:a': mk({
        id: 'paper:a',
        source: 'OpenAlex',
        summary: 'Automation in Construction',
        seenAt: NOW,
        saved: true
      }),
      'paper:b': mk({ id: 'paper:b', source: 'arXiv', summary: 'abstract…' })
    }
  }
  delete v1.boards
  delete v1.boardKnown
  return v1
}

// 옛 앱이 같은 폴더의 state.json을 계속 쓰므로 새 앱은 그 파일을 한 바이트도 바꾸지 않아야 한다.
const legacySetup = (legacy: string): { dir: string; f: string; old: string; bytes: Buffer } => {
  const dir = tmp()
  const old = join(dir, 'state.json')
  writeFileSync(old, legacy)
  return { dir, f: join(dir, 'state.v2.json'), old, bytes: readFileSync(old) }
}

test('v2 파일이 없으면 옛 v1 파일을 메모리에서만 v2로 옮기고 옛 파일은 그대로 둔다', () => {
  const { dir, f, old, bytes } = legacySetup(JSON.stringify(v1State()))
  const s = loadState(f, undefined, old)
  expect(s).toMatchObject({
    version: 2,
    boards: [],
    boardKnown: {},
    openAlexKeyEnc: 'ZW5j',
    lastDailyRunAt: NOW,
    profile: { keywordsEn: ['xai'] }
  })
  expect(s.items['paper:a']).toMatchObject({
    venue: 'Automation in Construction',
    summary: '',
    seenAt: NOW,
    saved: true
  })
  expect(s.items['paper:b']).toMatchObject({ summary: 'abstract…' })
  expect(s.settings.repoCount).toBe(10)
  expect(s.settings.conferenceFields).toEqual([])
  expect(s.items['paper:b'].venue).toBeUndefined()
  expect(readFileSync(old).equals(bytes)).toBe(true)
  expect(readdirSync(dir).sort()).toEqual(['state.json'])
})

test('저장은 state.v2.json에만 하고 옛 파일은 그대로 남는다', () => {
  const { dir, f, old, bytes } = legacySetup(JSON.stringify(v1State()))
  saveState(f, loadState(f, undefined, old))
  expect(readdirSync(dir).sort()).toEqual(['state.json', 'state.v2.json'])
  expect(readFileSync(old).equals(bytes)).toBe(true)
  expect(loadState(f).profile).toMatchObject({ keywordsEn: ['xai'] })
})

test('v2 파일이 있으면 옛 파일은 더 새롭거나 달라도 읽지 않는다', () => {
  const { f, old, bytes } = legacySetup(
    JSON.stringify({
      ...v1State(),
      profile: { keywordsEn: ['old'], keywordsKo: [], country: 'KR' }
    })
  )
  const s = st({ profile: { keywordsEn: ['new'], keywordsKo: [], country: 'KR' } })
  saveState(f, s)
  fs.utimesSync(old, new Date(Date.now() + 60_000), new Date(Date.now() + 60_000))
  expect(loadState(f, undefined, old)).toEqual(s)
  expect(readFileSync(old).equals(bytes)).toBe(true)
})

test.each([
  ['깨진 옛 파일', '{"version":1,"items":{'],
  ['모르는 version의 옛 파일', JSON.stringify({ ...v1State(), version: 3 })],
  ['모양이 틀린 v1 파일', '{"version":1}']
])('%s은 무시하고 기본 상태로 시작하며 옛 파일은 그대로 둔다', (_, legacy) => {
  const { dir, f, old, bytes } = legacySetup(legacy)
  const onCorrupt = vi.fn()
  expect(loadState(f, onCorrupt, old)).toEqual(defaultState())
  expect(onCorrupt).not.toHaveBeenCalled()
  expect(readFileSync(old).equals(bytes)).toBe(true)
  expect(readdirSync(dir)).toEqual(['state.json'])
})

test('깨진 v2 파일은 옮겨 두고 onCorrupt를 부르며 옛 파일은 보지 않는다', () => {
  const { dir, f, old, bytes } = legacySetup(JSON.stringify(v1State()))
  writeFileSync(f, '{"version":2,"items":{')
  const onCorrupt = vi.fn<(backupPath: string) => void>()
  expect(loadState(f, onCorrupt, old)).toEqual(defaultState())
  expect(corruptFiles(dir)).toHaveLength(1)
  expect(existsSync(f)).toBe(false)
  expect(onCorrupt).toHaveBeenCalledWith(join(dir, corruptFiles(dir)[0]))
  expect(readFileSync(old).equals(bytes)).toBe(true)
})

test('v2 파일에 든 v1 내용은 깨진 파일로 다룬다', () => {
  const dir = tmp()
  const f = join(dir, 'state.v2.json')
  writeFileSync(f, JSON.stringify(v1State()))
  expect(loadState(f)).toEqual(defaultState())
  expect(corruptFiles(dir)).toHaveLength(1)
})

test('모르는 version은 깨진 파일로 다룬다', () => {
  const dir = tmp()
  const f = join(dir, 'state.json')
  writeFileSync(f, JSON.stringify({ ...v1State(), version: 3, boards: [], boardKnown: {} }))
  expect(loadState(f)).toEqual(defaultState())
  expect(corruptFiles(dir)).toHaveLength(1)
})
