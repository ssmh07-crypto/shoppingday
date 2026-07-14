import { NextResponse } from 'next/server'
import { AuthenticationError, requireAdmin } from '@/lib/auth/admin'
import { createDomeImportService } from '@/modules/suppliers/dome/dome-service'
import { importProductInputSchema } from '@/modules/suppliers/dome/dome-schemas'
import { SupplierError } from '@/modules/suppliers/core/supplier-errors'
import { ProductImportError } from '@/modules/products/product-service'

const statusByCode: Record<string, number> = {
  authentication_error: 401,
  validation_error: 400,
  supplier_product_not_found: 404,
  supplier_timeout: 504,
  supplier_rate_limit: 429,
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
    const body: unknown = await request.json().catch(() => null)
    const input = importProductInputSchema.safeParse(body)
    if (!input.success) {
      return NextResponse.json(
        { success: false, error: { code: 'validation_error', message: input.error.issues[0]?.message ?? '입력값을 확인해 주세요.' } },
        { status: 400 },
      )
    }
    return NextResponse.json(await createDomeImportService().importByExternalId(input.data.goodsno, user.id))
  } catch (error) {
    const code = error instanceof AuthenticationError
      ? error.code
      : error instanceof SupplierError || error instanceof ProductImportError
        ? error.code
        : 'internal_error'
    const message = error instanceof AuthenticationError || error instanceof SupplierError || error instanceof ProductImportError
      ? error.message
      : '상품을 가져오는 중 오류가 발생했습니다.'
    return NextResponse.json({ success: false, error: { code, message } }, { status: statusByCode[code] ?? 500 })
  }
}
