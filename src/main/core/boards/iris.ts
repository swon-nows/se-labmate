import type { FetchText } from '../fetch-text'
import { dateOf, finishPosts, parseJson, type Post } from './post'

type Prg = 'ancmIng' | 'ancmPre'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export function parseIris(json: string, prg: Prg): Post[] {
  const list = (parseJson(json) as { listBsnsAncmBtinSitu?: unknown } | null)?.listBsnsAncmBtinSitu
  if (!Array.isArray(list)) throw new Error('IRIS 응답에 목록이 없습니다')
  return finishPosts(
    list.map((row: unknown) => {
      const r = (row ?? {}) as Record<string, unknown>
      const id = str(r.ancmId)
      const [s, e] = [str(r.rcveStrDe), str(r.rcveEndDe)]
      const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(r.ancmDe))
      const range = [s, e].filter(Boolean).join(' ~ ')
      return {
        key: id,
        title: str(r.ancmTl),
        url: `https://www.iris.go.kr/contents/retrieveBsnsAncmView.do?ancmId=${encodeURIComponent(id)}&ancmPrg=${prg}`,
        date: d ? dateOf(d[1], d[2], d[3]) : null,
        summary: [str(r.sorgnNm), range && `접수 ${range}`].filter(Boolean).join(' · ')
      }
    })
  )
}

export async function readIris(fetchText: FetchText): Promise<Post[]> {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }
  const all: Post[] = []
  for (const prg of ['ancmIng', 'ancmPre'] as const) {
    const json = await fetchText(
      'https://www.iris.go.kr/contents/retrieveBsnsAncmBtinSituList.do',
      headers,
      `pageIndex=1&ancmPrg=${prg}`
    )
    all.push(...parseIris(json, prg))
  }
  return finishPosts(all)
}
