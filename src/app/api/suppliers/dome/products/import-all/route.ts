import { NextResponse } from 'next/server'
import { AuthenticationError, requireAdmin } from '@/lib/auth/admin'

export async function POST() {
  try {
    await requireAdmin()
    return NextResponse.json({
      success: false,
      error: {
        code: 'local_import_required',
        message: '전체 상품 가져오기는 npm run import:all -- --confirm 명령으로 실행해 주세요.',
      },
    }, { status: 409 })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({
        success: false,
        error: { code: error.code, message: error.message },
      }, { status: 401 })
    }
    return NextResponse.json({
      success: false,
      error: { code: 'internal_error', message: '관리자 인증 중 오류가 발생했습니다.' },
    }, { status: 500 })
  }
}
