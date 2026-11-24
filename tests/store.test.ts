import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { defaultState, loadState, saveState } from '../src/main/store'
import { mk, st } from './helpers'

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
  expect(loadState(f)).toEqual(defaultState())
  expect(readdirSync(dir).some((n) => n.startsWith('state.corrupt-'))).toBe(true)
})

test('읽히지만 모양이 틀린 파일도 깨진 것으로 본다', () => {
  const dir = tmp()
  const f = join(dir, 'state.json')
  writeFileSync(f, '{"version":2}')
  expect(loadState(f)).toEqual(defaultState())
  expect(corruptFiles(dir)).toHaveLength(1)
  expect(existsSync(f)).toBe(false)
})

test('없는 폴더에도 저장한다', () => {
  const f = join(tmp(), 'new', 'dir', 'state.json')
  const s = st({ items: { 'paper:x': mk({ id: 'paper:x' }) } })
  saveState(f, s)
  expect(loadState(f)).toEqual(s)
})
