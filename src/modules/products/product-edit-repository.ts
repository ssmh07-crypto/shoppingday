import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db";
import {
  productAuditLogs,
  productCategories,
  products,
  naverCommerceCategories,
  productSupplierLinks,
  supplierProducts,
  suppliers,
  type EditedOptions,
  type ProductRow,
  type SelectedImage,
} from "@/lib/db/schema";
import type { DraftInput } from "./product-domain";

export type ProductEditorRecord = {
  product: Pick<
    ProductRow,
    | "id"
    | "status"
    | "title"
    | "searchTags"
    | "sellingPrice"
    | "currency"
    | "description"
    | "categoryId"
    | "naverCategoryId"
    | "selectedImages"
    | "editedOptions"
    | "draftVersion"
    | "readyAt"
    | "updatedAt"
  >;
  naverCategory: {
    id: string;
    name: string;
    wholeCategoryName: string;
  } | null;
  supplier: {
    name: string;
    externalProductId: string;
    originalName: string | null;
    supplierPrice: string | null;
    currency: string;
    availability: string;
    originalImages: string[];
    originalOptions: Array<{ name: string; price: number | null }>;
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
  constructor(private readonly database: Database = getDb()) {}

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
      conditions.push(isNull(products.naverCategoryId));
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
    const base = this.database
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
      this.database
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
      this.database
        .select({
          total: sql<number>`count(*)::int`,
          available: sql<number>`count(*) filter (where ${supplierProducts.availability} <> 'sold_out')::int`,
          soldOut: sql<number>`count(*) filter (where ${supplierProducts.availability} = 'sold_out')::int`,
          // Marketplace publication tracking will be connected in the next phase.
          // Until then every local product is, accurately, unregistered.
          unregistered: sql<number>`count(*)::int`,
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
      stats: statsRows[0] ?? {
        total: 0,
        available: 0,
        soldOut: 0,
        unregistered: 0,
      },
    };
  }

  async find(id: string, ownerId: string): Promise<ProductEditorRecord | null> {
    const [row] = await this.database
      .select({
        product: {
          id: products.id,
          status: products.status,
          title: products.title,
          searchTags: products.searchTags,
          sellingPrice: products.sellingPrice,
          currency: products.currency,
          description: products.description,
          categoryId: products.categoryId,
          naverCategoryId: products.naverCategoryId,
          selectedImages: products.selectedImages,
          editedOptions: products.editedOptions,
          draftVersion: products.draftVersion,
          readyAt: products.readyAt,
          updatedAt: products.updatedAt,
        },
        naverCategory: {
          id: naverCommerceCategories.id,
          name: naverCommerceCategories.name,
          wholeCategoryName: naverCommerceCategories.wholeCategoryName,
        },
        supplier: {
          name: suppliers.name,
          externalProductId: supplierProducts.externalProductId,
          originalName: supplierProducts.originalName,
          supplierPrice: supplierProducts.supplierPrice,
          currency: supplierProducts.currency,
          availability: supplierProducts.availability,
          originalImages: supplierProducts.originalImages,
          originalOptions: supplierProducts.originalOptions,
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
      .leftJoin(
        naverCommerceCategories,
        eq(naverCommerceCategories.id, products.naverCategoryId),
      )
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
    return this.database
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
    return this.database.transaction(async (tx) => {
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
      if (input.naverCategoryId) {
        const [category] = await tx
          .select({ id: naverCommerceCategories.id })
          .from(naverCommerceCategories)
          .where(
            and(
              eq(naverCommerceCategories.id, input.naverCategoryId),
              eq(naverCommerceCategories.last, true),
            ),
          )
          .limit(1);
        if (!category) return { kind: "invalid_naver_category" as const };
      }
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
          naverCategoryId: input.naverCategoryId,
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
      await tx.insert(productAuditLogs).values({
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
    return this.database.transaction(async (tx) => {
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
      await tx.insert(productAuditLogs).values({
        actorId: ownerId,
        entityId: id,
        action:
          kind === "images" ? "product_images_reset" : "product_options_reset",
        changedFields: [kind === "images" ? "selectedImages" : "editedOptions"],
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
