import { CATEGORIES, MAX_KEYWORDS } from '../../shared/types'
import type { Category, Item, UpdateInfo } from '../../shared/types'

const pad = (n: number): string => String(n).padStart(2, '0')
const dayNumber = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5

// 현지 날짜 YYYY-MM-DD. 읽을 수 없으면 빈 글자.
export function isoDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 날짜는 현지 날짜 기준으로 센다.
export function relativeDate(iso: string, now: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const days = dayNumber(now) - dayNumber(d)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days >= 2 && days <= 7) return `${days}d ago`
  return isoDate(iso)
}

export function formatStars(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`
}

export { MAX_KEYWORDS }

export function keywordList(text: string): string[] {
  return text
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k !== '')
}

const sameKeyword = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

export function hasKeyword(text: string, keyword: string): boolean {
  return keywordList(text).some((k) => sameKeyword(k, keyword))
}

// 있으면 빼고 없으면 끝에 더한다. 입력칸의 쉼표·공백 모양은 ', '로 다시 맞춘다.
export function toggleKeyword(text: string, keyword: string): string {
  const list = keywordList(text)
  return (
    hasKeyword(text, keyword) ? list.filter((k) => !sameKeyword(k, keyword)) : [...list, keyword]
  ).join(', ')
}

// 적고 있는 낱말(마지막 쉼표 뒤)을 버리고 keyword를 끝에 더한다. 이미 있는 키워드면 더하지 않는다.
export function replaceToken(text: string, keyword: string): string {
  const cut = text.lastIndexOf(',')
  const done = cut < 0 ? [] : keywordList(text.slice(0, cut))
  return (done.some((k) => sameKeyword(k, keyword)) ? done : [...done, keyword]).join(', ')
}

// 추천 칩을 눌렀을 때의 동작. filtering은 글자를 치는 중이고 적고 있는 낱말이 있다는 뜻이다.
// 적고 있는 낱말은 칩으로 바뀌므로 개수에 넣지 않는다.
export function chipAction(
  value: string,
  keyword: string,
  filtering: boolean
): 'replace' | 'toggle' | 'blocked' {
  if (hasKeyword(value, keyword)) return 'toggle'
  const count = keywordList(value).length
  if (filtering) return count - 1 < MAX_KEYWORDS ? 'replace' : 'blocked'
  return count < MAX_KEYWORDS ? 'toggle' : 'blocked'
}

// 지금 적고 있는 낱말: 마지막 쉼표 뒤의 글.
export function currentToken(text: string): string {
  return text
    .slice(text.lastIndexOf(',') + 1)
    .trim()
    .toLowerCase()
}

// 키워드는 따옴표로 묶은 구절 그대로 찾으므로, 낱말이 다섯 이상이면 거의 아무것도 맞지 않는다.
export function longKeywords(input: string): string[] {
  return keywordList(input).filter((k) => k.split(/\s+/).length >= 5)
}

// 피드의 칩: 켜진 출처가 없어도 목록에 항목이 있는 카테고리는 보여야 한다(게시판을 지운 뒤 남은 새 글 등).
export function feedCategories(active: Category[], present: Category[]): Category[] {
  return CATEGORIES.filter((c) => active.includes(c) || present.includes(c))
}

// 칩 묶음 안에서 화살표·Home·End로 옮길 칩의 번호. 끝에서는 반대쪽 끝으로 돌아간다.
export function rovingIndex(current: number, count: number, key: string): number {
  if (count === 0) return current
  if (key === 'ArrowRight' || key === 'ArrowDown') return (current + 1) % count
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (current - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return current
}

// 논문 줄의 칩: 일치한 내 키워드를 먼저, 이어서 겹치지 않는 논문 키워드. 6개까지.
export function paperChips(
  item: Pick<Item, 'matched' | 'keywords'>
): { text: string; match: boolean }[] {
  const seen = new Set<string>()
  const chips: { text: string; match: boolean }[] = []
  const add = (text: string, match: boolean): void => {
    const key = text.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    chips.push({ text, match })
  }
  item.matched.forEach((k) => add(k, true))
  item.keywords?.forEach((k) => add(k, false))
  return chips.slice(0, 6)
}

const SUB = '₀₁₂₃₄₅₆₇₈₉₊₋'
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻'
const script = (text: string, map: string): string | null => {
  let out = ''
  for (const ch of text) {
    const k = '0123456789+-'.indexOf(ch)
    if (k < 0) return null
    out += map[k]
  }
  return out
}

// 논문 제목·초록에 섞여 오는 LaTeX 수식에서 숫자 첨자($_{12}$, $^{3+}$, $x^2$)를 글자로 바꾸고,
// 명령이 없는 짧은 수식($α$)은 $만 뗀다. 금액처럼 보이는 $(숫자로 시작, 띄어쓰기)는 건드리지 않는다.
// shortcut: 그 밖의 수식(\alpha, T_c 등)은 원문 그대로 둔다. 자주 보이면 수식 표시 라이브러리를 쓴다.
export function plainMath(text: string): string {
  return text.replace(/\$([^$]{1,80})\$/g, (whole, body: string) => {
    const out = body.replace(
      /([_^])(?:\{([^{}]*)\}|(.))/g,
      (m: string, op: string, braced?: string, single?: string) =>
        script(braced ?? single ?? '', op === '_' ? SUB : SUP) ?? m
    )
    if (/[\\_^{}]/.test(out)) return whole
    return out === body && /^\d|\s/.test(body) ? whole : out
  })
}

// 새 버전 알림 줄의 글과 버튼. busy는 눌러도 동작하지 않는 때다.
export function updateBar(u: UpdateInfo): {
  text: string
  button: 'Update' | 'Open page'
  busy: boolean
} {
  if (u.phase === 'failed')
    return {
      text: '내려받지 못했습니다. 릴리스 페이지에서 직접 받아 주십시오.',
      button: 'Open page',
      busy: false
    }
  if (u.phase === 'downloading')
    return {
      text: `새 버전을 내려받는 중입니다${u.percent === null ? '' : ` (${u.percent}%)`}.`,
      button: 'Update',
      busy: true
    }
  return { text: `새 버전이 나왔습니다 (${u.version}).`, button: 'Update', busy: false }
}

export const FIRST_ROWS = 5
export const MORE_STEP = 20

// 카테고리 묶음이 보여 줄 줄 수: 처음 5줄에 More로 더한 만큼(extra), 전체를 넘지 않는다.
export const shownCount = (total: number, extra: number): number =>
  Math.min(total, FIRST_ROWS + extra)

// 들어오는 줄의 지연 순서: 앞 다섯 줄은 제 순서, 더 보인 줄은 한 번에 나온 20줄 안에서 0부터 4까지 되풀이한다.
export const rowOrder = (k: number): number =>
  k < FIRST_ROWS ? k : Math.min(4, (k - FIRST_ROWS) % MORE_STEP)
