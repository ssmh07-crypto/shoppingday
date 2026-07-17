import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db";
import {
  products,
  productSupplierLinks,
  supplierProducts,
  suppliers,
  type SupplierProductRow,
} from "@/lib/db/schema";
import type { SupplierProduct } from "@/modules/suppliers/core/types";
import {
  imagesFromSupplier,
  optionsFromSupplier,
  sanitizeDescription,
} from "./product-domain";

export interface ImportedProductRecord {
  productId: string;
  supplierProductId: string;
  supplierProduct: SupplierProductRow;
}

export const supplierEditableFields = [
  "title",
  "description",
  "images",
  "options",
] as const;
export type SupplierEditableField = (typeof supplierEditableFields)[number];

export interface ProductRepository {
  findImported(
    supplierCode: string,
    externalProductId: string,
  ): Promise<ImportedProductRecord | null>;
  listImported(supplierCode: string): Promise<ImportedProductRecord[]>;
  importSupplierProduct(
    product: SupplierProduct,
    ownerId: string,
  ): Promise<ImportedProductRecord>;
  updateSupplierProduct(
    supplierProductId: string,
    product: SupplierProduct,
    existing?: ImportedProductRecord,
    options?: { protectedFields?: SupplierEditableField[] },
  ): Promise<ImportedProductRecord>;
  findDetail(productId: string): Promise<ProductDetail | null>;
}

export interface ProductDetail {
  productId: string;
  productStatus: string;
  supplierCode: string;
  supplierName: string;
  supplierProduct: SupplierProductRow;
}

export class DrizzleProductRepository implements ProductRepository {
  constructor(private readonly database: Database = getDb()) {}

  async updateSupplierProduct(
    supplierProductId: string,
    product: SupplierProduct,
    existing?: ImportedProductRecord,
    options?: { protectedFields?: SupplierEditableField[] },
  ) {
    const imported =
      existing ??
      (await this.findImported(
        product.supplierCode,
        product.externalProductId,
      ));
    if (!imported) throw new Error("product_link_not_found");
    const protectedFields = new Set(
      options?.protectedFields ?? supplierEditableFields,
    );
    return this.database.transaction(async (tx) => {
      const [supplierProduct] = await tx
        .update(supplierProducts)
        .set({
          originalName: product.originalName,
          supplierPrice:
            product.supplierPrice === null
              ? null
              : String(product.supplierPrice),
          currency: product.currency,
          availability: product.availability,
          originalImages: product.images,
          originalOptions: product.options,
          rawDescription: product.rawDescription,
          rawPayload: product.rawPayload,
          supplierCreatedAt: product.supplierCreatedAt,
          supplierUpdatedAt: product.supplierUpdatedAt,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(supplierProducts.id, supplierProductId))
        .returning();
      if (!supplierProduct) throw new Error("supplier_product_not_found");

      const productUpdates = {
        ...(!protectedFields.has("title")
          ? { title: product.originalName ?? "" }
          : {}),
        ...(!protectedFields.has("description")
          ? { description: sanitizeDescription(product.rawDescription ?? "") }
          : {}),
        ...(!protectedFields.has("images")
          ? { selectedImages: imagesFromSupplier(product.images) }
          : {}),
        ...(!protectedFields.has("options")
          ? { editedOptions: optionsFromSupplier(product.options) }
          : {}),
      };
      if (Object.keys(productUpdates).length) {
        await tx
          .update(products)
          .set({
            ...productUpdates,
            status: "editing",
            readyAt: null,
            validationErrors: {},
            draftVersion: sql`${products.draftVersion}+1`,
            updatedAt: new Date(),
          })
          .where(eq(products.id, imported.productId));
      }
      return { ...imported, supplierProduct };
    });
  }

  async findImported(supplierCode: string, externalProductId: string) {
    const [row] = await this.database
      .select({
        productId: productSupplierLinks.productId,
        supplierProductId: supplierProducts.id,
        supplierProduct: supplierProducts,
      })
      .from(supplierProducts)
      .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
      .innerJoin(
        productSupplierLinks,
        eq(productSupplierLinks.supplierProductId, supplierProducts.id),
      )
      .where(
        and(
          eq(suppliers.code, supplierCode),
          eq(supplierProducts.externalProductId, externalProductId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async listImported(supplierCode: string) {
    return this.database
      .select({
        productId: productSupplierLinks.productId,
        supplierProductId: supplierProducts.id,
        supplierProduct: supplierProducts,
      })
      .from(supplierProducts)
      .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
      .innerJoin(
        productSupplierLinks,
        eq(productSupplierLinks.supplierProductId, supplierProducts.id),
      )
      .where(eq(suppliers.code, supplierCode));
  }

  async importSupplierProduct(product: SupplierProduct, ownerId: string) {
    try {
      return await this.database.transaction(async (tx) => {
        const [supplier] = await tx
          .select({ id: suppliers.id })
          .from(suppliers)
          .where(eq(suppliers.code, product.supplierCode))
          .limit(1);
        if (!supplier) throw new Error("supplier_not_configured");

        const [supplierProduct] = await tx
          .insert(supplierProducts)
          .values({
            supplierId: supplier.id,
            externalProductId: product.externalProductId,
            originalName: product.originalName,
            supplierPrice:
              product.supplierPrice === null
                ? null
                : String(product.supplierPrice),
            currency: product.currency,
            availability: product.availability,
            originalImages: product.images,
            originalOptions: product.options,
            rawDescription: product.rawDescription,
            rawPayload: product.rawPayload,
            supplierCreatedAt: product.supplierCreatedAt,
            supplierUpdatedAt: product.supplierUpdatedAt,
          })
          .returning();

        const [draft] = await tx
          .insert(products)
          .values({
            ownerId,
            status: "draft",
            title: product.originalName ?? "",
            description: sanitizeDescription(product.rawDescription ?? ""),
            selectedImages: imagesFromSupplier(product.images),
            editedOptions: optionsFromSupplier(product.options),
          })
          .returning({ id: products.id });
        await tx.insert(productSupplierLinks).values({
          productId: draft.id,
          supplierProductId: supplierProduct.id,
          isPrimary: true,
        });

        return {
          productId: draft.id,
          supplierProductId: supplierProduct.id,
          supplierProduct,
        };
      });
    } catch (error) {
      // Concurrent requests can both pass the initial read. Resolve the unique
      // constraint race to the record committed by the winning transaction.
      if (isUniqueViolation(error)) {
        const existing = await this.findImported(
          product.supplierCode,
          product.externalProductId,
        );
        if (existing) return existing;
      }
      throw error;
    }
  }

  async findDetail(productId: string): Promise<ProductDetail | null> {
    const [row] = await this.database
      .select({
        productId: products.id,
        productStatus: products.status,
        supplierCode: suppliers.code,
        supplierName: suppliers.name,
        supplierProduct: supplierProducts,
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
      .where(eq(products.id, productId))
      .limit(1);
    return row ?? null;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505",
  );
}
