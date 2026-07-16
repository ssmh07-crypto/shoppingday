import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  productAuditLogs,
  productCategories,
  products,
  productSupplierLinks,
  supplierProducts,
  suppliers,
  type EditedOptions,
  type ProductRow,
  type SelectedImage,
} from "@/lib/db/schema";
import type { DraftInput } from "./product-domain";

export type ProductEditorRecord = {
  product: ProductRow;
  supplier: {
    code: string;
    name: string;
    externalProductId: string;
    originalName: string | null;
    supplierPrice: string | null;
    currency: string;
    availability: string;
    originalImages: string[];
    originalOptions: Array<{ name: string; price: number | null }>;
    rawDescription: string | null;
    supplierCreatedAt: Date | null;
    supplierUpdatedAt: Date | null;
    lastSyncedAt: Date;
  };
};
export type ListQuery = {
  ownerId: string;
  search?: string;
  filter?: string;
  sort?: string;
  page: number;
  pageSize: number;
};

export class ProductEditRepository {
  async list(query: ListQuery) {
    const ownership = or(
      eq(products.ownerId, query.ownerId),
      isNull(products.ownerId),
    )!;
    const search = query.search?.trim();
    const conditions = [ownership];
    if (search)
      conditions.push(
        or(
          ilike(products.title, `%${search}%`),
          ilike(supplierProducts.originalName, `%${search}%`),
          ilike(supplierProducts.externalProductId, `%${search}%`),
          sql`${products.id}::text ilike ${`%${search}%`}`,
        )!,
      );
    if (["draft", "editing", "ready"].includes(query.filter ?? ""))
      conditions.push(
        eq(products.status, query.filter as "draft" | "editing" | "ready"),
      );
    if (query.filter === "sold_out")
      conditions.push(eq(supplierProducts.availability, "sold_out"));
    if (query.filter === "missing_price")
      conditions.push(isNull(products.sellingPrice));
    if (query.filter === "missing_category")
      conditions.push(isNull(products.categoryId));
    if (query.filter === "missing_image")
      conditions.push(
        sql`not jsonb_path_exists(${products.selectedImages}, '$[*] ? (@.enabled == true)')`,
      );
    if (query.filter === "option_review")
      conditions.push(
        sql`jsonb_array_length(${products.editedOptions}->'groups') > 0 and not jsonb_path_exists(${products.editedOptions}->'combinations', '$[*] ? (@.enabled == true)')`,
      );
    const order =
      query.sort === "oldest"
        ? asc(products.createdAt)
        : query.sort === "updated"
          ? desc(products.updatedAt)
          : query.sort === "cost"
            ? asc(supplierProducts.supplierPrice)
            : query.sort === "price"
              ? asc(products.sellingPrice)
              : query.sort === "title"
                ? asc(products.title)
                : desc(products.createdAt);
    const where = and(...conditions);
    const base = getDb()
      .select({
        id: products.id,
        status: products.status,
        title: products.title,
        sellingPrice: products.sellingPrice,
        selectedImages: products.selectedImages,
        categoryId: products.categoryId,
        updatedAt: products.updatedAt,
        supplierCode: suppliers.code,
        supplierName: suppliers.name,
        externalProductId: supplierProducts.externalProductId,
        originalName: supplierProducts.originalName,
        supplierPrice: supplierProducts.supplierPrice,
        availability: supplierProducts.availability,
        lastSyncedAt: supplierProducts.lastSyncedAt,
      })
      .from(products)
      .innerJoin(
        productSupplierLinks,
        eq(productSupplierLinks.productId, products.id),
      )
      .innerJoin(
        supplierProducts,
        eq(supplierProducts.id, productSupplierLinks.supplierProductId),
      )
      .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
      .where(where);
    const [items, countRows, statsRows] = await Promise.all([
      base
        .orderBy(order)
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      getDb()
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .innerJoin(
          productSupplierLinks,
          eq(productSupplierLinks.productId, products.id),
        )
        .innerJoin(
          supplierProducts,
          eq(supplierProducts.id, productSupplierLinks.supplierProductId),
        )
        .where(where),
      getDb()
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${supplierProducts.availability} = 'active')::int`,
          ready: sql<number>`count(*) filter (where ${products.status} = 'ready')::int`,
          missingPrice: sql<number>`count(*) filter (where ${products.sellingPrice} is null)::int`,
        })
        .from(products)
        .innerJoin(
          productSupplierLinks,
          eq(productSupplierLinks.productId, products.id),
        )
        .innerJoin(
          supplierProducts,
          eq(supplierProducts.id, productSupplierLinks.supplierProductId),
        )
        .where(ownership),
    ]);
    return {
      items,
      total: countRows[0]?.count ?? 0,
      page: query.page,
      pageSize: query.pageSize,
      stats: statsRows[0] ?? { total: 0, active: 0, ready: 0, missingPrice: 0 },
    };
  }

  async find(id: string, ownerId: string): Promise<ProductEditorRecord | null> {
    const [row] = await getDb()
      .select({
        product: products,
        supplier: {
          code: suppliers.code,
          name: suppliers.name,
          externalProductId: supplierProducts.externalProductId,
          originalName: supplierProducts.originalName,
          supplierPrice: supplierProducts.supplierPrice,
          currency: supplierProducts.currency,
          availability: supplierProducts.availability,
          originalImages: supplierProducts.originalImages,
          originalOptions: supplierProducts.originalOptions,
          rawDescription: supplierProducts.rawDescription,
          supplierCreatedAt: supplierProducts.supplierCreatedAt,
          supplierUpdatedAt: supplierProducts.supplierUpdatedAt,
          lastSyncedAt: supplierProducts.lastSyncedAt,
        },
      })
      .from(products)
      .innerJoin(
        productSupplierLinks,
        eq(productSupplierLinks.productId, products.id),
      )
      .innerJoin(
        supplierProducts,
        eq(supplierProducts.id, productSupplierLinks.supplierProductId),
      )
      .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
      .where(
        and(
          eq(products.id, id),
          or(eq(products.ownerId, ownerId), isNull(products.ownerId)),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async categories() {
    return getDb()
      .select({ id: productCategories.id, name: productCategories.name })
      .from(productCategories)
      .where(eq(productCategories.active, true))
      .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));
  }

  async save(
    id: string,
    ownerId: string,
    input: DraftInput,
    status: ProductRow["status"],
    changedFields: string[],
    action: string,
    validationErrors: Record<string, string> = {},
    readyAt: Date | null = null,
  ) {
    return getDb().transaction(async (tx) => {
      const [old] = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.id, id),
            or(eq(products.ownerId, ownerId), isNull(products.ownerId)),
          ),
        )
        .limit(1);
      if (!old) return { kind: "not_found" as const };
      if (old.draftVersion !== input.draftVersion)
        return { kind: "conflict" as const };
      const [product] = await tx
        .update(products)
        .set({
          ownerId,
          title: input.title,
          searchTags: input.searchTags,
          sellingPrice: input.sellingPrice,
          currency: input.currency,
          description: input.description,
          categoryId: input.categoryId,
          selectedImages: input.selectedImages,
          editedOptions: input.editedOptions,
          status,
          validationErrors,
          readyAt,
          draftVersion: sql`${products.draftVersion}+1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(products.id, id),
            eq(products.draftVersion, input.draftVersion),
            or(eq(products.ownerId, ownerId), isNull(products.ownerId)),
          ),
        )
        .returning();
      if (!product) return { kind: "conflict" as const };
      await tx
        .insert(productAuditLogs)
        .values({
          actorId: ownerId,
          entityId: id,
          action,
          changedFields,
          oldValues: summarize(old, changedFields),
          newValues: summarize(product, changedFields),
          requestId: randomUUID(),
        });
      return { kind: "ok" as const, product };
    });
  }

  async reset(
    id: string,
    ownerId: string,
    version: number,
    kind: "images" | "options",
    value: SelectedImage[] | EditedOptions,
  ) {
    return getDb().transaction(async (tx) => {
      const set =
        kind === "images"
          ? { selectedImages: value as SelectedImage[] }
          : { editedOptions: value as EditedOptions };
      const [product] = await tx
        .update(products)
        .set({
          ...set,
          ownerId,
          status: "editing",
          readyAt: null,
          draftVersion: sql`${products.draftVersion}+1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(products.id, id),
            eq(products.draftVersion, version),
            or(eq(products.ownerId, ownerId), isNull(products.ownerId)),
          ),
        )
        .returning();
      if (!product) return { kind: "conflict" as const };
      await tx
        .insert(productAuditLogs)
        .values({
          actorId: ownerId,
          entityId: id,
          action:
            kind === "images"
              ? "product_images_reset"
              : "product_options_reset",
          changedFields: [
            kind === "images" ? "selectedImages" : "editedOptions",
          ],
          requestId: randomUUID(),
        });
      return { kind: "ok" as const, product };
    });
  }
}

function summarize(row: ProductRow, fields: string[]) {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = row[field as keyof ProductRow];
    result[field] =
      field === "description"
        ? `[HTML ${String(value).length} chars]`
        : field === "editedOptions" || field === "selectedImages"
          ? `[${Array.isArray(value) ? value.length : "structured"} items]`
          : value;
  }
  return result;
}
