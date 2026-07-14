import { NextResponse } from 'next/server'
import { AuthenticationError, requireAdmin } from '@/lib/auth/admin'
import { createDomeImportService } from '@/modules/suppliers/dome/dome-service'
import { SupplierError } from '@/modules/suppliers/core/supplier-errors'
import { ProductImportError } from '@/modules/products/product-service'

export async function POST() {
  try {
    const user = await requireAdmin()
    return NextResponse.json(await createDomeImportService().importAll(user.id))
  } catch (error) {
    const known = error instanceof AuthenticationError || error instanceof SupplierError || error instanceof ProductImportError
    const code = known ? error.code : 'internal_error'
    const status = code === 'authentication_error' ? 401 : code === 'supplier_rate_limit' ? 429 : 500
    return NextResponse.json({ success:false, error:{ code, message:known ? error.message : '전체 상품을 가져오는 중 오류가 발생했습니다.' } }, { status })
  }
}
