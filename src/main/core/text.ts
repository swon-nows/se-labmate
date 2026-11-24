export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

export function matchKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase()
  return keywords.filter((k) => lower.includes(k.toLowerCase()))
}

export function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export function cleanKeywords(input: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    // 한 키워드는 60자까지(GitHub 검색 질의는 256자 제한)
    const k = [...raw.replace(/[",|]/g, '').replace(/\s+/g, ' ').trim()]
      .slice(0, 60)
      .join('')
      .trim()
    const key = k.toLowerCase()
    if (k === '' || seen.has(key)) continue
    seen.add(key)
    out.push(k)
  }
  return out.slice(0, 8)
}
