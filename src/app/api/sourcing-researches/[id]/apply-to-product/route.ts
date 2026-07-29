import { NextResponse } from "next/server";
import { createProductEditService } from "@/modules/products/product-edit-factory";
import { categoryKeywordsInTitle } from "@/modules/sourcing/registration-draft";
import { applySourcingRegistrationDraftSchema } from "@/modules/sourcing/schemas";
import { createSourcingResearchService } from "@/modules/sourcing/sourcing-factory";
import { withAdminSourcingRoute } from "../../route-utils";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminSourcingRoute(async (user, database) => {
    const { id } = await params;
    const input = applySourcingRegistrationDraftSchema.parse(await request.json());
    const sourcing = await createSourcingResearchService(database).get(user.id, id);
    const categoryKeywords = sourcing.relatedKeywords
      .filter((keyword) => keyword.placement === "category")
      .map((keyword) => keyword.keyword);
    const blockedKeywords = categoryKeywordsInTitle(input.title, categoryKeywords);
    if (blockedKeywords.length) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "category_keyword_in_title",
            message: `카테고리 키워드는 상품명에 사용할 수 없습니다: ${blockedKeywords.join(", ")}`,
          },
        },
        { status: 422 },
      );
    }

    const productService = createProductEditService(database);
    const current = await productService.get(input.productId, user.id);
    const result = await productService.saveDraft(input.productId, user.id, {
      draftVersion: current.product.draftVersion,
      title: input.title,
      searchTags: input.searchTags,
      sellingPrice: current.product.sellingPrice,
      currency: current.product.currency,
      description: current.product.description,
      categoryId: current.product.categoryId,
      naverCategoryId: current.product.naverCategoryId,
      selectedImages: current.product.selectedImages,
      editedOptions: current.product.editedOptions,
      naverAttributes: current.product.naverAttributes,
    });

    return NextResponse.json({
      success: true,
      data: {
        productId: input.productId,
        draftVersion: result.kind === "ok" ? result.product.draftVersion : null,
      },
    });
  });
}
