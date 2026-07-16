import iconv from 'iconv-lite'
import type { ServerEnv } from '@/lib/env/server'
import { logger } from '@/lib/logging/logger'
import { SupplierError } from '../core/supplier-errors'

export interface DomeHttpResponse {
  xml: string
  status: number
}

export interface DomeClient {
  fetchProduct(goodsno?: string): Promise<DomeHttpResponse>
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new SupplierError('supplier_response_too_large', '친구도매 응답 크기 제한을 초과했습니다.')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

function decodeXml(buffer: Buffer, contentType: string): string {
  const asciiPrefix = buffer.subarray(0, Math.min(buffer.length, 200)).toString('ascii')
  const declared = asciiPrefix.match(/encoding=["']([^"']+)["']/i)?.[1]
  const charset = contentType.match(/charset=([^;\s]+)/i)?.[1] ?? declared ?? 'utf-8'
  return iconv.decode(buffer, /euc-?kr|ks_c_5601-1987/i.test(charset) ? 'euc-kr' : 'utf-8')
}

export class LiveDomeClient implements DomeClient {
  constructor(private readonly env: ServerEnv, private readonly fetcher: typeof fetch = fetch) {}

  async fetchProduct(goodsno?: string): Promise<DomeHttpResponse> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.env.DOME_API_TIMEOUT_MS)
    let phase: 'fetch' | 'read_body' | 'decode' = 'fetch'
    const body = new URLSearchParams({
      id: this.env.DOME_API_ID ?? '',
      apiKey: this.env.DOME_API_KEY ?? '',
    })
    if (goodsno) body.set('goodsno', goodsno)

    try {
      const response = await this.fetcher(this.env.DOME_API_URL, {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        redirect: 'manual',
        signal: controller.signal,
        cache: 'no-store',
      })
      if (response.status >= 300 && response.status < 400) {
        throw new SupplierError(
          'supplier_http_error',
          '친구도매가 예상하지 못한 리디렉션을 반환했습니다.',
          response.status,
        )
      }
      const contentType = response.headers.get('content-type') ?? ''
      if (!/^(application|text)\/(xml|plain)(?:;|$)/i.test(contentType)) {
        throw new SupplierError(
          'supplier_invalid_content_type',
          '친구도매가 허용되지 않은 응답 형식을 반환했습니다.',
          response.status,
        )
      }
      if (response.status === 401 || response.status === 403) {
        throw new SupplierError('supplier_auth_error', '친구도매 인증에 실패했습니다.', response.status)
      }
      if (response.status === 429) {
        throw new SupplierError('supplier_rate_limit', '친구도매 호출 제한에 도달했습니다.', 429)
      }
      if (!response.ok) {
        throw new SupplierError('supplier_http_error', '친구도매 요청에 실패했습니다.', response.status)
      }
      phase = 'read_body'
      const buffer = await readLimitedBody(response, this.env.DOME_API_MAX_RESPONSE_BYTES)
      if (buffer.length === 0) {
        throw new SupplierError('supplier_empty_response', '친구도매가 빈 응답을 반환했습니다.', response.status)
      }
      phase = 'decode'
      return { xml: decodeXml(buffer, contentType), status: response.status }
    } catch (error) {
      if (error instanceof SupplierError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new SupplierError('supplier_timeout', '친구도매 응답 시간이 초과되었습니다.')
      }
      const diagnostic = toSafeDiagnostic(error, [this.env.DOME_API_ID, this.env.DOME_API_KEY])
      logger.error('dome_client_unexpected_error', {
        phase,
        errorName: diagnostic.errorName,
        errorMessage: diagnostic.errorMessage,
        causeName: diagnostic.causeName,
        causeCode: diagnostic.causeCode,
      })
      throw new SupplierError('supplier_http_error', '친구도매에 연결할 수 없습니다.')
    } finally {
      clearTimeout(timeout)
    }
  }
}

function toSafeDiagnostic(error: unknown, secrets: Array<string | undefined>) {
  const cause = error instanceof Error && error.cause && typeof error.cause === 'object'
    ? error.cause as { name?: unknown; code?: unknown }
    : undefined
  let errorMessage = error instanceof Error ? error.message : String(error)
  for (const secret of secrets) {
    if (secret) errorMessage = errorMessage.replaceAll(secret, '[redacted]')
  }
  errorMessage = errorMessage
    .replace(/([?&](?:apiKey|id)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 300)
  return {
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage,
    causeName: typeof cause?.name === 'string' ? cause.name : undefined,
    causeCode: typeof cause?.code === 'string' || typeof cause?.code === 'number'
      ? String(cause.code)
      : undefined,
  }
}

export const domeClientInternals = { readLimitedBody, decodeXml, toSafeDiagnostic }
