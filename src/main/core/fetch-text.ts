type FetchFn = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
) => Promise<Pick<Response, 'ok' | 'status' | 'text'>>

// 오류 메시지는 state.json과 화면에 남는다. 원래 메시지에는 키가 든 URL이 섞일 수 있어 고정 문구로 바꾼다.
const failed = (e: unknown): never => {
  const timeout = (e as { name?: unknown } | null)?.name === 'TimeoutError'
  throw new Error(timeout ? '요청 시간 초과' : '네트워크 오류')
}

export function createFetchText(
  fetchFn: FetchFn
): (url: string, headers?: Record<string, string>) => Promise<string> {
  return async (url, headers) => {
    const init = {
      headers: { 'User-Agent': 'research-assistant', ...headers },
      signal: AbortSignal.timeout(20_000)
    }
    const res = await fetchFn(url, init).catch(failed)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.text().catch(failed)
  }
}
