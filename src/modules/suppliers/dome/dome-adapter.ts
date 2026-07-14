import type { SupplierAdapter } from '../core/supplier-adapter'
import type { SupplierFetchResult } from '../core/types'
import { SupplierError } from '../core/supplier-errors'
import type { DomeClient } from './dome-client'
import { mapDomeProduct } from './dome-mapper'
import { parseDomeXml } from './dome-parser'

export class DomeAdapter implements SupplierAdapter {
  readonly code = 'dome'
  constructor(private readonly client: DomeClient) {}

  async fetchProduct(goodsno: string): Promise<SupplierFetchResult> {
    const response = await this.client.fetchProduct(goodsno)
    const envelope = parseDomeXml(response.xml)
    const products = envelope.products.map(mapDomeProduct)
    const exact = products.filter((product) => product.externalProductId === goodsno)
    if (exact.length === 0) {
      throw new SupplierError('supplier_product_not_found', '해당 친구도매 상품을 찾지 못했습니다.')
    }
    return { products: exact, responseStatus: response.status }
  }

  async fetchProducts(): Promise<SupplierFetchResult> {
    const response = await this.client.fetchProduct()
    const envelope = parseDomeXml(response.xml)
    return { products: envelope.products.map(mapDomeProduct), responseStatus: response.status }
  }
}
