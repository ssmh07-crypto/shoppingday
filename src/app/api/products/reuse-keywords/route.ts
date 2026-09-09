import { NextResponse } from "next/server";
import { z } from "zod";
import { createProductEditService } from "@/modules/products/product-edit-factory";
import {
  ProductConflictError,
  ProductValidationError,
} from "@/modules/products/product-errors";
import { withAdminProductRoute } from "../route-utils";

const base = z.object({
  sourceId: z.uuid(),
  targetIds: z.array(z.uuid()).min(1).max(100),
  copyCategory: z.boolean(),
  copyTags: z.boolean(),
});
export async function POST(request: Request) {
  return withAdminProductRoute(async (user, database) => {
    const input = base.parse(await request.json());
    const service = createProductEditService(database);
    const source = await service.get(input.sourceId, user.id);
    if (!source.product.keywordDrafts.length)
      throw new ProductValidationError({
        sourceId: "기준 상품 편집에서 엑셀 키워드를 먼저 저장해 주세요.",
      });
    const previews = [];
    for (const id of [...new Set(input.targetIds)].filter(
      (id) => id !== input.sourceId,
    )) {
      const target = await service.get(id, user.id);
      previews.push({
        id,
        title: target.product.title,
        draftVersion: target.product.draftVersion,
        previousKeywordCount: target.product.keywordDrafts.length,
        nextKeywordCount: new Set(
          [
            ...target.product.keywordDrafts,
            ...source.product.keywordDrafts,
          ].map((keyword) => keyword.normalizedKeyword),
        ).size,
        categoryChanges:
          input.copyCategory &&
          target.product.naverCategoryId !== source.product.naverCategoryId,
        previousCategory: target.product.naverCategoryId,
        nextCategory: input.copyCategory ? source.product.naverCategoryId : target.product.naverCategoryId,
      });
    }
    return NextResponse.json({
      success: true,
      sourceVersion: source.product.draftVersion,
      sourceTitle: source.product.title,
      tagCount: source.product.searchTags.length,
      searchTags: source.product.searchTags,
      previews,
    });
  });
}
export async function PATCH(request: Request) {
  return withAdminProductRoute(async (user, database) => {
    const input = base
      .omit({ targetIds: true })
      .extend({
        targetId: z.uuid(),
        sourceVersion: z.number().int().positive(),
        draftVersion: z.number().int().positive(),
        confirmed: z.literal(true),
      })
      .parse(await request.json());
    if (input.sourceId === input.targetId) throw new ProductConflictError();
    const service = createProductEditService(database);
    const source = await service.get(input.sourceId, user.id);
    const target = await service.get(input.targetId, user.id);
    if (!source.product.keywordDrafts.length)
      throw new ProductValidationError({ sourceId: "기준 상품의 저장된 키워드가 없습니다. 미리보기를 다시 확인해 주세요." });
    if (
      source.product.draftVersion !== input.sourceVersion ||
      target.product.draftVersion !== input.draftVersion
    )
      throw new ProductConflictError();
    const keywords = new Map(
      target.product.keywordDrafts.map((keyword) => [
        keyword.normalizedKeyword,
        keyword,
      ]),
    );
    // Target's prior classification wins; source only fills missing candidates.
    for (const keyword of source.product.keywordDrafts)
      if (!keywords.has(keyword.normalizedKeyword))
        keywords.set(keyword.normalizedKeyword, {
          ...keyword,
          id: crypto.randomUUID(),
        });
    await service.saveDraft(input.targetId, user.id, {
      ...target.product,
      draftVersion: input.draftVersion,
      keywordDrafts: [...keywords.values()],
      ...(input.copyCategory
        ? { naverCategoryId: source.product.naverCategoryId }
        : {}),
      ...(input.copyTags ? { searchTags: source.product.searchTags } : {}),
    });
    return NextResponse.json({ success: true });
  });
}
