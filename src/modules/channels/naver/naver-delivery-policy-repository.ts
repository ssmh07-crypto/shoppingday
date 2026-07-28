import "server-only";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  naverDeliveryPolicyTemplates,
  naverStoreConnections,
  productNaverDeliveryPolicySelections,
  productNaverStoreTargets,
  products,
} from "@/lib/db/schema";
import { ProductNotFoundError } from "@/modules/products/product-errors";
import {
  resolveDeliveryPolicyStoreTarget,
  type NaverDeliveryPolicyTemplateInput,
} from "./naver-delivery-policy";

export class NaverDeliveryPolicyRepository {
  constructor(private readonly database: Database) {}

  async list(userId: string, storeConnectionId: string) {
    return this.database
      .select({
        id: naverDeliveryPolicyTemplates.id,
        storeConnectionId: naverDeliveryPolicyTemplates.storeConnectionId,
        policyCode: naverDeliveryPolicyTemplates.policyCode,
        name: naverDeliveryPolicyTemplates.name,
        deliveryInfo: naverDeliveryPolicyTemplates.deliveryInfo,
        createdAt: naverDeliveryPolicyTemplates.createdAt,
        updatedAt: naverDeliveryPolicyTemplates.updatedAt,
      })
      .from(naverDeliveryPolicyTemplates)
      .innerJoin(
        naverStoreConnections,
        eq(
          naverStoreConnections.id,
          naverDeliveryPolicyTemplates.storeConnectionId,
        ),
      )
      .where(
        and(
          eq(naverDeliveryPolicyTemplates.storeConnectionId, storeConnectionId),
          eq(naverDeliveryPolicyTemplates.userId, userId),
          eq(naverStoreConnections.userId, userId),
        ),
      )
      .orderBy(asc(naverDeliveryPolicyTemplates.policyCode));
  }

  async listSummaries(userId: string, storeConnectionId: string) {
    return this.database
      .select({
        id: naverDeliveryPolicyTemplates.id,
        policyCode: naverDeliveryPolicyTemplates.policyCode,
        name: naverDeliveryPolicyTemplates.name,
      })
      .from(naverDeliveryPolicyTemplates)
      .innerJoin(
        naverStoreConnections,
        eq(
          naverStoreConnections.id,
          naverDeliveryPolicyTemplates.storeConnectionId,
        ),
      )
      .where(
        and(
          eq(naverDeliveryPolicyTemplates.storeConnectionId, storeConnectionId),
          eq(naverDeliveryPolicyTemplates.userId, userId),
          eq(naverStoreConnections.userId, userId),
        ),
      )
      .orderBy(asc(naverDeliveryPolicyTemplates.policyCode));
  }

  async create(
    userId: string,
    storeConnectionId: string,
    input: NaverDeliveryPolicyTemplateInput,
  ) {
    return this.database.transaction(async (tx) => {
      const [store] = await tx
        .select({ id: naverStoreConnections.id })
        .from(naverStoreConnections)
        .where(
          and(
            eq(naverStoreConnections.id, storeConnectionId),
            eq(naverStoreConnections.userId, userId),
          ),
        )
        .limit(1);
      if (!store) throw new NaverDeliveryPolicyStoreNotFoundError();

      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${storeConnectionId}, 0))`,
      );
      const [last] = await tx
        .select({ policyCode: naverDeliveryPolicyTemplates.policyCode })
        .from(naverDeliveryPolicyTemplates)
        .where(
          eq(
            naverDeliveryPolicyTemplates.storeConnectionId,
            storeConnectionId,
          ),
        )
        .orderBy(desc(naverDeliveryPolicyTemplates.policyCode))
        .limit(1);
      const next = Number(last?.policyCode ?? "0") + 1;
      if (next > 999_999) throw new NaverDeliveryPolicyLimitError();

      const [created] = await tx
        .insert(naverDeliveryPolicyTemplates)
        .values({
          userId,
          storeConnectionId,
          policyCode: String(next).padStart(6, "0"),
          name: input.name,
          deliveryInfo: input.deliveryInfo,
        })
        .returning();
      return created!;
    });
  }

  async update(
    userId: string,
    id: string,
    input: NaverDeliveryPolicyTemplateInput,
  ) {
    const [updated] = await this.database
      .update(naverDeliveryPolicyTemplates)
      .set({
        name: input.name,
        deliveryInfo: input.deliveryInfo,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(naverDeliveryPolicyTemplates.id, id),
          eq(naverDeliveryPolicyTemplates.userId, userId),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async remove(userId: string, id: string) {
    try {
      const [removed] = await this.database
        .delete(naverDeliveryPolicyTemplates)
        .where(
          and(
            eq(naverDeliveryPolicyTemplates.id, id),
            eq(naverDeliveryPolicyTemplates.userId, userId),
          ),
        )
        .returning();
      return removed ?? null;
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new NaverDeliveryPolicyInUseError();
      }
      throw error;
    }
  }

  async getSelection(productId: string, userId: string) {
    const [row] = await this.database
      .select({
        id: naverDeliveryPolicyTemplates.id,
        storeConnectionId: naverDeliveryPolicyTemplates.storeConnectionId,
        policyCode: naverDeliveryPolicyTemplates.policyCode,
        name: naverDeliveryPolicyTemplates.name,
        deliveryInfo: naverDeliveryPolicyTemplates.deliveryInfo,
      })
      .from(productNaverDeliveryPolicySelections)
      .innerJoin(
        products,
        eq(products.id, productNaverDeliveryPolicySelections.productId),
      )
      .innerJoin(
        naverDeliveryPolicyTemplates,
        eq(
          naverDeliveryPolicyTemplates.id,
          productNaverDeliveryPolicySelections.deliveryPolicyId,
        ),
      )
      .where(
        and(
          eq(productNaverDeliveryPolicySelections.productId, productId),
          or(eq(products.ownerId, userId), isNull(products.ownerId)),
          eq(naverDeliveryPolicyTemplates.userId, userId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async saveSelection(
    productId: string,
    userId: string,
    deliveryPolicyId: string,
  ) {
    return this.database.transaction(async (tx) => {
      const [owned, target, policy, defaultStore] = await Promise.all([
        tx
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              eq(products.id, productId),
              or(eq(products.ownerId, userId), isNull(products.ownerId)),
            ),
          )
          .limit(1)
          .then((rows) => rows[0]),
        tx
          .select({ storeConnectionId: productNaverStoreTargets.storeConnectionId })
          .from(productNaverStoreTargets)
          .where(eq(productNaverStoreTargets.productId, productId))
          .limit(1)
          .then((rows) => rows[0]),
        tx
          .select()
          .from(naverDeliveryPolicyTemplates)
          .where(
            and(
              eq(naverDeliveryPolicyTemplates.id, deliveryPolicyId),
              eq(naverDeliveryPolicyTemplates.userId, userId),
            ),
          )
          .limit(1)
          .then((rows) => rows[0]),
        tx
          .select({ id: naverStoreConnections.id })
          .from(naverStoreConnections)
          .where(eq(naverStoreConnections.userId, userId))
          .orderBy(
            desc(naverStoreConnections.isDefault),
            asc(naverStoreConnections.createdAt),
          )
          .limit(1)
          .then((rows) => rows[0]),
      ]);
      if (!owned) throw new ProductNotFoundError();
      if (!policy) {
        throw new NaverDeliveryPolicyNotFoundError();
      }
      const targetStoreId = resolveDeliveryPolicyStoreTarget(
        target?.storeConnectionId ?? null,
        defaultStore?.id ?? null,
        policy.storeConnectionId,
      );
      if (!targetStoreId) throw new NaverDeliveryPolicyNotFoundError();
      if (!target) {
        await tx
          .insert(productNaverStoreTargets)
          .values({ productId, storeConnectionId: targetStoreId })
          .onConflictDoNothing({
            target: productNaverStoreTargets.productId,
          });
      }
      await tx
        .insert(productNaverDeliveryPolicySelections)
        .values({ productId, deliveryPolicyId })
        .onConflictDoUpdate({
          target: productNaverDeliveryPolicySelections.productId,
          set: { deliveryPolicyId, updatedAt: new Date() },
        });
      return policy;
    });
  }
}

function isForeignKeyViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23503"
  );
}

export class NaverDeliveryPolicyStoreNotFoundError extends Error {}
export class NaverDeliveryPolicyNotFoundError extends Error {}
export class NaverDeliveryPolicyInUseError extends Error {}
export class NaverDeliveryPolicyLimitError extends Error {}
