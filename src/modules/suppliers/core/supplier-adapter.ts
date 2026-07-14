import type { SupplierFetchResult } from './types'

export interface SupplierAdapter {
  readonly code: string
  fetchProduct(goodsno: string): Promise<SupplierFetchResult>
}
