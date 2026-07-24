import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { NaverCommerceError } from "@/modules/channels/naver/naver-commerce-client";
import {
  NaverProvidedNoticeCategoryNotFoundError,
  NaverProvidedNoticeService,
} from "@/modules/channels/naver/naver-provided-notice-service";

const querySchema = z.union([
  z.object({ categoryId: z.string().regex(/^\d+$/).max(20), type: z.undefined() }),
  z.object({ categoryId: z.undefined(), type: z.string().regex(/^[A-Z_]{2,40}$/) }),
  z.object({ categoryId: z.undefined(), type: z.undefined() }),
]);

export async function GET(request: Request) {
  try {
    return await withDbReadRecovery(async (database) => {
      await requireAdmin(database);
      const url = new URL(request.url);
      const query = querySchema.parse({
        categoryId: url.searchParams.get("categoryId") ?? undefined,
        type: url.searchParams.get("type") ?? undefined,
      });
      const service = new NaverProvidedNoticeService(database);
      const result = query.categoryId
        ? await service.listForCategory(query.categoryId)
        : query.type
          ? await service.get(query.type)
          : await service.listAll();
      return NextResponse.json(
        { success: true, data: result.value, cached: result.cached, stale: result.stale },
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
    if (error instanceof z.ZodError || error instanceof NaverProvidedNoticeCategoryNotFoundError) {
      return NextResponse.json(
        { success: false, error: { code: "validation_error", message: "네이버 카테고리 또는 고시 유형을 확인해 주세요." } },
        { status: 400 },
      );
    }
    if (error instanceof NaverCommerceError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.code === "timeout" ? 504 : 502 },
      );
    }
    console.error(JSON.stringify({ event: "naver_provided_notice_failed" }));
    return NextResponse.json(
      { success: false, error: { code: "internal_error", message: "상품정보제공고시를 조회하지 못했습니다." } },
      { status: 500 },
    );
  }
}
