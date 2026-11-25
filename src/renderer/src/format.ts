const pad = (n: number): string => String(n).padStart(2, '0')
const dayNumber = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5

// 날짜는 현지 날짜 기준으로 센다.
export function relativeDate(iso: string, now: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const days = dayNumber(now) - dayNumber(d)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days >= 2 && days <= 7) return `${days}d ago`
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatStars(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`
}

// 저장되는 키워드는 8개까지다(main의 cleanKeywords와 같은 값).
export const MAX_KEYWORDS = 8

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
