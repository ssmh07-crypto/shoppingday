import { NextResponse } from 'next/server'
import { AuthenticationError, requireAdmin } from '@/lib/auth/admin'
import { ProductImportError } from '@/modules/products/product-service'
import { SupplierError } from '@/modules/suppliers/core/supplier-errors'
import { createDomeImportService } from '@/modules/suppliers/dome/dome-service'
import { importProductInputSchema } from '@/modules/suppliers/dome/dome-schemas'

const statusByCode: Record<string, number> = {
  authentication_error: 401,
  validation_error: 400,
  supplier_product_not_found: 404,
  supplier_rate_limit: 429,
  supplier_timeout: 504,
  supplier_auth_error: 502,
  supplier_empty_response: 502,
  supplier_invalid_xml: 502,
  supplier_response_too_large: 502,
  supplier_invalid_content_type: 502,
  supplier_http_error: 502,
  database_error: 500,
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin()
    const input = importProductInputSchema.safeParse(await request.json().catch(() => null))
    if (!input.success) {
      return NextResponse.json({ success: false, error: { code: 'validation_error', message: input.error.issues[0]?.message ?? '입력값을 확인해 주세요.' } }, { status: 400 })
    }
    return NextResponse.json(await createDomeImportService().refreshByExternalId(input.data.goodsno, user.id))
  } catch (error) {
    const known = error instanceof AuthenticationError || error instanceof SupplierError || error instanceof ProductImportError
    const code = known ? error.code : 'internal_error'
    const message = known ? error.message : '상품을 갱신하는 중 오류가 발생했습니다.'
    return NextResponse.json({ success: false, error: { code, message } }, { status: statusByCode[code] ?? 500 })
  }
}
