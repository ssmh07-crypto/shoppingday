import 'server-only'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { supplierApiCallLogs, suppliers } from '@/lib/db/schema'

export interface ApiCallLogInput {
  requestId: string
  supplierCode: string
  requestType: string
  sanitizedParameters: Record<string, string>
  requestedAt: Date
  completedAt: Date
  success: boolean
  responseStatus: number | null
  responseCount: number | null
  durationMs: number
  errorCode: string | null
  errorMessage: string | null
}

export interface ApiCallLogRepository {
  save(input: ApiCallLogInput): Promise<void>
}

export class DrizzleApiCallLogRepository implements ApiCallLogRepository {
  async save(input: ApiCallLogInput) {
    const [supplier] = await getDb()
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.code, input.supplierCode))
      .limit(1)

    await getDb().insert(supplierApiCallLogs).values({
      supplierId: supplier?.id,
      requestId: input.requestId,
      requestType: input.requestType,
      sanitizedParameters: input.sanitizedParameters,
      requestedAt: input.requestedAt,
      completedAt: input.completedAt,
      success: input.success,
      responseStatus: input.responseStatus,
      responseCount: input.responseCount,
      durationMs: input.durationMs,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage?.slice(0, 500) ?? null,
    })
  }
}
