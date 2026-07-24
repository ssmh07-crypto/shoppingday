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

export class NaverPublicationPolicyRepository {
  constructor(private readonly database: Database) {}

  async getDefault(userId: string) {
    const [row] = await this.database
      .select({ policy: channelPublicationPolicies.policy })
      .from(channelPublicationPolicies)
      .where(
        and(
          eq(channelPublicationPolicies.userId, userId),
          eq(channelPublicationPolicies.channel, "naver"),
        ),
      )
      .limit(1);
    return parseNaverPublicationPolicy(row?.policy);
  }

  async saveDefault(userId: string, policy: NaverPublicationPolicyData) {
    const parsed = parseNaverPublicationPolicy(policy);
    await this.database
      .insert(channelPublicationPolicies)
      .values({ userId, channel: "naver", policy: parsed })
      .onConflictDoUpdate({
        target: [
          channelPublicationPolicies.userId,
          channelPublicationPolicies.channel,
        ],
        set: { policy: parsed, updatedAt: new Date() },
      });
    return parsed;
  }

  async getForProduct(productId: string, userId: string) {
    const [defaults, owned, row] = await Promise.all([
      this.getDefault(userId),
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
  ) {
    const [owned] = await this.database
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.ownerId, userId)))
      .limit(1);
    if (!owned) throw new ProductNotFoundError();
    const parsed = parseNaverPublicationPolicyOverrides(overrides);
    await this.database
      .insert(productPublicationPolicyOverrides)
      .values({ productId, channel: "naver", policy: parsed })
      .onConflictDoUpdate({
        target: [
          productPublicationPolicyOverrides.productId,
          productPublicationPolicyOverrides.channel,
        ],
        set: { policy: parsed, updatedAt: new Date() },
      });
    const defaults = await this.getDefault(userId);
    return { defaults, overrides: parsed, effective: mergeNaverPublicationPolicy(defaults, parsed) };
  }
}
