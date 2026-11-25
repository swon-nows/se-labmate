import { describe, expect, test, vi } from 'vitest'
import { createFetchText, type FetchFn } from '../../src/main/core/fetch-text'

const reply = (body: string, status = 200): Promise<Response> =>
  Promise.resolve(new Response(body, { status }))
const URL_WITH_KEY = 'https://api.openalex.org/works?filter=x&api_key=SECRET'

async function errorOf(p: Promise<unknown>): Promise<Error> {
  return p.then(
    () => {
      throw new Error('expected a rejection')
    },
    (e: Error) => e
  )
}

describe('createFetchText', () => {
  test('200이면 본문 글자를 돌려준다', async () => {
    await expect(createFetchText(() => reply('hello'))('https://x')).resolves.toBe('hello')
  })

  test('2xx가 아니면 HTTP <코드>', async () => {
    const e = await errorOf(createFetchText(() => reply('nope', 404))(URL_WITH_KEY))
    expect(e.message).toBe('HTTP 404')
  })

  test('요청 실패 메시지에 URL과 키가 들어가지 않는다', async () => {
    const leaky = (): Promise<Response> =>
      Promise.reject(new TypeError(`fetch failed ${URL_WITH_KEY}`))
    const e = await errorOf(createFetchText(leaky)(URL_WITH_KEY))
    expect(e.message).toBe('네트워크 오류')
    expect(String(e)).not.toContain('SECRET')
    expect(String(e)).not.toContain(URL_WITH_KEY)
    expect(e.cause).toBeUndefined()
  })

  test('본문 읽기 실패도 고정 문구', async () => {
    const res = {
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: () => Promise.reject(new Error(URL_WITH_KEY))
    }
    const e = await errorOf(createFetchText(() => Promise.resolve(res))(URL_WITH_KEY))
    expect(e.message).toBe('네트워크 오류')
  })

  test('시간 초과는 요청 시간 초과', async () => {
    const slow = (): Promise<Response> =>
      Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
    const e = await errorOf(createFetchText(slow)(URL_WITH_KEY))
    expect(e.message).toBe('요청 시간 초과')
  })

  test('User-Agent를 늘 보내고, 호출한 쪽 헤더를 더하며, 시간 제한 신호를 단다', async () => {
    const fetchFn = vi.fn<FetchFn>(() => reply('x'))
    const fetchText = createFetchText(fetchFn)
    await fetchText('https://a')
    await fetchText('https://b', { Accept: 'application/vnd.github+json' })
    expect(fetchFn.mock.calls[0][1].headers).toEqual({ 'User-Agent': 'research-assistant' })
    expect(fetchFn.mock.calls[1][1].headers).toEqual({
      'User-Agent': 'research-assistant',
      Accept: 'application/vnd.github+json'
    })
    expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  test('본문이 있으면 POST로 보낸다', async () => {
    const fetchFn = vi.fn<FetchFn>(() => reply('x'))
    await createFetchText(fetchFn)(
      'https://a',
      { 'Content-Type': 'application/json' },
      '{"page":1}'
    )
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"page":1}' })
    await createFetchText(fetchFn)('https://a')
    expect(fetchFn.mock.calls[1][1].method).toBeUndefined()
  })

  test('EUC-KR은 헤더나 meta의 charset으로 푼다', async () => {
    const euckr = new Uint8Array([0xb0, 0xf8, 0xc1, 0xf6]) // '공지'
    const withHeader = new Response(euckr, {
      headers: { 'content-type': 'text/html; charset=EUC-KR' }
    })
    await expect(createFetchText(() => Promise.resolve(withHeader))('https://x')).resolves.toBe(
      '공지'
    )
    const meta = new TextEncoder().encode(
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=euc-kr"></head><body>'
    )
    const body = new Uint8Array([...meta, ...euckr])
    const noHeader = new Response(body, { headers: { 'content-type': 'text/html' } })
    await expect(createFetchText(() => Promise.resolve(noHeader))('https://x')).resolves.toContain(
      '공지'
    )
  })

  test('모르는 charset은 utf-8로 읽는다', async () => {
    const res = new Response('한글', {
      headers: { 'content-type': 'text/html; charset=x-unknown' }
    })
    await expect(createFetchText(() => Promise.resolve(res))('https://x')).resolves.toBe('한글')
  })

  test('8MB를 넘으면 응답이 너무 큽니다', async () => {
    const big = (n: number): Promise<Response> => Promise.resolve(new Response(new Uint8Array(n)))
    const e = await errorOf(createFetchText(() => big(8 * 1024 * 1024 + 1))('https://x'))
    expect(e.message).toBe('응답이 너무 큽니다')
    await expect(createFetchText(() => big(8 * 1024 * 1024))('https://x')).resolves.toHaveLength(
      8 * 1024 * 1024
    )
  })
})
