import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/lib/db";
import {
  productAuditLogs,
  products,
  productSupplierLinks,
  sourcingResearches,
  supplierProducts,
  suppliers,
} from "@/lib/db/schema";
import {
  imagesFromSupplier,
  optionsFromSupplier,
  sanitizeDescription,
} from "./product-domain";
import {
  ProductNotFoundError,
  ProductValidationError,
} from "./product-errors";

export const sourcingSupplierSourceSearchSchema = z.object({
  query: z.string().trim().min(1).max(200),
});

export const sourcingSupplierSourceApplySchema = z.object({
  supplierProductId: z.uuid(),
});

export type SourcingSupplierSourceCandidate = {
  supplierProductId: string;
  productId: string;
  externalProductId: string;
  originalName: string;
  supplierPrice: number | null;
  thumbnailUrl: string | null;
  imageCount: number;
  optionCount: number;
  hasDescription: boolean;
  url: string | null;
};

export class SourcingSupplierSourceService {
  constructor(private readonly database: Database) {}

  async search(
    productId: string,
    ownerId: string,
    rawQuery: unknown,
  ): Promise<SourcingSupplierSourceCandidate[]> {
    await this.requireSourcingProduct(productId, ownerId);
    const { query } = sourcingSupplierSourceSearchSchema.parse({
      query: rawQuery,
    });
    const externalProductId = extractZicgamProductId(query);
    const ownership = or(eq(products.ownerId, ownerId), isNull(products.ownerId))!;
    const match = externalProductId
      ? eq(supplierProducts.externalProductId, externalProductId)
      : or(
          ilike(supplierProducts.originalName, `%${query}%`),
          eq(supplierProducts.externalProductId, query),
        )!;
    const rows = await this.database
      .select({
        supplierProductId: supplierProducts.id,
        productId: products.id,
        externalProductId: supplierProducts.externalProductId,
        originalName: supplierProducts.originalName,
        supplierPrice: supplierProducts.supplierPrice,
        originalImages: supplierProducts.originalImages,
        originalOptions: supplierProducts.originalOptions,
        rawDescription: supplierProducts.rawDescription,
        rawPayload: supplierProducts.rawPayload,
      })
      .from(supplierProducts)
      .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
      .innerJoin(
        productSupplierLinks,
        eq(productSupplierLinks.supplierProductId, supplierProducts.id),
      )
      .innerJoin(products, eq(products.id, productSupplierLinks.productId))
      .where(and(eq(suppliers.code, "zicgam"), ownership, match))
      .orderBy(desc(supplierProducts.lastSyncedAt))
      .limit(20);

    return rows.map((row) => ({
      supplierProductId: row.supplierProductId,
      productId: row.productId,
      externalProductId: row.externalProductId,
      originalName: row.originalName?.trim() || `직감 ${row.externalProductId}`,
      supplierPrice:
        row.supplierPrice === null ? null : Number(row.supplierPrice),
      thumbnailUrl: row.originalImages[0] ?? null,
      imageCount: row.originalImages.length,
      optionCount: row.originalOptions.length,
      hasDescription: Boolean(row.rawDescription?.trim()),
      url: sourceUrl(row.rawPayload),
    }));
  }

  async apply(
    productId: string,
    ownerId: string,
    raw: unknown,
  ) {
    const { supplierProductId } = sourcingSupplierSourceApplySchema.parse(raw);
    return this.database.transaction(async (tx) => {
      const [current] = await tx
        .select({
          product: products,
          supplierProduct: supplierProducts,
          supplierCode: suppliers.code,
        })
        .from(products)
        .innerJoin(
          sourcingResearches,
          eq(sourcingResearches.registrationProductId, products.id),
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
        .where(
          and(
            eq(products.id, productId),
            eq(sourcingResearches.ownerId, ownerId),
          ),
        )
        .limit(1)
        .for("update");
      if (!current) throw new ProductNotFoundError();
      if (current.supplierCode !== "sourcing") {
        throw new ProductValidationError({
          supplierSource: "소싱조사에서 만든 등록 초안에서만 사용할 수 있습니다.",
        });
      }

      const [source] = await tx
        .select({
          supplierProduct: supplierProducts,
          supplierCode: suppliers.code,
        })
        .from(supplierProducts)
        .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
        .innerJoin(
          productSupplierLinks,
          eq(productSupplierLinks.supplierProductId, supplierProducts.id),
        )
        .innerJoin(products, eq(products.id, productSupplierLinks.productId))
        .where(
          and(
            eq(supplierProducts.id, supplierProductId),
            eq(suppliers.code, "zicgam"),
            or(eq(products.ownerId, ownerId), isNull(products.ownerId)),
          ),
        )
        .limit(1);
      if (!source) {
        throw new ProductValidationError({
          supplierSource: "가져올 직감 상품을 찾지 못했습니다.",
        });
      }

      const sourceProduct = source.supplierProduct;
      const selectedImages = imagesFromSupplier(sourceProduct.originalImages);
      const editedOptions = optionsFromSupplier(sourceProduct.originalOptions);
      const description = sanitizeDescription(sourceProduct.rawDescription ?? "");
      const [updated] = await tx
        .update(products)
        .set({
          ownerId,
          description,
          selectedImages,
          editedOptions,
          status: "editing",
          readyAt: null,
          validationErrors: {},
          draftVersion: sql`${products.draftVersion}+1`,
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId))
        .returning({ id: products.id, draftVersion: products.draftVersion });
      if (!updated) throw new ProductNotFoundError();

      const targetUrl = sourceUrl(sourceProduct.rawPayload);
      await tx
        .update(supplierProducts)
        .set({
          originalName: sourceProduct.originalName,
          supplierPrice: sourceProduct.supplierPrice,
          currency: sourceProduct.currency,
          availability: sourceProduct.availability,
          originalImages: sourceProduct.originalImages,
          originalOptions: sourceProduct.originalOptions,
          rawDescription: sourceProduct.rawDescription,
          rawPayload: {
            ...current.supplierProduct.rawPayload,
            targetSupplierCode: "zicgam",
            targetSupplierProductId: sourceProduct.id,
            targetExternalProductId: sourceProduct.externalProductId,
            targetUrl,
            targetImportedAt: new Date().toISOString(),
          },
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(supplierProducts.id, current.supplierProduct.id));
      await tx.insert(productAuditLogs).values({
        actorId: ownerId,
        entityId: productId,
        action: "sourcing_supplier_source_applied",
        changedFields: ["description", "selectedImages", "editedOptions"],
        oldValues: {
          descriptionLength: current.product.description.length,
          imageCount: current.product.selectedImages.length,
          optionCount: current.product.editedOptions.combinations.length,
        },
        newValues: {
          sourceSupplier: "zicgam",
          sourceExternalProductId: sourceProduct.externalProductId,
          descriptionLength: description.length,
          imageCount: selectedImages.length,
          optionCount: editedOptions.combinations.length,
        },
        requestId: randomUUID(),
      });

      return {
        productId,
        product: {
          draftVersion: updated.draftVersion,
          status: "editing" as const,
          description,
          selectedImages,
          editedOptions,
        },
        source: {
          supplierProductId: sourceProduct.id,
          externalProductId: sourceProduct.externalProductId,
          originalName:
            sourceProduct.originalName?.trim() ||
            `직감 ${sourceProduct.externalProductId}`,
          supplierPrice:
            sourceProduct.supplierPrice === null
              ? null
              : Number(sourceProduct.supplierPrice),
          currency: sourceProduct.currency,
          availability: sourceProduct.availability,
          url: targetUrl,
          imageCount: selectedImages.length,
          optionCount: sourceProduct.originalOptions.length,
          hasDescription: Boolean(description),
        },
      };
    });
  }

  private async requireSourcingProduct(productId: string, ownerId: string) {
    const [row] = await this.database
      .select({ id: products.id })
      .from(products)
      .innerJoin(
        sourcingResearches,
        eq(sourcingResearches.registrationProductId, products.id),
      )
      .where(
        and(
          eq(products.id, productId),
          eq(sourcingResearches.ownerId, ownerId),
        ),
      )
      .limit(1);
    if (!row) throw new ProductNotFoundError();
  }
}

function extractZicgamProductId(value: string) {
  if (/^\d+$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.hostname !== "zicgam.com" && !url.hostname.endsWith(".zicgam.com")) {
      return null;
    }
    const productNo = url.searchParams.get("product_no");
    return productNo && /^\d+$/.test(productNo) ? productNo : null;
  } catch {
    return null;
  }
}

function sourceUrl(payload: Record<string, unknown>) {
  return typeof payload.url === "string" ? payload.url : null;
}
