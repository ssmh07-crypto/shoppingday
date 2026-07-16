import "server-only";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { supplierProducts, supplierSyncJobs, suppliers } from "@/lib/db/schema";

export type SupplierSyncMode = "all" | "changes";
export type SupplierSyncProgress = {
  total: number;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
};

export class SupplierSyncJobRepository {
  constructor(private readonly database: Database) {}

  async create(supplierCode: string, actorId: string, type: SupplierSyncMode) {
    return this.database.transaction(async (tx) => {
      const [supplier] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(eq(suppliers.code, supplierCode))
        .limit(1);
      if (!supplier) throw new Error("supplier_not_configured");

      // A queued dispatch that never started should not block the UI forever.
      const staleBefore = new Date(Date.now() - 60 * 60 * 1000);
      await tx
        .update(supplierSyncJobs)
        .set({
          status: "failed",
          errorMessage: "작업 시작 시간이 초과되었습니다.",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(supplierSyncJobs.supplierId, supplier.id),
            inArray(supplierSyncJobs.status, ["queued", "running"]),
            lt(supplierSyncJobs.requestedAt, staleBefore),
          ),
        );

      const [job] = await tx
        .insert(supplierSyncJobs)
        .values({ supplierId: supplier.id, actorId, type })
        .returning();
      return job;
    });
  }

  async latest(supplierCode: string) {
    const [job] = await this.database
      .select({ job: supplierSyncJobs })
      .from(supplierSyncJobs)
      .innerJoin(suppliers, eq(suppliers.id, supplierSyncJobs.supplierId))
      .where(eq(suppliers.code, supplierCode))
      .orderBy(desc(supplierSyncJobs.requestedAt))
      .limit(1);
    return job?.job ?? null;
  }

  async find(id: string) {
    const [job] = await this.database
      .select()
      .from(supplierSyncJobs)
      .where(eq(supplierSyncJobs.id, id))
      .limit(1);
    return job ?? null;
  }

  async start(id: string, githubRunId?: string, githubRunUrl?: string) {
    const [job] = await this.database
      .update(supplierSyncJobs)
      .set({
        status: "running",
        startedAt: new Date(),
        githubRunId,
        githubRunUrl,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(supplierSyncJobs.id, id), eq(supplierSyncJobs.status, "queued")),
      )
      .returning();
    return job ?? null;
  }

  async attachGithubRun(id: string, githubRunId: string, githubRunUrl: string) {
    await this.database
      .update(supplierSyncJobs)
      .set({
        githubRunId,
        githubRunUrl,
        updatedAt: new Date(),
      })
      .where(eq(supplierSyncJobs.id, id));
  }

  async progress(
    id: string,
    progress: SupplierSyncProgress,
    dates?: { dateFrom: string; dateTo: string },
  ) {
    await this.database
      .update(supplierSyncJobs)
      .set({
        ...progress,
        ...dates,
        updatedAt: new Date(),
      })
      .where(eq(supplierSyncJobs.id, id));
  }

  async succeed(
    id: string,
    progress: SupplierSyncProgress,
    dates?: { dateFrom: string; dateTo: string },
  ) {
    await this.database
      .update(supplierSyncJobs)
      .set({
        ...progress,
        ...dates,
        status: "succeeded",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(supplierSyncJobs.id, id));
  }

  async fail(id: string, message: string) {
    await this.database
      .update(supplierSyncJobs)
      .set({
        status: "failed",
        errorMessage: message.slice(0, 500),
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(supplierSyncJobs.id, id));
  }

  async lastSuccessfulDateTo(supplierCode: string) {
    const [row] = await this.database
      .select({ dateTo: supplierSyncJobs.dateTo })
      .from(supplierSyncJobs)
      .innerJoin(suppliers, eq(suppliers.id, supplierSyncJobs.supplierId))
      .where(
        and(
          eq(suppliers.code, supplierCode),
          eq(supplierSyncJobs.type, "changes"),
          eq(supplierSyncJobs.status, "succeeded"),
          sql`${supplierSyncJobs.dateTo} is not null`,
        ),
      )
      .orderBy(desc(supplierSyncJobs.completedAt))
      .limit(1);
    return row?.dateTo ?? null;
  }

  async firstImportedAt(supplierCode: string) {
    const [row] = await this.database
      .select({
        value: sql<Date | null>`min(${supplierProducts.firstImportedAt})`,
      })
      .from(supplierProducts)
      .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
      .where(eq(suppliers.code, supplierCode));
    return row?.value ?? null;
  }
}

export function isActiveJobConflict(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505",
  );
}
