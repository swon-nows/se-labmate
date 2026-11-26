import type { UpdateInfo } from '../../shared/types'

export const RELEASES_API =
  'https://api.github.com/repos/swon-nows/research-assistant/releases/latest'
export const RELEASES_PAGE = 'https://github.com/swon-nows/research-assistant/releases/'

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
  return { version: a.join('.'), url: html_url }
}
