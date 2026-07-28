import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  naverBulkJobItems,
  naverBulkJobs,
  products,
} from "@/lib/db/schema";
import { ProductValidationError } from "@/modules/products/product-errors";

export type NaverBulkJobType = "upload_images" | "publish";

export class NaverBulkJobRepository {
  constructor(private readonly database: Database) {}

  async create(
    ownerId: string,
    type: NaverBulkJobType,
    requestedProductIds: string[],
  ) {
    const productIds = [...new Set(requestedProductIds)];
    const accessible = await this.database
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          inArray(products.id, productIds),
          or(eq(products.ownerId, ownerId), isNull(products.ownerId)),
        ),
      );
    if (accessible.length !== productIds.length) {
      throw new ProductValidationError({
        productIds: "처리할 수 없는 상품이 포함되어 있습니다.",
      });
    }
    return this.database.transaction(async (tx) => {
      const [job] = await tx
        .insert(naverBulkJobs)
        .values({ ownerId, type, total: productIds.length })
        .returning();
      await tx.insert(naverBulkJobItems).values(
        productIds.map((productId) => ({ jobId: job!.id, productId })),
      );
      return job!;
    });
  }

  async list(ownerId: string, limit = 10) {
    return this.database
      .select()
      .from(naverBulkJobs)
      .where(eq(naverBulkJobs.ownerId, ownerId))
      .orderBy(desc(naverBulkJobs.createdAt))
      .limit(limit);
  }

  async get(jobId: string, ownerId: string) {
    const [job] = await this.database
      .select()
      .from(naverBulkJobs)
      .where(
        and(eq(naverBulkJobs.id, jobId), eq(naverBulkJobs.ownerId, ownerId)),
      )
      .limit(1);
    return job ?? null;
  }

  async claim(jobId: string, ownerId: string) {
    return this.database.transaction(async (tx) => {
      const [job] = await tx
        .update(naverBulkJobs)
        .set({
          status: "running",
          startedAt: sql`coalesce(${naverBulkJobs.startedAt}, now())`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(naverBulkJobs.id, jobId),
            eq(naverBulkJobs.ownerId, ownerId),
            inArray(naverBulkJobs.status, ["queued", "running"]),
          ),
        )
        .returning();
      if (!job) return null;

      const staleBefore = new Date(Date.now() - 5 * 60_000);
      await tx
        .update(naverBulkJobItems)
        .set({ status: "queued", availableAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(naverBulkJobItems.jobId, jobId),
            eq(naverBulkJobItems.status, "running"),
            lt(naverBulkJobItems.updatedAt, staleBefore),
            lt(naverBulkJobItems.attempts, 3),
          ),
        );
      await tx
        .update(naverBulkJobItems)
        .set({
          status: "failed",
          lastError: "작업 실행 시간이 초과되었습니다.",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(naverBulkJobItems.jobId, jobId),
            eq(naverBulkJobItems.status, "running"),
            lt(naverBulkJobItems.updatedAt, staleBefore),
            eq(naverBulkJobItems.attempts, 3),
          ),
        );

      const [item] = await tx
        .select()
        .from(naverBulkJobItems)
        .where(
          and(
            eq(naverBulkJobItems.jobId, jobId),
            eq(naverBulkJobItems.status, "queued"),
            lte(naverBulkJobItems.availableAt, new Date()),
          ),
        )
        .orderBy(asc(naverBulkJobItems.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!item) return { job, item: null };
      const [claimed] = await tx
        .update(naverBulkJobItems)
        .set({
          status: "running",
          attempts: sql`${naverBulkJobItems.attempts} + 1`,
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(naverBulkJobItems.id, item.id))
        .returning();
      return { job, item: claimed! };
    });
  }

  async finishItem(
    jobId: string,
    itemId: string,
    result:
      | { success: true }
      | { success: false; message: string; retry: boolean; attempts: number },
  ) {
    await this.database.transaction(async (tx) => {
      const retry =
        !result.success && result.retry && result.attempts < 3;
      await tx
        .update(naverBulkJobItems)
        .set(
          result.success
            ? {
                status: "succeeded",
                lastError: null,
                completedAt: new Date(),
                updatedAt: new Date(),
              }
            : retry
              ? {
                  status: "queued",
                  lastError: result.message.slice(0, 500),
                  availableAt: new Date(
                    Date.now() + naverBulkRetryDelayMs(result.attempts),
                  ),
                  updatedAt: new Date(),
                }
              : {
                  status: "failed",
                  lastError: result.message.slice(0, 500),
                  completedAt: new Date(),
                  updatedAt: new Date(),
                },
        )
        .where(
          and(
            eq(naverBulkJobItems.id, itemId),
            eq(naverBulkJobItems.jobId, jobId),
          ),
        );
      const [summary] = await tx
        .select({
          succeeded: count(
            sql`case when ${naverBulkJobItems.status} = 'succeeded' then 1 end`,
          ),
          failed: count(
            sql`case when ${naverBulkJobItems.status} = 'failed' then 1 end`,
          ),
        })
        .from(naverBulkJobItems)
        .where(eq(naverBulkJobItems.jobId, jobId));
      const succeeded = Number(summary?.succeeded ?? 0);
      const failed = Number(summary?.failed ?? 0);
      const [job] = await tx
        .select({ total: naverBulkJobs.total })
        .from(naverBulkJobs)
        .where(eq(naverBulkJobs.id, jobId))
        .limit(1);
      const progress = calculateNaverBulkJobProgress(
        job?.total ?? Number.MAX_SAFE_INTEGER,
        succeeded,
        failed,
      );
      await tx
        .update(naverBulkJobs)
        .set({
          ...progress,
          ...(progress.status === "running"
            ? {}
            : { completedAt: new Date() }),
          updatedAt: new Date(),
        })
        .where(eq(naverBulkJobs.id, jobId));
    });
  }

  async refresh(jobId: string, ownerId: string) {
    const [summary] = await this.database
      .select({
        succeeded: count(
          sql`case when ${naverBulkJobItems.status} = 'succeeded' then 1 end`,
        ),
        failed: count(
          sql`case when ${naverBulkJobItems.status} = 'failed' then 1 end`,
        ),
      })
      .from(naverBulkJobItems)
      .where(eq(naverBulkJobItems.jobId, jobId));
    const current = await this.get(jobId, ownerId);
    if (!current) return null;
    const succeeded = Number(summary?.succeeded ?? 0);
    const failed = Number(summary?.failed ?? 0);
    const progress = calculateNaverBulkJobProgress(
      current.total,
      succeeded,
      failed,
    );
    const [job] = await this.database
      .update(naverBulkJobs)
      .set({
        ...progress,
        ...(progress.status === "running"
          ? {}
          : { completedAt: new Date() }),
        updatedAt: new Date(),
      })
      .where(
        and(eq(naverBulkJobs.id, jobId), eq(naverBulkJobs.ownerId, ownerId)),
      )
      .returning();
    return job ?? null;
  }
}

export function calculateNaverBulkJobProgress(
  total: number,
  succeeded: number,
  failed: number,
) {
  const processed = succeeded + failed;
  return {
    processed,
    succeeded,
    failed,
    status:
      processed < total
        ? ("running" as const)
        : failed
          ? ("partial_failed" as const)
          : ("completed" as const),
  };
}

export function naverBulkRetryDelayMs(attempts: number) {
  return 2 ** Math.max(1, attempts) * 1_000;
}
