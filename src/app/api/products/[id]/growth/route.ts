import { NextResponse } from "next/server";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { withAdminKeywordRoute } from "@/app/api/keyword-products/route-utils";
import { keywordManagedProducts, productPublications } from "@/lib/db/schema";
import { ProductEditRepository } from "@/modules/products/product-edit-repository";
import { NaverStoreTargetRepository } from "@/modules/channels/naver/naver-store-target-repository";
import { createKeywordManagementService } from "@/modules/keywords/keyword-factory";
import { KeywordManagementError } from "@/modules/keywords/keyword-errors";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withAdminKeywordRoute(async (user, database) => {
    const id = z.uuid().parse((await context.params).id);
    const [product, store] = await Promise.all([
      new ProductEditRepository(database).find(id, user.id),
      new NaverStoreTargetRepository(database).getForProduct(id, user.id),
    ]);
    if (!product || !store)
      throw new KeywordManagementError(
        "not_found",
        "상품과 발행 대상 스토어를 확인해 주세요.",
        404,
      );
    const [publication] = await database
      .select()
      .from(productPublications)
      .where(
        and(
          eq(productPublications.productId, id),
          eq(productPublications.storeConnectionId, store.id),
          isNotNull(productPublications.channelProductNo),
          sql`${productPublications.remoteStatusType} is distinct from 'DELETE'`,
          sql`${productPublications.status} <> 'deleted'`,
        ),
      )
      .limit(1);
    if (!publication?.channelProductNo)
      throw new KeywordManagementError(
        "naver_product_not_linked",
        "발행 대상 스토어에 먼저 상품을 등록해 주세요.",
        409,
      );

    async function existing() {
      const [row] = await database
        .select({ id: keywordManagedProducts.id })
        .from(keywordManagedProducts)
        .where(
          and(
            eq(keywordManagedProducts.ownerId, user.id),
            eq(
              keywordManagedProducts.channelProductNo,
              publication!.channelProductNo!,
            ),
          ),
        )
        .limit(1);
      return row;
    }
    const linked = await existing();
    if (linked) return NextResponse.json({ id: linked.id });
    try {
      const data = await createKeywordManagementService(
        database,
        user.id,
      ).create(user.id, {
        smartstoreUrl: `${store.storeUrl.replace(/\/$/, "")}/products/${publication.channelProductNo}`,
        storeConnectionId: store.id,
        productInput: {
          supplierTitle: product.supplier.originalName || product.product.title,
        },
      });
      return NextResponse.json({ id: data.product.id }, { status: 201 });
    } catch (error) {
      if (
        error instanceof KeywordManagementError &&
        error.code === "duplicate_product"
      ) {
        const duplicate = await existing();
        if (duplicate) return NextResponse.json({ id: duplicate.id });
      }
      throw error;
    }
  });
}
