import * as fs from 'node:fs'
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { defaultState, loadState, saveState } from '../src/main/store'
import { mk, st } from './helpers'

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
