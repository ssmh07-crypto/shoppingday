import "server-only";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  naverDeliveryPolicyTemplates,
  naverStoreConnections,
  productNaverDeliveryPolicySelections,
} from "@/lib/db/schema";
import type { NaverStoreSettingsInput } from "./naver-store-settings";

export class NaverStoreSettingsRepository {
  constructor(private readonly database: Database) {}

  async get(userId: string) {
    const [settings] = await this.database
      .select()
      .from(naverStoreConnections)
      .where(eq(naverStoreConnections.userId, userId))
      .orderBy(
        desc(naverStoreConnections.isDefault),
        asc(naverStoreConnections.createdAt),
      )
      .limit(1);
    return settings ?? null;
  }

  async list(userId: string) {
    return this.database
      .select()
      .from(naverStoreConnections)
      .where(eq(naverStoreConnections.userId, userId))
      .orderBy(
        desc(naverStoreConnections.isDefault),
        asc(naverStoreConnections.createdAt),
      );
  }

  async getById(userId: string, id: string) {
    const [settings] = await this.database
      .select()
      .from(naverStoreConnections)
      .where(
        and(
          eq(naverStoreConnections.id, id),
          eq(naverStoreConnections.userId, userId),
        ),
      )
      .limit(1);
    return settings ?? null;
  }

  async create(userId: string, input: NaverStoreSettingsInput) {
    return this.database.transaction(async (tx) => {
      const [{ value }] = await tx
        .select({ value: count() })
        .from(naverStoreConnections)
        .where(eq(naverStoreConnections.userId, userId));
      if (value >= 5) throw new NaverStoreConnectionLimitError();
      const makeDefault = input.isDefault || value === 0;
      if (makeDefault) {
        await tx
          .update(naverStoreConnections)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(naverStoreConnections.userId, userId));
      }
      const [settings] = await tx
        .insert(naverStoreConnections)
        .values({
          userId,
          ...input,
          accountId: input.authType === "SELF" ? null : input.accountId,
          isDefault: makeDefault,
        })
        .returning();
      return settings!;
    });
  }

  async update(userId: string, id: string, input: NaverStoreSettingsInput) {
    return this.database.transaction(async (tx) => {
      if (input.isDefault) {
        await tx
          .update(naverStoreConnections)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(naverStoreConnections.userId, userId));
      }
      const [settings] = await tx
        .update(naverStoreConnections)
        .set({
          ...input,
          accountId: input.authType === "SELF" ? null : input.accountId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(naverStoreConnections.id, id),
            eq(naverStoreConnections.userId, userId),
          ),
        )
        .returning();
      if (!settings) return null;
      if (!settings.isDefault) {
        const [remainingDefault] = await tx
          .select({ id: naverStoreConnections.id })
          .from(naverStoreConnections)
          .where(
            and(
              eq(naverStoreConnections.userId, userId),
              eq(naverStoreConnections.isDefault, true),
            ),
          )
          .limit(1);
        if (!remainingDefault) {
          const [forced] = await tx
            .update(naverStoreConnections)
            .set({ isDefault: true, updatedAt: new Date() })
            .where(eq(naverStoreConnections.id, id))
            .returning();
          return forced!;
        }
      }
      return settings;
    });
  }

  async remove(userId: string, id: string) {
    return this.database.transaction(async (tx) => {
      await tx
        .delete(productNaverDeliveryPolicySelections)
        .where(
          inArray(
            productNaverDeliveryPolicySelections.deliveryPolicyId,
            tx
              .select({ id: naverDeliveryPolicyTemplates.id })
              .from(naverDeliveryPolicyTemplates)
              .where(
                and(
                  eq(naverDeliveryPolicyTemplates.storeConnectionId, id),
                  eq(naverDeliveryPolicyTemplates.userId, userId),
                ),
              ),
          ),
        );
      const [removed] = await tx
        .delete(naverStoreConnections)
        .where(
          and(
            eq(naverStoreConnections.id, id),
            eq(naverStoreConnections.userId, userId),
          ),
        )
        .returning();
      if (!removed) return null;
      if (removed.isDefault) {
        const [next] = await tx
          .select({ id: naverStoreConnections.id })
          .from(naverStoreConnections)
          .where(eq(naverStoreConnections.userId, userId))
          .orderBy(asc(naverStoreConnections.createdAt))
          .limit(1);
        if (next) {
          await tx
            .update(naverStoreConnections)
            .set({ isDefault: true, updatedAt: new Date() })
            .where(eq(naverStoreConnections.id, next.id));
        }
      }
      return removed;
    });
  }
}

export class NaverStoreConnectionLimitError extends Error {}
