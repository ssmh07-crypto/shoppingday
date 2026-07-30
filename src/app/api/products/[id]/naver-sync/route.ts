import { NextResponse } from "next/server";
import { z } from "zod";
import { NaverCommerceError } from "@/modules/channels/naver/naver-commerce-client";
import { createConfiguredNaverClientForUser } from "@/modules/channels/naver/naver-category-service";
import { NaverCategoryRepository } from "@/modules/channels/naver/naver-category-repository";
import { NaverPublicationRepository } from "@/modules/channels/naver/naver-publication-repository";
import { NaverPublicationPolicyRepository } from "@/modules/channels/naver/naver-publication-policy-repository";
import {
  NaverPublicationNotPublishedError,
  NaverPublicationUnavailableError,
} from "@/modules/channels/naver/naver-publication-service";
import { NaverStoreTargetRepository } from "@/modules/channels/naver/naver-store-target-repository";
import { CommerceApiManagedProductImporter } from "@/modules/keywords/naver-product-importer";
import { createProductEditService } from "@/modules/products/product-edit-factory";
import { withAdminProductRoute } from "../../route-utils";

const syncInputSchema = z.object({
  confirmed: z.literal(true),
  draftVersion: z.number().int().positive(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductRoute(async (user, database) => {
    try {
      const { id } = await params;
      const input = syncInputSchema.parse(await request.json());
      const targetStore = await new NaverStoreTargetRepository(
        database,
      ).getForProduct(id, user.id);
      if (!targetStore) throw new NaverPublicationUnavailableError();

      const publication = await new NaverPublicationRepository(
        database,
      ).findForProduct(id, user.id, targetStore.id);
      if (!publication?.channelProductNo || publication.status === "deleted") {
        throw new NaverPublicationNotPublishedError();
      }

      const client = await createConfiguredNaverClientForUser(
        database,
        user.id,
        undefined,
        targetStore.id,
      );
      const remote = await new CommerceApiManagedProductImporter(
        client,
        new NaverCategoryRepository(database),
      ).import(publication.channelProductNo);
      const policies = new NaverPublicationPolicyRepository(database);
      const currentPolicy = await policies.getForProduct(
        id,
        user.id,
        targetStore.id,
      );
      const result = await createProductEditService(database).syncFromNaver(
        id,
        user.id,
        {
          draftVersion: input.draftVersion,
          title: remote.currentTitle,
          searchTags: remote.searchTags,
          sellingPrice: remote.salePrice,
          naverCategoryId: remote.categoryId,
          naverAttributes: remote.attributes.map((attribute) => ({
            attributeSeq: attribute.attributeSeq,
            attributeValueSeq: attribute.attributeValueSeq,
            minValue: attribute.minValue ?? "",
            maxValue: attribute.maxValue ?? "",
            unitCode: attribute.unitCode ?? null,
          })),
        },
      );
      const policy = await policies.saveProductOverrides(
        id,
        user.id,
        {
          ...currentPolicy.overrides,
          immediateDiscountPercent: remote.immediateDiscountPercent ?? null,
        },
        targetStore.id,
      );

      return NextResponse.json({
        success: true,
        result,
        policy,
        remote: {
          category: {
            id: remote.categoryId,
            name: remote.category.split(">").at(-1)?.trim() || remote.category,
            wholeCategoryName: remote.category,
            last: true,
          },
          stockQuantity: remote.stockQuantity,
          statusType: remote.statusType,
          immediateDiscountPercent: remote.immediateDiscountPercent,
        },
      });
    } catch (error) {
      if (error instanceof NaverCommerceError) {
        return NextResponse.json(
          {
            success: false,
            error: { code: error.code, message: error.message },
          },
          {
            status:
              error.responseStatus && error.responseStatus < 500 ? 422 : 502,
          },
        );
      }
      if (
        error instanceof NaverPublicationUnavailableError ||
        error instanceof NaverPublicationNotPublishedError
      ) {
        return NextResponse.json(
          {
            success: false,
            error: { code: error.code, message: error.message },
          },
          { status: 409 },
        );
      }
      throw error;
    }
  });
}
