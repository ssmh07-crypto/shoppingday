import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db";
import {
  products,
  productSupplierLinks,
  supplierProducts,
  suppliers,
  productAuditLogs,
  productPublications,
  supplierPriceApplications,
  supplierChangeApplications,
  type SupplierProductRow,
} from "@/lib/db/schema";
import type { SupplierProduct } from "@/modules/suppliers/core/types";
import { preserveMarginPrice } from "@/modules/pricing/preserve-margin";
import { supplierChangeTargets } from "@/modules/suppliers/core/change-application-policy";
import {
  productSyncProtectedFields,
  type ProductSyncProtectedField,
} from "./product-processing-settings";
import {
  imagesFromSupplier,
  optionsFromSupplier,
  sanitizeDescription,
  supplierDescriptionIsUnedited,
} from "./product-domain";

export interface ImportedProductRecord {
  productId: string;
  supplierProductId: string;
  supplierProduct: SupplierProductRow;
}

export const supplierEditableFields = productSyncProtectedFields;
export type SupplierEditableField = ProductSyncProtectedField;

export interface ProductRepository {
  findImported(
    supplierCode: string,
    externalProductId: string,
    options?: { registeredOnly?: boolean; ownerId?: string },
  ): Promise<ImportedProductRecord | null>;
  listImported(
    supplierCode: string,
    options?: { registeredOnly?: boolean; ownerId?: string },
  ): Promise<ImportedProductRecord[]>;
  importSupplierProduct(
    product: SupplierProduct,
    ownerId: string,
  ): Promise<ImportedProductRecord>;
  updateSupplierProduct(
    supplierProductId: string,
    product: SupplierProduct,
    existing?: ImportedProductRecord,
    options?: {
      protectedFields?: SupplierEditableField[];
      refreshDescriptionIfUnedited?: boolean;
    },
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
    options?: {
      protectedFields?: SupplierEditableField[];
      refreshDescriptionIfUnedited?: boolean;
    },
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
      const [currentProduct] = await tx
        .select()
        .from(products)
        .where(eq(products.id, imported.productId))
        .for("update")
        .limit(1);
      const [previousSupplier] = await tx
        .select()
        .from(supplierProducts)
        .where(eq(supplierProducts.id, supplierProductId))
        .for("update")
        .limit(1);
      if (!currentProduct || !previousSupplier)
        throw new Error("product_link_not_found");
      const sellingPrice =
        currentProduct.currency === product.currency &&
        product.currency === previousSupplier.currency
          ? preserveMarginPrice(
              previousSupplier.supplierPrice === null
                ? null
                : Number(previousSupplier.supplierPrice),
              currentProduct.sellingPrice,
              product.supplierPrice,
            )
          : null;
      const refreshDescription = Boolean(
        options?.refreshDescriptionIfUnedited &&
        supplierDescriptionIsUnedited(
          currentProduct.description,
          previousSupplier.rawDescription,
        ),
      );
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
        ...(sellingPrice !== null &&
        sellingPrice !== currentProduct.sellingPrice
          ? { sellingPrice }
          : {}),
        ...(!protectedFields.has("title")
          ? { title: product.originalName ?? "" }
          : {}),
        ...(!protectedFields.has("description") || refreshDescription
          ? { description: sanitizeDescription(product.rawDescription ?? "") }
          : {}),
        ...(!protectedFields.has("images")
          ? { selectedImages: imagesFromSupplier(product.images) }
          : {}),
        ...(!protectedFields.has("options")
          ? { editedOptions: optionsFromSupplier(product.options) }
          : {}),
      };
      const oldValues = {
        supplierPrice: previousSupplier.supplierPrice,
        availability: previousSupplier.availability,
        rawDescription: previousSupplier.rawDescription,
        sellingPrice: currentProduct.sellingPrice,
      };
      const newValues = {
        supplierPrice: supplierProduct.supplierPrice,
        availability: supplierProduct.availability,
        rawDescription: supplierProduct.rawDescription,
        sellingPrice: sellingPrice ?? currentProduct.sellingPrice,
      };
      const changedFields = (
        Object.keys(oldValues) as (keyof typeof oldValues)[]
      ).filter((key) => oldValues[key] !== newValues[key]);
      if (changedFields.length && currentProduct.ownerId) {
        await tx.insert(productAuditLogs).values({
          actorId: currentProduct.ownerId,
          entityId: imported.productId,
          action: "supplier_sync",
          changedFields,
          oldValues,
          newValues,
          requestId: crypto.randomUUID(),
        });
      }
      if (
        sellingPrice !== null &&
        sellingPrice !== currentProduct.sellingPrice
      ) {
        const publications = await tx
          .select({ id: productPublications.id })
          .from(productPublications)
          .where(
            and(
              eq(productPublications.productId, imported.productId),
              sql`${productPublications.originProductNo} is not null`,
              sql`${productPublications.remoteStatusType} is distinct from 'DELETE'`,
            ),
          );
        if (publications.length)
          await tx.insert(supplierPriceApplications).values(
            publications.map((publication) => ({
              productId: imported.productId,
              publicationId: publication.id,
              targetPrice: sellingPrice,
            })),
          );
      }
      // Keep unapplied description tasks current across repeated supplier refreshes.
      // Their previous value remains the remote baseline, so a remote seller edit is still protected.
      const nextDescription = sanitizeDescription(
        supplierProduct.rawDescription ?? "",
      );
      const carriedPublicationIds = new Set<string>();
      if (
        previousSupplier.rawDescription !== supplierProduct.rawDescription &&
        nextDescription
      ) {
        const pendingDescriptions = await tx
          .select()
          .from(supplierChangeApplications)
          .where(
            and(
              eq(supplierChangeApplications.productId, imported.productId),
              eq(
                supplierChangeApplications.supplierProductId,
                supplierProductId,
              ),
              eq(supplierChangeApplications.kind, "description"),
              inArray(supplierChangeApplications.status, ["pending", "failed"]),
            ),
          );
        for (const task of pendingDescriptions) {
          if (
            ![task.previousValue, task.targetValue].includes(
              currentProduct.description,
            )
          )
            continue;
          await tx
            .update(supplierChangeApplications)
            .set({
              targetValue: nextDescription,
              status: "pending",
              errorMessage: null,
            })
            .where(eq(supplierChangeApplications.id, task.id));
          carriedPublicationIds.add(task.publicationId);
        }
      }
      const changeTargets = supplierChangeTargets({
        previousAvailability: previousSupplier.availability,
        availability: supplierProduct.availability,
        previousDescription: previousSupplier.rawDescription,
        description: supplierProduct.rawDescription,
        editedDescription: currentProduct.description,
      });
      if (changeTargets.length) {
        const publications = await tx
          .select({ id: productPublications.id })
          .from(productPublications)
          .where(
            and(
              eq(productPublications.productId, imported.productId),
              sql`${productPublications.originProductNo} is not null`,
              sql`${productPublications.status} <> 'deleted'`,
              sql`${productPublications.remoteStatusType} is distinct from 'DELETE'`,
            ),
          );
        const tasks = publications.flatMap((publication) =>
          changeTargets
            .filter(
              (target) =>
                target.kind !== "description" ||
                !carriedPublicationIds.has(publication.id),
            )
            .map((target) => ({
              ...target,
              productId: imported.productId,
              supplierProductId,
              publicationId: publication.id,
            })),
        );
        if (tasks.length)
          await tx.insert(supplierChangeApplications).values(tasks);
      }
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

  async findImported(
    supplierCode: string,
    externalProductId: string,
    options?: { registeredOnly?: boolean; ownerId?: string },
  ) {
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
      .innerJoin(products, eq(products.id, productSupplierLinks.productId))
      .where(
        and(
          eq(suppliers.code, supplierCode),
          eq(supplierProducts.externalProductId, externalProductId),
          options?.ownerId ? eq(products.ownerId, options.ownerId) : undefined,
          options?.registeredOnly ? registeredPublicationExists() : undefined,
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async listImported(
    supplierCode: string,
    options?: { registeredOnly?: boolean; ownerId?: string },
  ) {
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
      .innerJoin(products, eq(products.id, productSupplierLinks.productId))
      .where(
        and(
          eq(suppliers.code, supplierCode),
          options?.ownerId ? eq(products.ownerId, options.ownerId) : undefined,
          options?.registeredOnly ? registeredPublicationExists() : undefined,
        ),
      );
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

function registeredPublicationExists() {
  return sql`exists (
    select 1 from ${productPublications}
    where ${productPublications.productId} = ${products.id}
      and ${productPublications.originProductNo} is not null
      and ${productPublications.status} <> 'deleted'
      and ${productPublications.remoteStatusType} is distinct from 'DELETE'
  )`;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505",
  );
}
