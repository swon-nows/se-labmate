import { createHash } from 'node:crypto'
import { open, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { UpdateAsset } from './core/update'

export type DownloadFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
) => Promise<Pick<Response, 'ok' | 'status' | 'body'>>

// .part에 받아 크기와 해시를 확인한 뒤에만 file로 바꾼다. 실패하면 .part를 지우고, 있던 file은 건드리지 않는다.
export async function downloadFile(
  fetchFn: DownloadFetch,
  asset: UpdateAsset,
  file: string,
  onProgress: (percent: number) => void
): Promise<void> {
  const part = file + '.part'
  try {
    const res = await fetchFn(asset.url, {
      headers: { 'User-Agent': 'research-assistant' },
      signal: AbortSignal.timeout(30 * 60 * 1000)
    })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
    const reader = res.body.getReader()
    const hash = createHash('sha256')
    const out = await open(part, 'w')
    let bytes = 0
    let last = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        // 알린 크기를 넘으면 더 받지 않는다.
        if (bytes > asset.size) throw new Error('받은 파일이 알려진 크기보다 큽니다')
        hash.update(value)
        await out.writeFile(value)
        const percent = Math.floor((bytes / asset.size) * 100)
        if (percent !== last) onProgress((last = percent))
      }
    } finally {
      await reader.cancel().catch(() => undefined)
      await out.close() // Windows는 열린 파일의 이름을 바꾸거나 지우지 못한다
    }
    if (bytes !== asset.size) throw new Error('받은 파일이 알려진 크기보다 작습니다')
    if (asset.sha256 !== null && hash.digest('hex') !== asset.sha256)
      throw new Error('받은 파일의 해시가 맞지 않습니다')
    await rename(part, file)
  } catch (e) {
    await rm(part, { force: true })
    throw e
  }
}

const OLD_INSTALLER = /^se-labmate-\d+\.\d+\.\d+-(arm64|x64)\.(dmg|exe)(\.part)?$/

// 지난 업데이트에서 받은 설치 파일을 지운다. 거부하지 않는다: 쓰는 중이거나 이미 없는 파일, 없는 폴더는 건너뛴다.
export async function removeOldInstallers(dir: string): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    await Promise.all(
      entries
        .filter((e) => e.isFile() && OLD_INSTALLER.test(e.name))
        .map((e) => rm(join(dir, e.name)).catch(() => undefined))
    )
  } catch {
    // 폴더를 읽지 못하면 지울 것이 없다.
  }
}
