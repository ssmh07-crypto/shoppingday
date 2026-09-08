import "server-only";
import { and, eq, lte } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { supplierSyncSchedules, userProfiles } from "@/lib/db/schema";
import {
  nextSyncRun,
  syncScheduleInputSchema,
  type SyncScheduleInput,
} from "./sync-schedule";

export class SyncScheduleRepository {
  constructor(private readonly database: Database) {}

  async get(ownerId: string) {
    const [row] = await this.database
      .select()
      .from(supplierSyncSchedules)
      .where(
        and(
          eq(supplierSyncSchedules.supplierCode, "dome"),
          eq(supplierSyncSchedules.ownerId, ownerId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async save(ownerId: string, input: SyncScheduleInput) {
    const parsed = syncScheduleInputSchema.parse(input);
    const values = {
      ...parsed,
      nextRunAt: nextSyncRun(new Date(), parsed),
      updatedAt: new Date(),
    };
    const [saved] = await this.database
      .insert(supplierSyncSchedules)
      .values({ supplierCode: "dome", ownerId, ...values })
      .onConflictDoUpdate({
        target: supplierSyncSchedules.supplierCode,
        set: values,
        setWhere: eq(supplierSyncSchedules.ownerId, ownerId),
      })
      .returning();
    if (!saved) throw new Error("schedule_owned_by_another_admin");
    return saved;
  }

  async claimDue(now = new Date()) {
    return this.database.transaction(async (tx) => {
      const [row] = await tx
        .select({ schedule: supplierSyncSchedules })
        .from(supplierSyncSchedules)
        .innerJoin(
          userProfiles,
          eq(userProfiles.userId, supplierSyncSchedules.ownerId),
        )
        .where(
          and(
            eq(supplierSyncSchedules.enabled, true),
            lte(supplierSyncSchedules.nextRunAt, now),
            eq(userProfiles.role, "admin"),
          ),
        )
        .limit(1)
        .for("update", { of: supplierSyncSchedules, skipLocked: true });
      if (!row) return null;
      const schedule = row.schedule;
      await tx
        .update(supplierSyncSchedules)
        .set({
          nextRunAt: nextSyncRun(now, syncScheduleInputSchema.parse(schedule)),
          updatedAt: now,
        })
        .where(eq(supplierSyncSchedules.supplierCode, schedule.supplierCode));
      return schedule;
    });
  }
}
