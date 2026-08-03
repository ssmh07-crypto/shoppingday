import { NextResponse } from "next/server";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbSession } from "@/lib/db";
import {
  ZicgamImportService,
  zicgamCapturedProductSchema,
} from "@/modules/suppliers/zicgam/zicgam-import";

export async function POST(request: Request) {
  return withDbSession(async (database) => {
    try {
      const user = await requireAdmin(database);
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
      return NextResponse.json(
        await new ZicgamImportService(database).importCaptured(
          input.data,
          user.id,
        ),
      );
    } catch (error) {
      const authentication = error instanceof AuthenticationError;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: authentication ? error.code : "internal_error",
            message: authentication
              ? error.message
              : "직감 상품을 저장하지 못했습니다.",
          },
        },
        { status: authentication ? 401 : 500 },
      );
    }
  });
}
