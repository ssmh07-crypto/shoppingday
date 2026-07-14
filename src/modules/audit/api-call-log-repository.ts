import 'server-only'
import { and, eq, gte, sql } from 'drizzle-orm'
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
  countSince(supplierCode: string, since: Date): Promise<number>
}

export class DrizzleApiCallLogRepository implements ApiCallLogRepository {
  async countSince(supplierCode: string, since: Date) {
    const [row] = await getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(supplierApiCallLogs)
      .innerJoin(suppliers, eq(suppliers.id, supplierApiCallLogs.supplierId))
      .where(and(eq(suppliers.code, supplierCode), gte(supplierApiCallLogs.requestedAt, since)))
    return row?.count ?? 0
  }

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
