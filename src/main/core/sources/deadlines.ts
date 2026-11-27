import type { RawItem } from '../../../shared/types'
import { finish, squash } from './common'

export const DEADLINES_URL = 'https://ccfddl.com/conference/allconf.json'
export const DEADLINE_WINDOW_DAYS = 90
const MAX_ITEMS = 50
const MAX_TEXT = 300

const WALL = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
const UTC = /^UTC(?:([+-])(\d{1,2}))?$/

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
// 글자가 아니거나 공백뿐이면 ''
const str = (v: unknown): string => (typeof v === 'string' ? squash(v) : '')
const cut = (s: string): string => [...s].slice(0, MAX_TEXT).join('')

// 등급이 하나도 없는 학회는 뺀다.
const ranked = (rank: unknown): boolean =>
  isObject(rank) &&
  ['ccf', 'core', 'thcpl'].some((k) => typeof rank[k] === 'string' && rank[k] !== 'N')

// 마감 시각의 시간대 이름 → UTC와의 시 차이. 모르는 이름은 가장 늦은 시각(AoE)으로 본다. 마감이 닫힌 것으로 일찍 보이지 않게 한다.
function offsetHours(tz: string): number {
  // shortcut: 서머타임은 보지 않는다(한 시간 차이), 마감 시각이 분 단위로 중요해지면 IANA 시간대로 바꾼다
  if (tz === 'PT') return -8
  const m = UTC.exec(tz)
  return m ? (m[1] === undefined ? 0 : Number(m[1] + m[2])) : -12
}

// "YYYY-MM-DD hh:mm:ss"를 offset 시간대의 시각으로 읽은 UTC 밀리초. 읽을 수 없으면 NaN.
function instant(wall: unknown, offset: number): number {
  const m = typeof wall === 'string' ? WALL.exec(wall) : null
  if (!m) return NaN
  const [y, mo, d, hh, mm, ss] = m.slice(1).map(Number)
  return Date.UTC(y, mo - 1, d, hh, mm, ss) - offset * 3_600_000
}

// 한 판(edition)에서 지금 이후의 가장 이른 마감을 고른다. 없으면 null.
function nextDeadline(
  timeline: unknown,
  offset: number,
  now: number
): { at: number; entry: Record<string, unknown> } | null {
  let best: { at: number; entry: Record<string, unknown> } | null = null
  if (!Array.isArray(timeline)) return null
  for (const entry of timeline as unknown[]) {
    if (!isObject(entry)) continue
    const at = instant(entry.deadline, offset)
    if (at > now && (best === null || at < best.at)) best = { at, entry }
  }
  return best
}

function readEdition(conf: Record<string, unknown>, edition: unknown, now: Date): RawItem | null {
  if (!isObject(edition)) return null
  const { id, year, link } = edition
  const name = str(conf.title)
  if (typeof id !== 'string' || id === '' || typeof year !== 'number' || name === '') return null
  const tz = str(edition.timezone) || 'AoE'
  const next = nextDeadline(edition.timeline, offsetHours(tz), now.getTime())
  if (next === null || next.at > now.getTime() + DEADLINE_WINDOW_DAYS * 864e5) return null

  const day = (next.entry.deadline as string).slice(0, 10) // 쓴 그대로(시간대를 바꾸지 않은) 날짜
  const abstract = next.entry.abstract_deadline
  const abstractDay =
    typeof abstract === 'string' && WALL.test(abstract) ? abstract.slice(0, 10) : ''
  const description = str(conf.description)
  return finish({
    id: `deadline:${id}:${day}`, // 날짜가 id에 있어 다음 접수나 옮겨진 마감은 새 항목이다
    category: 'conference',
    source: 'CCF Deadlines',
    title: cut(squash(`${name} ${year}${description ? ': ' + description : ''}`)),
    url: typeof link === 'string' ? link : '',
    date: now.toISOString(),
    deadline: new Date(next.at).toISOString(),
    summary: cut(
      [
        `Deadline ${day} (${tz})`,
        abstractDay !== '' && abstractDay !== day ? `Abstract ${abstractDay}` : '',
        str(edition.date),
        str(edition.place)
      ]
        .filter(Boolean)
        .join(' · ')
    )
  })
}

// ccfddl.com의 공개 목록에서 subs 분야의 학회 가운데 다음 논문 마감이 90일 안인 것을 항목으로 만든다.
export function parseDeadlines(json: string, now: Date, subs: string[]): RawItem[] {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    data = null
  }
  if (!Array.isArray(data)) throw new Error('학회 마감 목록을 읽지 못했습니다')
  const items: RawItem[] = []
  for (const conf of data as unknown[]) {
    if (!isObject(conf) || typeof conf.sub !== 'string' || !subs.includes(conf.sub)) continue
    if (!ranked(conf.rank) || !Array.isArray(conf.confs)) continue
    for (const edition of conf.confs as unknown[]) {
      const item = readEdition(conf, edition, now)
      if (item) items.push(item)
    }
  }
  return items
    .sort(
      (a, b) =>
        Date.parse(a.deadline as string) - Date.parse(b.deadline as string) ||
        a.title.localeCompare(b.title)
    )
    .slice(0, MAX_ITEMS)
}
