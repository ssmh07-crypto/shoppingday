import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDomeXml } from '@/modules/suppliers/dome/dome-parser'
import { mapDomeAvailability, mapDomeProduct } from '@/modules/suppliers/dome/dome-mapper'

const fixtures = path.join(process.cwd(), 'tests/fixtures/dome')
const read = (name: string) => readFile(path.join(fixtures, name), 'utf8')

describe('친구도매 XML 파싱과 매핑', () => {
  it('정상 상품과 숫자 공급가를 파싱한다', async () => {
    const [dto] = parseDomeXml(await read('product-normal.xml')).products
    const product = mapDomeProduct(dto)
    expect(product).toMatchObject({ externalProductId: '434379', originalName: '잔디엣지', supplierPrice: 4500, availability: 'active' })
    expect(product.rawDescription).toContain('<IMG')
  })
  it('품절 상태를 표준 상태로 변환한다', async () => {
    const [dto] = parseDomeXml(await read('product-sold-out.xml')).products
    expect(mapDomeProduct(dto).availability).toBe('sold_out')
    expect(mapDomeAvailability('알 수 없음')).toBe('unknown')
  })
  it('이미지를 번호순으로 변환한다', async () => {
    const [dto] = parseDomeXml(await read('product-multiple-images.xml')).products
    expect(mapDomeProduct(dto).images).toEqual(['https://example.test/1.jpg', 'https://example.test/2.jpg'])
  })
  it('복수 옵션을 변환한다', async () => {
    const [dto] = parseDomeXml(await read('product-multiple-options.xml')).products
    expect(mapDomeProduct(dto).options).toEqual([{ name: '빨강', price: 1000 }, { name: '파랑', price: 1200 }])
  })
  it('선택 필드가 없으면 null과 빈 배열을 사용한다', async () => {
    const [dto] = parseDomeXml(await read('product-missing-fields.xml')).products
    expect(mapDomeProduct(dto)).toMatchObject({ originalName: null, supplierPrice: null, images: [], options: [] })
  })
  it('잘못된 XML, 빈 본문, DTD를 거부한다', async () => {
    const invalid = await read('product-invalid.xml')
    expect(() => parseDomeXml(invalid)).toThrow()
    expect(() => parseDomeXml('   ')).toThrow()
    expect(() => parseDomeXml('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><upitkr/>')).toThrow()
  })
  it('API 오류 응답을 거부한다', async () => {
    const apiError = await read('api-error.xml')
    expect(() => parseDomeXml(apiError)).toThrow('오류 응답')
  })
  it('상품이 없는 정상 envelope는 빈 배열이다', async () => {
    expect(parseDomeXml(await read('product-empty.xml')).products).toEqual([])
  })
})
