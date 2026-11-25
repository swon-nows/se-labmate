import type { FetchText } from '../fetch-text'
import { dateOf, finishPosts, parseJson, type Post } from './post'

type Prg = 'ancmIng' | 'ancmPre'

// IRIS는 한 쪽에 10건을 주고 쪽 크기 인자는 무시한다(2026-11-25 확인).
const PAGE_SIZE = 10
const MAX_PAGES = 3

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
// 한국연구재단과 같은 모양으로 쓴다: 2026.11.13 → 2026-11-13
const dashed = (s: string): string => s.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3')

// 응답의 줄마다 글 하나(아직 다듬지 않음). 몇 줄 왔는지로 다음 쪽을 읽을지 정한다.
function irisRows(json: string, prg: Prg): Post[] {
  const list = (parseJson(json) as { listBsnsAncmBtinSitu?: unknown } | null)?.listBsnsAncmBtinSitu
  if (!Array.isArray(list)) throw new Error('IRIS 응답에 목록이 없습니다')
  return list.map((row: unknown) => {
    const r = (row ?? {}) as Record<string, unknown>
    const id = str(r.ancmId)
    const [s, e] = [dashed(str(r.rcveStrDe)), dashed(str(r.rcveEndDe))]
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
}

export function parseIris(json: string, prg: Prg): Post[] {
  return finishPosts(irisRows(json, prg))
}

export async function readIris(fetchText: FetchText): Promise<Post[]> {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }
  const all: Post[] = []
  for (const prg of ['ancmIng', 'ancmPre'] as const) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const rows = irisRows(
        await fetchText(
          'https://www.iris.go.kr/contents/retrieveBsnsAncmBtinSituList.do',
          headers,
          `pageIndex=${page}&ancmPrg=${prg}`
        ),
        prg
      )
      all.push(...rows)
      if (rows.length < PAGE_SIZE) break
    }
  }
  return finishPosts(all)
}
