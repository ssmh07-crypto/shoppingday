export type SupplierAvailability = 'active' | 'sold_out' | 'unknown'

export interface SupplierProductOption {
  name: string
  price: number | null
}

export interface SupplierProduct {
  supplierCode: string
  externalProductId: string
  originalName: string | null
  supplierPrice: number | null
  currency: 'KRW'
  availability: SupplierAvailability
  images: string[]
  options: SupplierProductOption[]
  rawDescription: string | null
  supplierCreatedAt: Date | null
  supplierUpdatedAt: Date | null
  rawPayload: Record<string, unknown>
}

export interface SupplierFetchResult {
  products: SupplierProduct[]
  responseStatus: number | null
}
