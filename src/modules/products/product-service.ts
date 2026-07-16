import { randomUUID } from 'node:crypto'
import type { ApiCallLogRepository } from '@/modules/audit/api-call-log-repository'
import { logger } from '@/lib/logging/logger'
import type { SupplierAdapter } from '@/modules/suppliers/core/supplier-adapter'
import { SupplierError } from '@/modules/suppliers/core/supplier-errors'
import type { ProductRepository } from './product-repository'

export interface ImportProductResult {
  success: true
  productId: string
  supplierProductId: string
  alreadyExists: boolean
  preview: ImportProductPreview
}

export interface ImportAllProductsResult {
  success: true
  total: number
  created: number
  updated: number
}

export class ProductImportError extends Error {
  readonly code = 'database_error'
  constructor() { super('상품 저장 중 오류가 발생했습니다.'); this.name = 'ProductImportError' }
}

const DAILY_API_LIMIT = 5

export interface ImportProductPreview {
  externalProductId: string
  originalName: string | null
  supplierPrice: string | null
  currency: string
  availability: string
  imageUrl: string | null
  imageCount: number
  optionCount: number
  supplierUpdatedAt: string | null
}

export class ProductImportService {
  constructor(
    private readonly products: ProductRepository,
    private readonly logs: ApiCallLogRepository,
    private readonly supplier: SupplierAdapter,
  ) {}

  async importByExternalId(goodsno: string, actorId: string): Promise<ImportProductResult> {
    const existing = await this.products.findImported(this.supplier.code, goodsno)
    if (existing) {
      return {
        success: true,
        productId: existing.productId,
        supplierProductId: existing.supplierProductId,
        alreadyExists: true,
        preview: toPreview(existing.supplierProduct),
      }
    }

    await this.assertDailyLimit()
    return this.fetchAndSave(goodsno, null, actorId)
  }

  async refreshByExternalId(goodsno: string, actorId: string): Promise<ImportProductResult> {
    const existing = await this.products.findImported(this.supplier.code, goodsno)
    if (!existing) {
      throw new SupplierError('supplier_product_not_found', '먼저 상품을 가져와 주세요.')
    }
    await this.assertDailyLimit()
    return this.fetchAndSave(goodsno, existing, actorId)
  }

  async importAll(actorId: string): Promise<ImportAllProductsResult> {
    await this.assertDailyLimit()
    const requestId = randomUUID()
    const requestedAt = new Date()
    const started = performance.now()
    let responseStatus: number | null = null
    let responseCount: number | null = null
    try {
      const fetched = await this.supplier.fetchProducts()
      responseStatus = fetched.responseStatus
      responseCount = fetched.products.length
      let created = 0
      let updated = 0
      for (const product of fetched.products) {
        const existing = await this.products.findImported(this.supplier.code, product.externalProductId)
        if (existing) {
          await this.products.updateSupplierProduct(existing.supplierProductId, product)
          updated += 1
        } else {
          await this.products.importSupplierProduct(product, actorId)
          created += 1
        }
      }
      await this.saveLog({ requestId, requestType:'product_import_all', goodsno:'all', requestedAt, started, success:true, responseStatus, responseCount })
      return { success:true, total:fetched.products.length, created, updated }
    } catch (error) {
      const code = error instanceof SupplierError ? error.code : 'database_error'
      if (error instanceof SupplierError) responseStatus = error.responseStatus
      await this.saveLog({ requestId, requestType:'product_import_all', goodsno:'all', requestedAt, started, success:false, responseStatus, responseCount, errorCode:code, errorMessage:error instanceof SupplierError ? error.message : '전체 상품 저장 중 오류가 발생했습니다.' })
      if (error instanceof SupplierError) throw error
      throw new ProductImportError()
    }
  }

  private async assertDailyLimit() {
    const used = await this.logs.countSince(this.supplier.code, startOfTodayInKorea())
    if (used >= DAILY_API_LIMIT) {
      throw new SupplierError('supplier_rate_limit', '오늘 사용할 수 있는 공급사 API 5회를 모두 사용했습니다.')
    }
  }

  private async fetchAndSave(goodsno: string, existing: Awaited<ReturnType<ProductRepository['findImported']>>, actorId: string): Promise<ImportProductResult> {
    const requestId = randomUUID()
    const requestedAt = new Date()
    const started = performance.now()
    let responseStatus: number | null = null
    let responseCount: number | null = null

    try {
      const fetched = await this.supplier.fetchProduct(goodsno)
      responseStatus = fetched.responseStatus
      responseCount = fetched.products.length
      const exact = fetched.products[0]
      if (!exact) throw new SupplierError('supplier_product_not_found', '상품을 찾지 못했습니다.')

      // The unique constraint is the final guard against concurrent imports.
      const saved = existing
        ? await this.products.updateSupplierProduct(existing.supplierProductId, exact)
        : await this.products.importSupplierProduct(exact, actorId)
      await this.saveLog({
        requestId,
        requestType: existing ? 'product_refresh' : 'product_import',
        goodsno,
        requestedAt,
        started,
        success: true,
        responseStatus,
        responseCount,
      })
      logger.info('supplier_api_call_completed', {
        requestId,
        supplierCode: this.supplier.code,
        requestType: existing ? 'product_refresh' : 'product_import',
        goodsno,
        durationMs: Math.round(performance.now() - started),
        success: true,
      })
      return {
        success: true,
        productId: saved.productId,
        supplierProductId: saved.supplierProductId,
        alreadyExists: Boolean(existing),
        preview: toPreview(saved.supplierProduct),
      }
    } catch (error) {
      const code = error instanceof SupplierError ? error.code : 'database_error'
      if (error instanceof SupplierError) responseStatus = error.responseStatus
      await this.saveLog({
        requestId,
        requestType: existing ? 'product_refresh' : 'product_import',
        goodsno,
        requestedAt,
        started,
        success: false,
        responseStatus,
        responseCount,
        errorCode: code,
        errorMessage: error instanceof SupplierError ? error.message : '상품 저장 중 오류가 발생했습니다.',
      })
      logger.error('supplier_api_call_failed', {
        requestId,
        supplierCode: this.supplier.code,
        requestType: 'product_import',
        goodsno,
        durationMs: Math.round(performance.now() - started),
        success: false,
        errorCode: code,
      })
      if (error instanceof SupplierError) throw error
      throw new ProductImportError()
    }
  }

  private async saveLog(input: {
    requestId: string
    requestType: 'product_import' | 'product_refresh' | 'product_import_all'
    goodsno: string
    requestedAt: Date
    started: number
    success: boolean
    responseStatus: number | null
    responseCount: number | null
    errorCode?: string
    errorMessage?: string
  }) {
    try {
      await this.logs.save({
        requestId: input.requestId,
        supplierCode: this.supplier.code,
        requestType: input.requestType,
        sanitizedParameters: { goodsno: input.goodsno },
        requestedAt: input.requestedAt,
        completedAt: new Date(),
        success: input.success,
        responseStatus: input.responseStatus,
        responseCount: input.responseCount,
        durationMs: Math.round(performance.now() - input.started),
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
      })
    } catch {
      logger.error('supplier_api_call_log_failed', {
        requestId: input.requestId,
        supplierCode: this.supplier.code,
        errorCode: 'audit_log_error',
      })
    }
  }
}

function startOfTodayInKorea(now = new Date()): Date {
  const koreaOffsetMs = 9 * 60 * 60 * 1000
  const koreaNow = new Date(now.getTime() + koreaOffsetMs)
  return new Date(Date.UTC(koreaNow.getUTCFullYear(), koreaNow.getUTCMonth(), koreaNow.getUTCDate()) - koreaOffsetMs)
}

function toPreview(row: {
  externalProductId: string
  originalName: string | null
  supplierPrice: string | null
  currency: string
  availability: string
  originalImages: string[]
  originalOptions: unknown[]
  supplierUpdatedAt: Date | null
}): ImportProductPreview {
  return {
    externalProductId: row.externalProductId,
    originalName: row.originalName,
    supplierPrice: row.supplierPrice,
    currency: row.currency,
    availability: row.availability,
    imageUrl: row.originalImages[0] ?? null,
    imageCount: row.originalImages.length,
    optionCount: row.originalOptions.length,
    supplierUpdatedAt: row.supplierUpdatedAt?.toISOString() ?? null,
  }
}
