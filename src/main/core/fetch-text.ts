export type FetchText = (
  url: string,
  headers?: Record<string, string>,
  body?: string
) => Promise<string>

export type FetchFn = (
  url: string,
  init: { method?: 'POST'; body?: string; headers: Record<string, string>; signal: AbortSignal }
) => Promise<Pick<Response, 'ok' | 'status' | 'headers' | 'arrayBuffer'>>

const MAX_BYTES = 8 * 1024 * 1024

// 오류 메시지는 저장 파일과 화면에 남는다. 원래 메시지에는 키가 든 URL이 섞일 수 있어 고정 문구로 바꾼다.
const failed = (e: unknown): never => {
  const timeout = (e as { name?: unknown } | null)?.name === 'TimeoutError'
  throw new Error(timeout ? '요청 시간 초과' : '네트워크 오류')
}

// 한국 학교·기관 게시판에는 EUC-KR 페이지가 있다. 헤더 → 앞 2048바이트의 meta → utf-8 순으로 문자 집합을 고른다.
function decode(bytes: Uint8Array, contentType: string | null): string {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048))
  const charset =
    /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType ?? '')?.[1] ??
    /<meta[^>]{0,300}?charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1] ??
    'utf-8'
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes) // 모르는 이름
  }
}

export function createFetchText(fetchFn: FetchFn): FetchText {
  return async (url, headers, body) => {
    const init = {
      ...(body !== undefined && { method: 'POST' as const, body }),
      headers: { 'User-Agent': 'research-assistant', ...headers },
      signal: AbortSignal.timeout(20_000)
    }
    const res = await fetchFn(url, init).catch(failed)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    // 크다고 미리 밝힌 응답은 내려받지 않는다. 헤더가 없거나 틀릴 수 있어 받은 뒤에도 다시 잰다.
    if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('응답이 너무 큽니다')
    const buf = await res.arrayBuffer().catch(failed)
    if (buf.byteLength > MAX_BYTES) throw new Error('응답이 너무 큽니다')
    return decode(new Uint8Array(buf), res.headers.get('content-type'))
  }
}
