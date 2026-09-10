import "server-only";
import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  products,
  productPublications,
  productSupplierLinks,
  supplierChangeApplications,
  supplierPriceApplications,
  supplierProducts,
  suppliers,
} from "@/lib/db/schema";

export const registeredSupplierCodes = [
  "dome",
  "zicgam",
  "ebulsamchon",
] as const;
export type RegisteredSupplierCode = (typeof registeredSupplierCodes)[number];
export const registeredNeeds = [
  "all",
  "sold_out",
  "changes",
  "price",
  "description",
] as const;
export type RegisteredNeed = (typeof registeredNeeds)[number];

export interface RegisteredProductManagementRow {
  productId: string;
  publicationId: string;
  title: string;
  sellingPrice: number;
  supplierCode: string;
  supplierName: string;
  externalProductId: string;
  originalName: string;
  supplierPrice: string | null;
  availability: string;
  lastSyncedAt: Date;
  originProductNo: string;
  channelProductNo: string | null;
  remoteStatusType: string | null;
  needsSoldOut: boolean;
  needsDiscontinued: boolean;
  needsPrice: boolean;
  needsDescription: boolean;
  targetPrice: number | null;
}

export async function listRegisteredProductManagement(
  database: Database,
  ownerId: string,
  input: {
    supplier?: RegisteredSupplierCode;
    need: RegisteredNeed;
    search?: string;
    page: number;
    pageSize: number;
  },
) {
  const activeTaskStatuses = sql`('pending', 'failed')`;
  const soldOutExists = sql<boolean>`exists (
    select 1 from ${supplierChangeApplications} task
    where task.product_id = ${products.id}
      and task.publication_id = ${productPublications.id}
      and task.kind = 'sold_out'
      and task.status in ${activeTaskStatuses}
  )`;
  const discontinuedExists = sql<boolean>`exists (
    select 1 from ${supplierChangeApplications} task
    where task.product_id = ${products.id}
      and task.publication_id = ${productPublications.id}
      and task.kind = 'discontinued'
      and task.status in ${activeTaskStatuses}
  )`;
  const descriptionExists = sql<boolean>`exists (
    select 1 from ${supplierChangeApplications} task
    where task.product_id = ${products.id}
      and task.publication_id = ${productPublications.id}
      and task.kind = 'description'
      and task.status in ${activeTaskStatuses}
  )`;
  const priceExists = sql<boolean>`exists (
    select 1 from ${supplierPriceApplications} task
    where task.product_id = ${products.id}
      and task.publication_id = ${productPublications.id}
      and task.status in ${activeTaskStatuses}
  )`;
  const baseCondition = and(
    eq(products.ownerId, ownerId),
    eq(productSupplierLinks.isPrimary, true),
    sql`${productPublications.originProductNo} is not null`,
    sql`${productPublications.status} <> 'deleted'`,
    sql`${productPublications.remoteStatusType} is distinct from 'DELETE'`,
    input.supplier ? eq(suppliers.code, input.supplier) : undefined,
    input.search
      ? or(
          ilike(products.title, `%${input.search}%`),
          ilike(supplierProducts.originalName, `%${input.search}%`),
          ilike(supplierProducts.externalProductId, `%${input.search}%`),
          ilike(productPublications.originProductNo, `%${input.search}%`),
        )
      : undefined,
    input.need === "sold_out"
      ? sql`(${soldOutExists} or ${discontinuedExists})`
      : input.need === "changes"
        ? sql`(${priceExists} or ${descriptionExists})`
        : input.need === "price"
          ? priceExists
          : input.need === "description"
            ? descriptionExists
            : undefined,
  );
  const [{ total }] = await database
    .select({ total: count() })
    .from(products)
    .innerJoin(
      productPublications,
      eq(productPublications.productId, products.id),
    )
    .innerJoin(
      productSupplierLinks,
      eq(productSupplierLinks.productId, products.id),
    )
    .innerJoin(
      supplierProducts,
      eq(supplierProducts.id, productSupplierLinks.supplierProductId),
    )
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(baseCondition);
  const rows = (await database
    .select({
      productId: products.id,
      publicationId: productPublications.id,
      title: products.title,
      sellingPrice: products.sellingPrice,
      supplierCode: suppliers.code,
      supplierName: suppliers.name,
      externalProductId: supplierProducts.externalProductId,
      originalName: supplierProducts.originalName,
      supplierPrice: supplierProducts.supplierPrice,
      availability: supplierProducts.availability,
      lastSyncedAt: supplierProducts.lastSyncedAt,
      originProductNo: productPublications.originProductNo,
      channelProductNo: productPublications.channelProductNo,
      remoteStatusType: productPublications.remoteStatusType,
      needsSoldOut: soldOutExists,
      needsDiscontinued: discontinuedExists,
      needsPrice: priceExists,
      needsDescription: descriptionExists,
      targetPrice: sql<number | null>`(
          select task.target_price from ${supplierPriceApplications} task
          where task.product_id = ${products.id}
            and task.publication_id = ${productPublications.id}
            and task.status in ${activeTaskStatuses}
          order by task.created_at desc limit 1
        )`,
    })
    .from(products)
    .innerJoin(
      productPublications,
      eq(productPublications.productId, products.id),
    )
    .innerJoin(
      productSupplierLinks,
      eq(productSupplierLinks.productId, products.id),
    )
    .innerJoin(
      supplierProducts,
      eq(supplierProducts.id, productSupplierLinks.supplierProductId),
    )
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(baseCondition)
    .orderBy(
      asc(suppliers.name),
      asc(products.title),
      asc(productPublications.id),
    )
    .limit(input.pageSize)
    .offset(
      (input.page - 1) * input.pageSize,
    )) as RegisteredProductManagementRow[];

  return { rows, total: Number(total) };
}
