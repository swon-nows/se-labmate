export const FIRST_READ_DAYS = 30,
  FIRST_READ_MAX = 10,
  KNOWN_MAX = 600

export interface Seen {
  id: string
  url: string
  date: string | null
}

export function diffPosts<T extends Seen>(
  posts: T[],
  known: string[] | undefined,
  now: Date
): { fresh: T[]; known: string[] } {
  const ms = (p: T): number => (p.date === null ? NaN : Date.parse(p.date))
  let fresh: T[]
  if (known === undefined) {
    // 처음 읽을 때 옛 글까지 새 글로 쏟아내지 않는다.
    const since = now.getTime() - FIRST_READ_DAYS * 864e5
    fresh = posts
      .filter((p) => ms(p) >= since)
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
