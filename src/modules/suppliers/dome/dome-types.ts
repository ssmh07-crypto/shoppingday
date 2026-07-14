export interface DomeProductDto {
  goodsno: string
  status?: string
  category?: string
  goodscd?: string
  goodsnm?: string
  madein?: string
  option_value?: string
  goods_price?: string
  goods_consumer?: string
  goods_minPrice?: string
  img_l?: Record<string, unknown>
  options?: string
  detailed_source?: string
  regdate?: string
  lastmodidate?: string
  [key: string]: unknown
}

export interface DomeEnvelopeDto {
  version?: string
  datetime?: string
  products: DomeProductDto[]
  raw: Record<string, unknown>
}
