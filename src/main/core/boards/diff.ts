export const FIRST_READ_DAYS = 30,
  FIRST_READ_MAX = 10,
  KNOWN_MAX = 600

export interface Seen {
  id: string
  url: string
  date: string | null
}

export function diffPosts<T extends Seen>(
  all: T[],
  known: string[] | undefined,
  now: Date
): { fresh: T[]; known: string[] } {
  // known은 글마다 id와 url 둘을 담으므로, 새 글 판별과 기록을 같은 앞쪽 글로만 해야
  // 600개를 넘는 목록이 읽을 때마다 새 글로 되풀이되지 않는다.
  const posts = all.slice(0, KNOWN_MAX / 2)
  const ms = (p: T): number => (p.date === null ? NaN : Date.parse(p.date))
  let fresh: T[]
  // 빈 기록도 처음 읽는 것이다: 빈 목록을 먼저 읽고 저장한 뒤 옛 글이 한꺼번에 새 글로 쏟아지지 않게 한다.
  if (known === undefined || known.length === 0) {
    const since = now.getTime() - FIRST_READ_DAYS * 864e5
    const until = now.getTime() + 864e5 // 마감일이 글 날짜로 읽힌 먼 미래는 최근 글이 아니다
    fresh = posts
      .filter((p) => ms(p) >= since && ms(p) <= until)
      .sort((a, b) => ms(b) - ms(a))
      .slice(0, FIRST_READ_MAX)
  } else {
    const have = new Set(known)
    fresh = posts.filter((p) => !have.has(p.id) && !have.has(p.url))
  }
  const current = posts.flatMap((p) => [p.id, p.url])
  const inList = new Set(current)
  // 이번 목록에 없는 이전 값은 남기고(빈 목록이 와도 잊지 않는다), 이번 글은 뒤에 붙여 잘려 나가지 않게 한다.
  const next = new Set([...(known ?? []).filter((k) => !inList.has(k)), ...current])
  return { fresh, known: [...next].slice(-KNOWN_MAX) }
}
