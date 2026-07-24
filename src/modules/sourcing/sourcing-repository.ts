import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  productSupplierLinks,
  productAuditLogs,
  products,
  sourcingResearches,
  supplierProducts,
  suppliers,
} from "@/lib/db/schema";
import type { SourcingResearchInput } from "./types";

type RegistrationProductInput = {
  title: string;
  searchTags: string[];
  sellingPrice: number | null;
  originalName: string;
  supplierPrice: number | null;
};

export class SourcingResearchRepository {
  constructor(private readonly database: Database) {}

  list(ownerId: string) {
    return this.database
      .select({
        id: sourcingResearches.id,
        status: sourcingResearches.status,
        sourcingKeyword: sourcingResearches.sourcingKeyword,
        monthlySearchVolume: sourcingResearches.monthlySearchVolume,
        sixMonthRevenue: sourcingResearches.sixMonthRevenue,
        maximumPurchasePrice: sourcingResearches.maximumPurchasePrice,
        registrationProductId: sourcingResearches.registrationProductId,
        createdAt: sourcingResearches.createdAt,
        updatedAt: sourcingResearches.updatedAt,
      })
      .from(sourcingResearches)
      .where(eq(sourcingResearches.ownerId, ownerId))
      .orderBy(desc(sourcingResearches.updatedAt));
  }

  listRegistrations(ownerId: string) {
    return this.database
      .select({
        id: sourcingResearches.id,
        sourcingKeyword: sourcingResearches.sourcingKeyword,
        sourcingStatus: sourcingResearches.status,
        monthlySearchVolume: sourcingResearches.monthlySearchVolume,
        sixMonthRevenue: sourcingResearches.sixMonthRevenue,
        expectedSellingPrice: sourcingResearches.expectedSellingPrice,
        registrationProductId: sourcingResearches.registrationProductId,
        productStatus: products.status,
        productTitle: products.title,
        productSellingPrice: products.sellingPrice,
        updatedAt: sourcingResearches.updatedAt,
      })
      .from(sourcingResearches)
      .leftJoin(
        products,
        eq(products.id, sourcingResearches.registrationProductId),
      )
      .where(eq(sourcingResearches.ownerId, ownerId))
      .orderBy(desc(sourcingResearches.updatedAt));
  }

  async findRegistrationIdByProduct(ownerId: string, productId: string) {
    const [row] = await this.database
      .select({ id: sourcingResearches.id })
      .from(sourcingResearches)
      .where(
        and(
          eq(sourcingResearches.ownerId, ownerId),
          eq(sourcingResearches.registrationProductId, productId),
        ),
      )
      .limit(1);
    return row?.id ?? null;
  }

  async find(ownerId: string, id: string) {
    const [row] = await this.database
      .select()
      .from(sourcingResearches)
      .where(
        and(
          eq(sourcingResearches.ownerId, ownerId),
          eq(sourcingResearches.id, id),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async create(
    ownerId: string,
    input: SourcingResearchInput,
    maximumPurchasePrice: number | null,
  ) {
    const [row] = await this.database
      .insert(sourcingResearches)
      .values({ ownerId, ...input, maximumPurchasePrice })
      .returning({ id: sourcingResearches.id });
    return row!;
  }

  async update(
    ownerId: string,
    id: string,
    input: SourcingResearchInput,
    maximumPurchasePrice: number | null,
    registrationInput: RegistrationProductInput,
  ) {
    return this.database.transaction(async (tx) => {
      const [row] = await tx
        .update(sourcingResearches)
        .set({ ...input, maximumPurchasePrice, updatedAt: new Date() })
        .where(
          and(
            eq(sourcingResearches.ownerId, ownerId),
            eq(sourcingResearches.id, id),
          ),
        )
        .returning({
          id: sourcingResearches.id,
          registrationProductId: sourcingResearches.registrationProductId,
        });
      if (!row?.registrationProductId) return row ?? null;

      const [current] = await tx
        .select({
          title: products.title,
          searchTags: products.searchTags,
          sellingPrice: products.sellingPrice,
          status: products.status,
        })
        .from(products)
        .where(
          and(
            eq(products.id, row.registrationProductId),
            eq(products.ownerId, ownerId),
          ),
        )
        .limit(1)
        .for("update");
      if (!current) return row;

      const changedFields = (["title", "searchTags", "sellingPrice"] as const)
        .filter((field) => JSON.stringify(current[field]) !== JSON.stringify(registrationInput[field]));
      // Once registration editing has started, the user's selected title,
      // tags, and price take precedence over later sourcing-note changes.
      if (current.status === "draft" && changedFields.length) {
        const [updatedProduct] = await tx
          .update(products)
          .set({
            title: registrationInput.title,
            searchTags: registrationInput.searchTags,
            sellingPrice: registrationInput.sellingPrice,
            draftVersion: sql`${products.draftVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(products.id, row.registrationProductId))
          .returning({
            title: products.title,
            searchTags: products.searchTags,
            sellingPrice: products.sellingPrice,
          });
        await tx.insert(productAuditLogs).values({
          actorId: ownerId,
          entityId: row.registrationProductId,
          action: "sourcing_registration_draft_synced",
          changedFields: [...changedFields],
          oldValues: Object.fromEntries(changedFields.map((field) => [field, current[field]])),
          newValues: Object.fromEntries(changedFields.map((field) => [field, updatedProduct![field]])),
          requestId: randomUUID(),
        });
      }

      const [supplierLink] = await tx
        .select({ supplierProductId: productSupplierLinks.supplierProductId })
        .from(productSupplierLinks)
        .innerJoin(supplierProducts, eq(supplierProducts.id, productSupplierLinks.supplierProductId))
        .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
        .where(
          and(
            eq(productSupplierLinks.productId, row.registrationProductId),
            eq(productSupplierLinks.isPrimary, true),
            eq(suppliers.code, "sourcing"),
          ),
        )
        .limit(1);
      if (supplierLink) {
        await tx
          .update(supplierProducts)
          .set({
            originalName: registrationInput.originalName,
            supplierPrice: registrationInput.supplierPrice === null
              ? null
              : String(registrationInput.supplierPrice),
            updatedAt: new Date(),
          })
          .where(eq(supplierProducts.id, supplierLink.supplierProductId));
      }
      return row;
    });
  }

  async createRegistrationProduct(
    ownerId: string,
    researchId: string,
    input: RegistrationProductInput,
  ) {
    return this.database.transaction(async (tx) => {
      const [research] = await tx
        .select({
          id: sourcingResearches.id,
          registrationProductId: sourcingResearches.registrationProductId,
        })
        .from(sourcingResearches)
        .where(
          and(
            eq(sourcingResearches.ownerId, ownerId),
            eq(sourcingResearches.id, researchId),
          ),
        )
        .limit(1)
        .for("update");
      if (!research) return null;
      if (research.registrationProductId) {
        return {
          productId: research.registrationProductId,
          alreadyExists: true,
        };
      }

      await tx
        .insert(suppliers)
        .values({ code: "sourcing", name: "소싱 아이템" })
        .onConflictDoNothing({ target: suppliers.code });
      const [supplier] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(eq(suppliers.code, "sourcing"))
        .limit(1);
      if (!supplier) throw new Error("sourcing_supplier_not_found");

      const sequenceResult = await tx.execute<{ sequenceValue: number }>(
        sql`select nextval('sourcing_product_code_seq')::integer as "sequenceValue"`,
      );
      const sequenceValue = sequenceResult[0]?.sequenceValue;
      if (!sequenceValue) throw new Error("sourcing_product_sequence_failed");
      const productNumber = `SC${String(sequenceValue).padStart(6, "0")}`;

      const [supplierProduct] = await tx
        .insert(supplierProducts)
        .values({
          supplierId: supplier.id,
          externalProductId: productNumber,
          originalName: input.originalName,
          supplierPrice:
            input.supplierPrice === null ? null : String(input.supplierPrice),
          currency: "KRW",
          availability: "active",
          originalImages: [],
          originalOptions: [],
          rawDescription: null,
          rawPayload: { sourcingResearchId: researchId },
        })
        .returning({ id: supplierProducts.id });
      const [product] = await tx
        .insert(products)
        .values({
          ownerId,
          status: "draft",
          title: input.title,
          searchTags: input.searchTags,
          sellingPrice: input.sellingPrice,
          description: "",
        })
        .returning({ id: products.id });
      await tx.insert(productSupplierLinks).values({
        productId: product!.id,
        supplierProductId: supplierProduct!.id,
        isPrimary: true,
      });
      await tx
        .update(sourcingResearches)
        .set({ registrationProductId: product!.id, updatedAt: new Date() })
        .where(eq(sourcingResearches.id, researchId));
      return { productId: product!.id, alreadyExists: false };
    });
  }
}
