import { describe, expect, it, vi } from 'vitest'
import type { ServerEnv } from '@/lib/env/server'
import { LiveDomeClient } from '@/modules/suppliers/dome/dome-client'

const env = {
  DOME_API_URL: 'https://example.test/api', DOME_API_ID: 'secret-id', DOME_API_KEY: 'secret-key',
  DOME_API_MOCK_MODE: false, DOME_API_TIMEOUT_MS: 10, DOME_API_MAX_RESPONSE_BYTES: 20,
} as ServerEnv

describe('친구도매 HTTP 클라이언트', () => {
  it('인증정보를 URL이나 헤더에 넣지 않고 POST body로만 보낸다', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response('<upitkr/>', { status: 200, headers: { 'content-type': 'application/xml' } }))
    await new LiveDomeClient(env, fetcher as typeof fetch).fetchProduct('434379')
    const [url, init] = fetcher.mock.calls[0]
    expect(String(url)).not.toContain('secret')
    expect(JSON.stringify(init?.headers)).not.toContain('secret')
    expect(String(init?.body)).toContain('id=secret-id')
  })
  it('timeout을 공급처 timeout 오류로 변환한다', async () => {
    const fetcher = vi.fn((...args: Parameters<typeof fetch>) => new Promise<Response>((_resolve, reject) => {
      const init = args[1]
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    await expect(new LiveDomeClient(env, fetcher as typeof fetch).fetchProduct('434379')).rejects.toMatchObject({ code: 'supplier_timeout' })
  })
  it('최대 응답 크기를 제한한다', async () => {
    const fetcher = vi.fn(async () => new Response('x'.repeat(21), { headers: { 'content-type': 'text/xml' } }))
    await expect(new LiveDomeClient(env, fetcher as typeof fetch).fetchProduct('434379')).rejects.toMatchObject({ code: 'supplier_response_too_large' })
  })
  it('비정상 content-type을 거부한다', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }))
    await expect(new LiveDomeClient(env, fetcher as typeof fetch).fetchProduct('434379')).rejects.toMatchObject({ code: 'supplier_invalid_content_type' })
  })
})
