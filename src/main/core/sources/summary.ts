// OpenAlex의 { 단어: [위치…] } 초록을 위치 순서대로 이어 붙인다.
export function abstractText(inverted: unknown): string {
  if (!inverted || typeof inverted !== 'object' || Array.isArray(inverted)) return ''
  const words: [number, string][] = []
  for (const [w, at] of Object.entries(inverted))
    if (Array.isArray(at)) for (const p of at) if (typeof p === 'number') words.push([p, w])
  return words
    .sort((a, b) => a[0] - b[0])
    .map(([, w]) => w)
    .join(' ')
}

// shortcut: 약어(e.g. 등) 뒤 대문자는 문장 끝으로 오인한다, 오탐이 잦아지면 약어 목록을 둔다.
const SPLIT = /(?<=[.?!])\s+(?=[A-Z0-9"'(\[가-힣])/
const ABOUT_US =
  /\bwe\b|\b(?:this|the present|the current)\s+(?:paper|study|work|article|thesis|dissertation|research|letter|survey|review)\b/i
const MAX = 240

// 초록에서 한 문장을 고른다(AI 없음): 연구 주체를 밝히는 첫 문장, 없으면 첫 문장.
export function keySentence(abstract: string): string {
  const text = abstract
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^Abstract\s*[:.\-—]\s*/i, '')
  if (text === '') return ''
  const sentences = text.split(SPLIT)
  const pick = sentences.find((s) => ABOUT_US.test(s)) ?? sentences[0]
  const chars = [...pick]
  return chars.length > MAX ? chars.slice(0, MAX).join('') + '…' : pick
}
