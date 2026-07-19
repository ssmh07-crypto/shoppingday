import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  productSupplierLinks,
  products,
  sourcingResearches,
  supplierProducts,
  suppliers,
} from "@/lib/db/schema";
import type { SourcingResearchInput } from "./types";

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
  ) {
    const [row] = await this.database
      .update(sourcingResearches)
      .set({ ...input, maximumPurchasePrice, updatedAt: new Date() })
      .where(
        and(
          eq(sourcingResearches.ownerId, ownerId),
          eq(sourcingResearches.id, id),
        ),
      )
      .returning({ id: sourcingResearches.id });
    return row ?? null;
  }

  async createRegistrationProduct(
    ownerId: string,
    researchId: string,
    input: {
      title: string;
      searchTags: string[];
      sellingPrice: number | null;
      originalName: string;
      supplierPrice: number | null;
    },
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
