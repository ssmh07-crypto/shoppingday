import { NextResponse } from "next/server";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { logger } from "@/lib/logging/logger";
import {
  ZicgamImportService,
  zicgamCapturedProductSchema,
} from "@/modules/suppliers/zicgam/zicgam-import";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const input = zicgamCapturedProductSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "validation_error",
          message:
            input.error.issues[0]?.message ??
            "직감 상품 정보를 확인해 주세요.",
        },
      },
      { status: 400 },
    );
  }
  try {
    return await withDbReadRecovery(async (database) => {
      const user = await requireAdmin(database);
      return NextResponse.json(
        await new ZicgamImportService(database).importCaptured(
          input.data,
          user.id,
        ),
      );
    });
  } catch (error) {
    const authentication = error instanceof AuthenticationError;
    const diagnosticCode = errorCode(error);
    logger.error("zicgam_product_import_failed", {
      externalProductId: input.data.externalProductId,
      code: diagnosticCode,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: authentication ? error.code : diagnosticCode,
          message: authentication
            ? error.message
            : `직감 상품을 저장하지 못했습니다. (오류 코드: ${diagnosticCode})`,
        },
      },
      { status: authentication ? 401 : 500 },
    );
  }
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "internal_error";
  }
  return String(error.code).slice(0, 50);
}
