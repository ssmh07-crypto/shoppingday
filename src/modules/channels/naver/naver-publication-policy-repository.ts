import "server-only";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  channelPublicationPolicies,
  productPublicationPolicyOverrides,
  products,
  type NaverPublicationPolicyData,
  type NaverPublicationPolicyOverrides,
} from "@/lib/db/schema";
import {
  mergeNaverPublicationPolicy,
  parseNaverPublicationPolicy,
  parseNaverPublicationPolicyOverrides,
} from "./naver-publication-policy";
import { ProductNotFoundError } from "@/modules/products/product-errors";
import { NaverStoreSettingsRepository } from "./naver-store-settings-repository";

export class NaverPublicationPolicyRepository {
  constructor(private readonly database: Database) {}

  async getDefault(userId: string, storeConnectionId?: string) {
    const storeId = await this.resolveStoreId(userId, storeConnectionId);
    const [row] = await this.database
      .select({ policy: channelPublicationPolicies.policy })
      .from(channelPublicationPolicies)
      .where(
        and(
          eq(channelPublicationPolicies.userId, userId),
          eq(channelPublicationPolicies.channel, "naver"),
          eq(channelPublicationPolicies.storeConnectionId, storeId),
        ),
      )
      .limit(1);
    return parseNaverPublicationPolicy(row?.policy);
  }

  async saveDefault(
    userId: string,
    policy: NaverPublicationPolicyData,
    storeConnectionId?: string,
  ) {
    const storeId = await this.resolveStoreId(userId, storeConnectionId);
    const parsed = parseNaverPublicationPolicy(policy);
    await this.database
      .insert(channelPublicationPolicies)
      .values({
        userId,
        channel: "naver",
        storeConnectionId: storeId,
        policy: parsed,
      })
      .onConflictDoUpdate({
        target: [
          channelPublicationPolicies.userId,
          channelPublicationPolicies.channel,
          channelPublicationPolicies.storeConnectionId,
        ],
        set: { policy: parsed, updatedAt: new Date() },
      });
    return parsed;
  }

  async getForProduct(
    productId: string,
    userId: string,
    storeConnectionId?: string,
  ) {
    const storeId = await this.resolveStoreId(userId, storeConnectionId);
    const [defaults, owned, row] = await Promise.all([
      this.getDefault(userId, storeId),
      this.database
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.ownerId, userId)))
        .limit(1)
        .then((rows) => rows[0]),
      this.database
        .select({ policy: productPublicationPolicyOverrides.policy })
        .from(productPublicationPolicyOverrides)
        .innerJoin(products, eq(products.id, productPublicationPolicyOverrides.productId))
        .where(
          and(
            eq(productPublicationPolicyOverrides.productId, productId),
            eq(productPublicationPolicyOverrides.channel, "naver"),
            eq(productPublicationPolicyOverrides.storeConnectionId, storeId),
            eq(products.ownerId, userId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
    ]);
    if (!owned) throw new ProductNotFoundError();
    const overrides = parseNaverPublicationPolicyOverrides(row?.policy);
    return { defaults, overrides, effective: mergeNaverPublicationPolicy(defaults, overrides) };
  }

  async saveProductOverrides(
    productId: string,
    userId: string,
    overrides: NaverPublicationPolicyOverrides,
    storeConnectionId?: string,
  ) {
    const storeId = await this.resolveStoreId(userId, storeConnectionId);
    const [owned] = await this.database
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.ownerId, userId)))
      .limit(1);
    if (!owned) throw new ProductNotFoundError();
    const parsed = parseNaverPublicationPolicyOverrides(overrides);
    await this.database
      .insert(productPublicationPolicyOverrides)
      .values({
        productId,
        channel: "naver",
        storeConnectionId: storeId,
        policy: parsed,
      })
      .onConflictDoUpdate({
        target: [
          productPublicationPolicyOverrides.productId,
          productPublicationPolicyOverrides.channel,
          productPublicationPolicyOverrides.storeConnectionId,
        ],
        set: { policy: parsed, updatedAt: new Date() },
      });
    const defaults = await this.getDefault(userId, storeId);
    return { defaults, overrides: parsed, effective: mergeNaverPublicationPolicy(defaults, parsed) };
  }

  private async resolveStoreId(userId: string, storeConnectionId?: string) {
    const stores = new NaverStoreSettingsRepository(this.database);
    const store = storeConnectionId
      ? await stores.getById(userId, storeConnectionId)
      : await stores.get(userId);
    if (!store) {
      throw new Error("스마트스토어 연결을 먼저 설정해 주세요.");
    }
    return store.id;
  }
}
