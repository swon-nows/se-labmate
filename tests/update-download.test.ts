import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { UpdateAsset } from '../src/main/core/update'
import { downloadFile, removeOldInstallers } from '../src/main/update-download'
import type { DownloadFetch } from '../src/main/update-download'

// 임시 폴더는 지우지 않고 운영체제에 맡긴다.
const tmp = (): string => mkdtempSync(join(tmpdir(), 'ra-dl-'))
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')
const bytes = new Uint8Array(1000).map((_, i) => i % 251)
const asset = (over: Partial<UpdateAsset> = {}): UpdateAsset => ({
  name: 'se-labmate-0.2.5-x64.exe',
  url: 'https://github.com/swon-nows/se-labmate/releases/download/v0.2.5/se-labmate-0.2.5-x64.exe',
  size: bytes.length,
  sha256: sha(bytes),
  ...over
})
// 본문을 세 토막으로 나눠 보내 진행률이 여러 번 바뀌게 한다.
const serving =
  (body: Uint8Array): DownloadFetch =>
  async () =>
    new Response(
      new ReadableStream({
        start(c) {
          const n = Math.ceil(body.length / 3)
          for (let i = 0; i < body.length; i += n) c.enqueue(body.subarray(i, i + n))
          c.close()
        }
      })
    )
const run = (
  dir: string,
  fetchFn: DownloadFetch,
  a: UpdateAsset = asset()
): { done: Promise<void>; seen: number[]; file: string } => {
  const file = join(dir, a.name)
  const seen: number[] = []
  return { done: downloadFile(fetchFn, a, file, (p) => seen.push(p)), seen, file }
}

test('성공하면 받은 바이트 그대로 파일이 되고 .part는 남지 않는다', async () => {
  const dir = tmp()
  const { done, seen, file } = run(dir, serving(bytes))
  await done
  expect(readFileSync(file)).toEqual(Buffer.from(bytes))
  expect(readdirSync(dir)).toEqual([asset().name])
  expect(seen.at(-1)).toBe(100)
  expect(seen).toEqual([...seen].sort((a, b) => a - b))
  expect(new Set(seen).size).toBe(seen.length) // 값이 바뀔 때만 부른다
})

test('본문이 알린 크기보다 짧으면 거부하고 아무것도 남기지 않는다', async () => {
  const dir = tmp()
  const { done } = run(dir, serving(bytes.subarray(0, 999)))
  await expect(done).rejects.toThrow()
  expect(readdirSync(dir)).toEqual([])
})

test('본문이 알린 크기보다 길면 거부하고 아무것도 남기지 않는다', async () => {
  const dir = tmp()
  const longer = new Uint8Array(1001)
  const { done } = run(dir, serving(longer), asset({ sha256: null }))
  await expect(done).rejects.toThrow()
  expect(readdirSync(dir)).toEqual([])
})

test('sha256이 다르면 거부하고, 없으면(null) 크기만 맞아도 받는다', async () => {
  const bad = tmp()
  await expect(run(bad, serving(bytes), asset({ sha256: 'b'.repeat(64) })).done).rejects.toThrow()
  expect(readdirSync(bad)).toEqual([])

  const ok = tmp()
  await run(ok, serving(bytes), asset({ sha256: null })).done
  expect(readdirSync(ok)).toEqual([asset().name])
})

test('HTTP 오류와 본문 없는 응답은 거부하고 아무것도 남기지 않는다', async () => {
  const dir = tmp()
  await expect(run(dir, async () => new Response('x', { status: 404 })).done).rejects.toThrow()
  const none = { ok: true, status: 200, body: null } as Awaited<ReturnType<DownloadFetch>>
  await expect(run(dir, async () => none).done).rejects.toThrow()
  expect(readdirSync(dir)).toEqual([])
})

test('이미 있는 옛 파일은 성공하면 바뀌고, 실패하면 그대로 남는다', async () => {
  const dir = tmp()
  const file = join(dir, asset().name)
  writeFileSync(file, 'old')
  await expect(run(dir, serving(bytes.subarray(0, 10))).done).rejects.toThrow()
  expect(readFileSync(file, 'utf8')).toBe('old')
  expect(existsSync(file + '.part')).toBe(false)

  await run(dir, serving(bytes)).done
  expect(readFileSync(file)).toEqual(Buffer.from(bytes))
  expect(readdirSync(dir)).toEqual([asset().name])
})

test('요청에 User-Agent와 시간 제한 신호를 싣는다', async () => {
  let seen: { url: string; init: Parameters<DownloadFetch>[1] } | null = null
  const fetchFn: DownloadFetch = async (url, init) => {
    seen = { url, init }
    return serving(bytes)(url, init)
  }
  await run(tmp(), fetchFn).done
  expect(seen!.url).toBe(asset().url)
  expect(seen!.init.headers).toEqual({ 'User-Agent': 'research-assistant' })
  expect(seen!.init.signal).toBeInstanceOf(AbortSignal)
})

test('옛 설치 파일과 그 .part만 지우고 그 밖의 것은 건드리지 않는다', async () => {
  const dir = tmp()
  const gone = [
    'se-labmate-0.2.4-arm64.dmg',
    'se-labmate-0.2.5-x64.exe',
    'se-labmate-0.2.5-x64.exe.part'
  ]
  const kept = ['se-labmate-notes.txt', 'other-0.2.4-arm64.dmg', 'se-labmate-0.2.4-arm64.dmg.bak']
  for (const n of [...gone, ...kept]) writeFileSync(join(dir, n), 'x')
  const folder = join(dir, 'se-labmate-9.9.9-x64.exe') // 이름이 맞아도 폴더는 지우지 않는다
  mkdirSync(folder)
  writeFileSync(join(folder, 'inside.txt'), 'x')

  await removeOldInstallers(dir)

  expect(readdirSync(dir).sort()).toEqual([...kept, 'se-labmate-9.9.9-x64.exe'].sort())
  expect(readdirSync(folder)).toEqual(['inside.txt'])
})

test('폴더가 없어도 거부하지 않는다', async () => {
  await expect(removeOldInstallers(join(tmp(), 'missing'))).resolves.toBeUndefined()
})
