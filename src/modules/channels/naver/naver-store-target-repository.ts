import "server-only";
import { and, eq, isNull, or } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  naverStoreConnections,
  productNaverStoreTargets,
  products,
} from "@/lib/db/schema";
import { ProductNotFoundError } from "@/modules/products/product-errors";
import { NaverStoreSettingsRepository } from "./naver-store-settings-repository";

export class NaverStoreTargetRepository {
  constructor(private readonly database: Database) {}

  async getForProduct(productId: string, userId: string) {
    const [owned, target] = await Promise.all([
      this.database
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
      this.database
        .select({ connection: naverStoreConnections })
        .from(productNaverStoreTargets)
        .innerJoin(
          naverStoreConnections,
          eq(
            naverStoreConnections.id,
            productNaverStoreTargets.storeConnectionId,
          ),
        )
        .where(
          and(
            eq(productNaverStoreTargets.productId, productId),
            eq(naverStoreConnections.userId, userId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]?.connection),
    ]);
    if (!owned) throw new ProductNotFoundError();
    return (
      target ??
      (await new NaverStoreSettingsRepository(this.database).get(userId))
    );
  }

  async save(productId: string, userId: string, storeConnectionId: string) {
    const [owned, store] = await Promise.all([
      this.database
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
      new NaverStoreSettingsRepository(this.database).getById(
        userId,
        storeConnectionId,
      ),
    ]);
    if (!owned) throw new ProductNotFoundError();
    if (!store) throw new NaverStoreTargetNotFoundError();
    await this.database
      .insert(productNaverStoreTargets)
      .values({ productId, storeConnectionId })
      .onConflictDoUpdate({
        target: productNaverStoreTargets.productId,
        set: { storeConnectionId, updatedAt: new Date() },
      });
    return store;
  }
}

export class NaverStoreTargetNotFoundError extends Error {}
