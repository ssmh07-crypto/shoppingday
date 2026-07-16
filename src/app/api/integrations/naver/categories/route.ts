import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery, withDbSession } from "@/lib/db";
import { NaverCategoryRepository } from "@/modules/channels/naver/naver-category-repository";
import {
  createNaverCategoryService,
  isNaverCommerceConfigured,
} from "@/modules/channels/naver/naver-category-service";
import { NaverCommerceError } from "@/modules/channels/naver/naver-commerce-client";

const querySchema = z.object({
  search: z.string().trim().max(100).optional(),
  leafOnly: z.enum(["true", "false"]).default("true"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export async function GET(request: Request) {
  try {
    return await withDbReadRecovery(async (database) => {
      await requireAdmin(database);
      const url = new URL(request.url);
      const input = querySchema.parse({
        search: url.searchParams.get("search") || undefined,
        leafOnly: url.searchParams.get("leafOnly") || undefined,
        limit: url.searchParams.get("limit") || undefined,
      });
      const repository = new NaverCategoryRepository(database);
      const [summary, categories] = await Promise.all([
        repository.summary(),
        repository.list({
          search: input.search,
          leafOnly: input.leafOnly === "true",
          limit: input.limit,
        }),
      ]);
      return NextResponse.json(
        {
          success: true,
          configured: isNaverCommerceConfigured(),
          summary,
          categories,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    });
  } catch (error) {
    return naverError(error);
  }
}

export async function POST() {
  return withDbSession(async (database) => {
    try {
      await requireAdmin(database);
      if (!isNaverCommerceConfigured()) {
        throw new NaverCommerceError(
          "not_configured",
          "네이버 커머스API 애플리케이션 정보가 설정되지 않았습니다.",
        );
      }
      const result = await createNaverCategoryService(database).sync();
      return NextResponse.json(
        { success: true, result },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      return naverError(error);
    }
  });
}

function naverError(error: unknown) {
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
          message: "검색 조건을 확인해 주세요.",
        },
      },
      { status: 400 },
    );
  }
  if (error instanceof NaverCommerceError) {
    const status =
      error.code === "not_configured"
        ? 503
        : error.code === "timeout"
          ? 504
          : 502;
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status },
    );
  }
  console.error(JSON.stringify({ event: "naver_category_request_failed" }));
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "internal_error",
        message: "네이버 카테고리 요청을 처리하지 못했습니다.",
      },
    },
    { status: 500 },
  );
}
