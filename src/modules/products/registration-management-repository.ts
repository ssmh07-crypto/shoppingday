import "server-only";
import { and, countDistinct, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  productPublications,
  products,
  productSupplierLinks,
  supplierProducts,
  suppliers,
  type SelectedImage,
} from "@/lib/db/schema";

export class RegistrationManagementRepository {
  constructor(private readonly database: Database) {}

  async listWholesaleProducts(
    ownerId: string,
    options: { supplierCode?: string; page?: number; pageSize?: number } = {},
  ) {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(30, options.pageSize ?? 100));
    const ownership = or(
      eq(products.ownerId, ownerId),
      isNull(products.ownerId),
    )!;
    const productConditions = [
      ownership,
      ne(suppliers.code, "sourcing"),
      ...(options.supplierCode
        ? [eq(suppliers.code, options.supplierCode)]
        : []),
    ];
    const itemsQuery = this.database
      .select({
        id: products.id,
        title: products.title,
        status: products.status,
        sellingPrice: products.sellingPrice,
        updatedAt: products.updatedAt,
        primaryImage: sql<SelectedImage | null>`coalesce(
          jsonb_path_query_first(
            ${products.selectedImages},
            '$[*] ? (@.enabled == true && @.isPrimary == true)'
          ),
          jsonb_path_query_first(
            ${products.selectedImages},
            '$[*] ? (@.enabled == true)'
          )
        )`,
        supplierCode: suppliers.code,
        supplierName: suppliers.name,
        externalProductId: supplierProducts.externalProductId,
        supplierAvailability: supplierProducts.availability,
        publicationStatus: sql<string | null>`(
          select ${productPublications.status}
          from ${productPublications}
          where ${productPublications.productId} = ${products.id}
            and ${productPublications.channel} = 'naver'
          order by ${productPublications.updatedAt} desc
          limit 1
        )`,
        channelProductNo: sql<string | null>`(
          select ${productPublications.channelProductNo}
          from ${productPublications}
          where ${productPublications.productId} = ${products.id}
            and ${productPublications.channel} = 'naver'
          order by ${productPublications.updatedAt} desc
          limit 1
        )`,
        remoteStatusType: sql<string | null>`(
          select ${productPublications.remoteStatusType}
          from ${productPublications}
          where ${productPublications.productId} = ${products.id}
            and ${productPublications.channel} = 'naver'
          order by ${productPublications.updatedAt} desc
          limit 1
        )`,
      })
      .from(products)
      .innerJoin(
        productSupplierLinks,
        and(
          eq(productSupplierLinks.productId, products.id),
          eq(productSupplierLinks.isPrimary, true),
        ),
      )
      .innerJoin(
        supplierProducts,
        eq(supplierProducts.id, productSupplierLinks.supplierProductId),
      )
      .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
      .where(and(...productConditions))
      .orderBy(suppliers.name, desc(products.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const countQuery = this.database
      .select({ count: countDistinct(products.id) })
      .from(products)
      .innerJoin(
        productSupplierLinks,
        and(
          eq(productSupplierLinks.productId, products.id),
          eq(productSupplierLinks.isPrimary, true),
        ),
      )
      .innerJoin(
        supplierProducts,
        eq(supplierProducts.id, productSupplierLinks.supplierProductId),
      )
      .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
      .where(and(...productConditions));
    const suppliersQuery = this.database
      .selectDistinct({ code: suppliers.code, name: suppliers.name })
      .from(products)
      .innerJoin(
        productSupplierLinks,
        and(
          eq(productSupplierLinks.productId, products.id),
          eq(productSupplierLinks.isPrimary, true),
        ),
      )
      .innerJoin(
        supplierProducts,
        eq(supplierProducts.id, productSupplierLinks.supplierProductId),
      )
      .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
      .where(and(ownership, ne(suppliers.code, "sourcing")))
      .orderBy(suppliers.name);
    const summaryQuery = this.database
      .select({
        total: countDistinct(products.id),
        published: sql<number>`count(distinct ${products.id}) filter (
          where ${productPublications.status} = 'published'
            and ${productPublications.channelProductNo} is not null
        )::int`,
      })
      .from(products)
      .innerJoin(
        productSupplierLinks,
        and(
          eq(productSupplierLinks.productId, products.id),
          eq(productSupplierLinks.isPrimary, true),
        ),
      )
      .innerJoin(
        supplierProducts,
        eq(supplierProducts.id, productSupplierLinks.supplierProductId),
      )
      .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
      .leftJoin(
        productPublications,
        and(
          eq(productPublications.productId, products.id),
          eq(productPublications.channel, "naver"),
        ),
      )
      .where(and(ownership, ne(suppliers.code, "sourcing")));
    const [items, countRows, supplierRows, summaryRows] = await Promise.all([
      itemsQuery,
      countQuery,
      suppliersQuery,
      summaryQuery,
    ]);
    return {
      items,
      total: countRows[0]?.count ?? 0,
      page,
      pageSize,
      suppliers: supplierRows,
      summary: summaryRows[0] ?? { total: 0, published: 0 },
    };
  }
}
