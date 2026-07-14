import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { DomeParseError } from './dome-errors'
import { domeProductSchema } from './dome-schemas'
import type { DomeEnvelopeDto } from './dome-types'

const forbiddenXmlPattern = /<!DOCTYPE|<!ENTITY/i

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: false,
  allowBooleanAttributes: false,
})

export function parseDomeXml(xml: string): DomeEnvelopeDto {
  const normalized = xml.trim()
  if (!normalized) throw new DomeParseError('친구도매가 빈 응답을 반환했습니다.')
  if (forbiddenXmlPattern.test(normalized)) {
    throw new DomeParseError('DTD 또는 외부 엔티티가 포함된 XML은 허용되지 않습니다.')
  }

  const validation = XMLValidator.validate(normalized, { allowBooleanAttributes: false })
  if (validation !== true) throw new DomeParseError()

  let document: unknown
  try {
    document = parser.parse(normalized)
  } catch {
    throw new DomeParseError()
  }

  if (!document || typeof document !== 'object') throw new DomeParseError()
  const root = (document as Record<string, unknown>).upitkr
  if (root === '' || root === null) return { products: [], raw: {} }
  if (!root || typeof root !== 'object') throw new DomeParseError('upitkr 루트가 없습니다.')

  const raw = root as Record<string, unknown>
  if (typeof raw.error === 'string' || typeof raw.message === 'string') {
    throw new DomeParseError('친구도매 API가 오류 응답을 반환했습니다.')
  }
  const productNodes = raw.product === undefined ? [] : Array.isArray(raw.product) ? raw.product : [raw.product]
  const products = productNodes.map((node) => {
    const result = domeProductSchema.safeParse(node)
    if (!result.success) throw new DomeParseError('상품 필수 필드가 올바르지 않습니다.')
    return result.data
  })

  return {
    version: typeof raw.version === 'string' ? raw.version : undefined,
    datetime: typeof raw.datetime === 'string' ? raw.datetime : undefined,
    products,
    raw,
  }
}
