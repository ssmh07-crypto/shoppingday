import { NextResponse } from "next/server";
import { z } from "zod";
import { NaverCommerceError } from "@/modules/channels/naver/naver-commerce-client";
import { createConfiguredNaverClientForUser } from "@/modules/channels/naver/naver-category-service";
import { NaverStoreTargetRepository } from "@/modules/channels/naver/naver-store-target-repository";
import {
  NaverImageUploadProgressError,
  NaverImageUploadService,
} from "@/modules/channels/naver/naver-image-upload-service";
import { NaverImageUploadCacheRepository } from "@/modules/channels/naver/naver-image-upload-cache-repository";
import { ProductEditRepository } from "@/modules/products/product-edit-repository";
import {
  ProductConflictError,
  ProductValidationError,
} from "@/modules/products/product-errors";
import { withAdminProductRoute } from "../../../route-utils";

const inputSchema = z.object({ draftVersion: z.number().int().positive() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductRoute(async (user, database) => {
    try {
      const { id } = await params;
      const { draftVersion } = inputSchema.parse(await request.json());
      const storeConnection =
        await new NaverStoreTargetRepository(database).getForProduct(
          id,
          user.id,
        );
      const data = await new NaverImageUploadService(
        new ProductEditRepository(database),
        await createConfiguredNaverClientForUser(
          database,
          user.id,
          undefined,
          storeConnection?.id,
        ),
        fetch,
        new NaverImageUploadCacheRepository(database),
        storeConnection?.id,
      ).upload(id, user.id, draftVersion);
      return NextResponse.json({ success: true, data });
    } catch (error) {
      if (error instanceof NaverImageUploadProgressError) {
        const original = error.originalError;
        const validationErrors =
          original instanceof ProductValidationError
            ? original.errors
            : undefined;
        const status =
          original instanceof ProductValidationError
            ? 400
            : original instanceof ProductConflictError
              ? 409
              : original instanceof NaverCommerceError &&
                  original.code === "timeout"
                ? 504
                : 502;
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "partial_image_upload",
              message: `${error.uploadedCount + error.reusedCount}개 이미지는 저장했습니다. 실패한 이미지부터 다시 시도해 주세요.`,
              errors: validationErrors,
            },
            data: {
              product: error.product,
              uploadedCount: error.uploadedCount,
              reusedCount: error.reusedCount,
              resumable: true,
            },
          },
          { status },
        );
      }
      if (error instanceof NaverCommerceError) {
        return NextResponse.json(
          {
            success: false,
            error: { code: error.code, message: error.message },
          },
          { status: error.code === "timeout" ? 504 : 502 },
        );
      }
      throw error;
    }
  });
}
