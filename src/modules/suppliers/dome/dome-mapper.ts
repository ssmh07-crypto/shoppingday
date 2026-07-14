import type { SupplierAvailability, SupplierProduct, SupplierProductOption } from '../core/types'
import type { DomeProductDto } from './dome-types'

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function nonNegativeNumber(value: unknown): number | null {
  const text = optionalText(value)
  if (text === null || !/^\d+(?:\.\d+)?$/.test(text)) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function parseDate(value: unknown): Date | null {
  const text = optionalText(value)
  if (!text) return null
  const date = new Date(text.replace(' ', 'T') + '+09:00')
  return Number.isNaN(date.getTime()) ? null : date
}

export function mapDomeAvailability(status: unknown): SupplierAvailability {
  const normalized = optionalText(status)?.replace(/\s/g, '')
  if (normalized === '정상' || normalized === '판매중') return 'active'
  if (normalized === '품절' || normalized === '판매중지' || normalized === '단종') return 'sold_out'
  return 'unknown'
}

export function parseDomeOptions(value: unknown): SupplierProductOption[] {
  const text = optionalText(value)
  if (!text) return []

  return text
    .split('||')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, price] = entry.split('^|^').map((part) => part.trim())
      return { name, price: nonNegativeNumber(price) }
    })
    .filter((option) => Boolean(option.name))
}

function mapImages(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, url]) => optionalText(url))
    .filter((url): url is string => Boolean(url))
    .filter((url) => /^https?:\/\//i.test(url))
}

export function mapDomeProduct(dto: DomeProductDto): SupplierProduct {
  return {
    supplierCode: 'dome',
    externalProductId: dto.goodsno.trim(),
    originalName: optionalText(dto.goodsnm),
    supplierPrice: nonNegativeNumber(dto.goods_price),
    currency: 'KRW',
    availability: mapDomeAvailability(dto.status),
    images: mapImages(dto.img_l),
    options: parseDomeOptions(dto.options),
    rawDescription: optionalText(dto.detailed_source),
    supplierCreatedAt: parseDate(dto.regdate),
    supplierUpdatedAt: parseDate(dto.lastmodidate),
    rawPayload: { ...dto },
  }
}
