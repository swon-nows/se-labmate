import type { UpdateInfo } from '../../shared/types'

export const RELEASES_API = 'https://api.github.com/repos/swon-nows/se-labmate/releases/latest'
export const RELEASES_PAGE = 'https://github.com/swon-nows/se-labmate/releases/'
export const DOWNLOAD_BASE = 'https://github.com/swon-nows/se-labmate/releases/download/'

const TAG = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/
const VERSION = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/

const numbers = (m: RegExpExecArray): number[] => [Number(m[1]), Number(m[2]), Number(m[3])]

// 응답은 바깥에서 온 값이다. 어떤 본문이 와도 던지지 않고, 믿을 수 있는 새 릴리스일 때만 돌려준다.
export function newerRelease(current: string, body: string): UpdateInfo | null {
  let r: unknown
  try {
    r = JSON.parse(body)
  } catch {
    return null
  }
  if (typeof r !== 'object' || r === null || Array.isArray(r)) return null
  const { tag_name, html_url, draft, prerelease } = r as Record<string, unknown>
  if (typeof tag_name !== 'string' || typeof html_url !== 'string') return null
  if (!html_url.startsWith(RELEASES_PAGE) || draft === true || prerelease === true) return null
  const tag = TAG.exec(tag_name)
  const cur = VERSION.exec(current)
  if (!tag || !cur) return null
  const [a, b] = [numbers(tag), numbers(cur)]
  const i = a.findIndex((n, k) => n !== b[k])
  if (i < 0 || a[i] < b[i]) return null
  return { version: a.join('.'), url: html_url, phase: 'ready', percent: null }
}

export interface UpdateAsset {
  name: string
  url: string
  size: number
  sha256: string | null
}

// electron-builder.yml의 artifactName과 같은 이름이다. Windows는 x64 설치 파일 하나뿐이다.
export function installerName(version: string, platform: string, arch: string): string | null {
  if (!VERSION.test(version)) return null
  if (platform === 'win32') return `se-labmate-${version}-x64.exe`
  if (platform === 'darwin' && (arch === 'arm64' || arch === 'x64'))
    return `se-labmate-${version}-${arch}.dmg`
  return null
}

const MAX_INSTALLER = 500_000_000
const DIGEST = /^sha256:([0-9a-f]{64})$/

// 내려받을 주소는 응답에서 읽지 않고 앱이 만든 주소와 같을 때만 받는다. 던지지 않는다.
export function findInstaller(
  body: string,
  version: string,
  platform: string,
  arch: string
): UpdateAsset | null {
  const name = installerName(version, platform, arch)
  if (name === null) return null
  let r: unknown
  try {
    r = JSON.parse(body)
  } catch {
    return null
  }
  if (typeof r !== 'object' || r === null) return null
  const { assets } = r as { assets?: unknown }
  if (!Array.isArray(assets)) return null
  for (const a of assets) {
    if (typeof a !== 'object' || a === null) continue
    const { name: n, browser_download_url: url, size, digest } = a as Record<string, unknown>
    if (n !== name) continue
    if (url !== `${DOWNLOAD_BASE}v${version}/${name}`) return null
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > MAX_INSTALLER)
      return null
    const sha256 = (typeof digest === 'string' && DIGEST.exec(digest)?.[1]) || null
    return { name, url, size, sha256 }
  }
  return null
}
