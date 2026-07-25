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
import { NaverDeliveryPolicyRepository } from "./naver-delivery-policy-repository";

export class NaverPublicationPolicyRepository {
  constructor(private readonly database: Database) {}

  async getDefault(userId: string, storeConnectionId?: string) {
    const storeId = await this.resolveStoreId(userId, storeConnectionId);
    return this.getDefaultForStore(userId, storeId);
  }

  private async getDefaultForStore(userId: string, storeId: string) {
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
    return {
      ...parseNaverPublicationPolicy(row?.policy),
      deliveryInfo: null,
    };
  }

  async saveDefault(
    userId: string,
    policy: NaverPublicationPolicyData,
    storeConnectionId?: string,
  ) {
    const storeId = await this.resolveStoreId(userId, storeConnectionId);
    const parsed = {
      ...parseNaverPublicationPolicy(policy),
      deliveryInfo: null,
    };
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
    const [defaults, owned, row, deliveryPolicy] = await Promise.all([
      this.getDefaultForStore(userId, storeId),
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
      new NaverDeliveryPolicyRepository(this.database).getSelection(
        productId,
        userId,
      ),
    ]);
    if (!owned) throw new ProductNotFoundError();
    const overrides = parseNaverPublicationPolicyOverrides(row?.policy);
    delete overrides.deliveryInfo;
    return {
      defaults,
      overrides,
      effective: {
        ...mergeNaverPublicationPolicy(defaults, overrides),
        deliveryInfo: deliveryPolicy?.deliveryInfo ?? null,
      },
      deliveryPolicy: deliveryPolicy
        ? {
            id: deliveryPolicy.id,
            policyCode: deliveryPolicy.policyCode,
            name: deliveryPolicy.name,
          }
        : null,
    };
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
    delete parsed.deliveryInfo;
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
    const [defaults, deliveryPolicy] = await Promise.all([
      this.getDefaultForStore(userId, storeId),
      new NaverDeliveryPolicyRepository(this.database).getSelection(
        productId,
        userId,
      ),
    ]);
    return {
      defaults,
      overrides: parsed,
      effective: {
        ...mergeNaverPublicationPolicy(defaults, parsed),
        deliveryInfo: deliveryPolicy?.deliveryInfo ?? null,
      },
      deliveryPolicy: deliveryPolicy
        ? {
            id: deliveryPolicy.id,
            policyCode: deliveryPolicy.policyCode,
            name: deliveryPolicy.name,
          }
        : null,
    };
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
