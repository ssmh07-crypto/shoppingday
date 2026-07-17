import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { createNaverCategoryMetadataService } from "@/modules/channels/naver/naver-category-metadata";
import { NaverCommerceError } from "@/modules/channels/naver/naver-commerce-client";

const querySchema = z.object({
  categoryId: z.string().regex(/^\d+$/).max(20),
});

export async function GET(request: Request) {
  try {
    return await withDbReadRecovery(async (database) => {
      await requireAdmin(database);
      const url = new URL(request.url);
      const { categoryId } = querySchema.parse({
        categoryId: url.searchParams.get("categoryId"),
      });
      const requirements =
        await createNaverCategoryMetadataService().get(categoryId);
      return NextResponse.json(
        { success: true, requirements },
        { headers: { "Cache-Control": "private, max-age=300" } },
      );
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: 401 },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "validation_error",
            message: "카테고리 ID를 확인해 주세요.",
          },
        },
        { status: 400 },
      );
    }
    if (error instanceof NaverCommerceError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        {
          status:
            error.code === "not_configured"
              ? 503
              : error.code === "timeout"
                ? 504
                : 502,
        },
      );
    }
    console.error(JSON.stringify({ event: "naver_category_metadata_failed" }));
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "internal_error",
          message: "카테고리 필수정보를 조회하지 못했습니다.",
        },
      },
      { status: 500 },
    );
  }
}
