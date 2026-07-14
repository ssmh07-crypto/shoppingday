import { describe, expect, it, vi } from 'vitest'
import { ProductImportService } from '@/modules/products/product-service'
import type { ProductRepository, ImportedProductRecord } from '@/modules/products/product-repository'
import type { ApiCallLogRepository, ApiCallLogInput } from '@/modules/audit/api-call-log-repository'
import type { SupplierAdapter } from '@/modules/suppliers/core/supplier-adapter'
import type { SupplierProduct } from '@/modules/suppliers/core/types'
import { SupplierError } from '@/modules/suppliers/core/supplier-errors'

const product: SupplierProduct = { supplierCode: 'dome', externalProductId: '434379', originalName: '잔디엣지', supplierPrice: 4500, currency: 'KRW', availability: 'active', images: ['https://example.test/a.jpg'], options: [], rawDescription: null, supplierCreatedAt: null, supplierUpdatedAt: null, rawPayload: {} }
const row = { id: 'sp1', supplierId: 's1', externalProductId: '434379', originalName: '잔디엣지', supplierPrice: '4500.00', currency: 'KRW', availability: 'active' as const, originalImages: product.images, originalOptions: [], rawDescription: null, rawPayload: {}, supplierCreatedAt: null, supplierUpdatedAt: null, firstImportedAt: new Date(), lastSyncedAt: new Date(), createdAt: new Date(), updatedAt: new Date() }
const saved: ImportedProductRecord = { productId: 'p1', supplierProductId: 'sp1', supplierProduct: row }

function setup(existing: ImportedProductRecord | null = null) {
  const repository: ProductRepository = { findImported: vi.fn(async () => existing), importSupplierProduct: vi.fn(async () => saved), updateSupplierProduct: vi.fn(async () => saved), findDetail: vi.fn(async () => null) }
  const calls: ApiCallLogInput[] = []
  const logs: ApiCallLogRepository = { save: vi.fn(async (input) => { calls.push(input) }), countSince: vi.fn(async () => 0) }
  const adapter: SupplierAdapter = { code: 'dome', fetchProduct: vi.fn(async () => ({ products: [product], responseStatus: 200 })) }
  return { service: new ProductImportService(repository, logs, adapter), repository, logs, adapter, calls }
}

describe('상품 import 통합 흐름', () => {
  it('mock 공급처 상품을 저장하고 민감정보 없는 성공 로그를 남긴다', async () => {
    const context = setup()
    const result = await context.service.importByExternalId('434379', 'u1')
    expect(result).toMatchObject({ productId: 'p1', alreadyExists: false })
    expect(context.calls[0].sanitizedParameters).toEqual({ goodsno: '434379' })
    expect(JSON.stringify(context.calls[0])).not.toMatch(/apiKey|secret-id|secret-key/)
  })
  it('중복 상품이면 공급처를 호출하지 않는다', async () => {
    const context = setup(saved)
    expect(await context.service.importByExternalId('434379', 'u1')).toMatchObject({ alreadyExists: true })
    expect(context.adapter.fetchProduct).not.toHaveBeenCalled()
  })
  it('한국 시간 기준 오늘 5회를 사용했으면 공급처를 호출하지 않는다', async () => {
    const context = setup()
    vi.mocked(context.logs.countSince).mockResolvedValueOnce(5)
    await expect(context.service.importByExternalId('434379', 'u1')).rejects.toMatchObject({ code: 'supplier_rate_limit' })
    expect(context.adapter.fetchProduct).not.toHaveBeenCalled()
  })
  it('명시적 갱신만 공급처를 호출하고 기존 행을 업데이트한다', async () => {
    const context = setup(saved)
    const result = await context.service.refreshByExternalId('434379', 'u1')
    expect(context.adapter.fetchProduct).toHaveBeenCalledOnce()
    expect(context.repository.updateSupplierProduct).toHaveBeenCalledWith('sp1', product)
    expect(context.calls[0].requestType).toBe('product_refresh')
    expect(result.alreadyExists).toBe(true)
  })
  it('공급처 오류와 파싱 오류를 기록하고 전달한다', async () => {
    for (const code of ['supplier_http_error', 'supplier_invalid_xml'] as const) {
      const context = setup()
      vi.mocked(context.adapter.fetchProduct).mockRejectedValueOnce(new SupplierError(code, '안전한 오류'))
      await expect(context.service.importByExternalId('434379', 'u1')).rejects.toMatchObject({ code })
      expect(context.calls[0]).toMatchObject({ success: false, errorCode: code })
    }
  })
  it('DB 저장 실패를 database_error로 기록한다', async () => {
    const context = setup()
    vi.mocked(context.repository.importSupplierProduct).mockRejectedValueOnce(new Error('transaction rolled back'))
    await expect(context.service.importByExternalId('434379', 'u1')).rejects.toMatchObject({ code: 'database_error' })
    expect(context.calls[0]).toMatchObject({ success: false, errorCode: 'database_error' })
  })
})
