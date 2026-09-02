import { NextResponse } from "next/server";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { logger } from "@/lib/logging/logger";
import {
  EbulsamchonImportService,
  ebulsamchonCapturedProductSchema,
} from "@/modules/suppliers/ebulsamchon/ebulsamchon-import";

export async function POST(request: Request) {
  const input = ebulsamchonCapturedProductSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "validation_error",
          message:
            input.error.issues[0]?.message ??
            "이불삼촌 상품 정보를 확인해 주세요.",
        },
      },
      { status: 400 },
    );
  }
  try {
    return await withDbReadRecovery(async (database) => {
      const user = await requireAdmin(database);
      return NextResponse.json(
        await new EbulsamchonImportService(database).importCaptured(
          input.data,
          user.id,
        ),
      );
    });
  } catch (error) {
    const authentication = error instanceof AuthenticationError;
    logger.error("ebulsamchon_product_import_failed", {
      externalProductId: input.data.externalProductId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: authentication ? error.code : "internal_error",
          message: authentication
            ? error.message
            : "이불삼촌 상품을 저장하지 못했습니다.",
        },
      },
      { status: authentication ? 401 : 500 },
    );
  }
}
