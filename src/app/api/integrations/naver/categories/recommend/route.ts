import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { createNaverCategoryService } from "@/modules/channels/naver/naver-category-service";

const querySchema = z.object({
  productName: z.string().trim().min(2).max(200),
});

export async function GET(request: Request) {
  try {
    return await withDbReadRecovery(async (database) => {
      await requireAdmin(database);
      const url = new URL(request.url);
      const input = querySchema.parse({
        productName: url.searchParams.get("productName"),
      });
      const recommendation = await createNaverCategoryService(
        database,
      ).recommend(input.productName);
      return NextResponse.json(
        { success: true, recommendation },
        { headers: { "Cache-Control": "private, no-store" } },
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
            message: "상품명을 두 글자 이상 입력해 주세요.",
          },
        },
        { status: 400 },
      );
    }
    console.error(JSON.stringify({ event: "naver_category_recommend_failed" }));
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "internal_error",
          message: "카테고리를 추천하지 못했습니다.",
        },
      },
      { status: 500 },
    );
  }
}
