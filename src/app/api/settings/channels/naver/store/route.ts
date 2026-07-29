import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery, withDbSession } from "@/lib/db";
import { naverStoreSettingsInputSchema } from "@/modules/channels/naver/naver-store-settings";
import {
  NaverStoreConnectionLimitError,
  NaverStoreSettingsRepository,
} from "@/modules/channels/naver/naver-store-settings-repository";

export async function GET() {
  try {
    return await withDbReadRecovery(async (database) => {
      const user = await requireAdmin(database);
      const settings = await new NaverStoreSettingsRepository(database).list(
        user.id,
      );
      return NextResponse.json(
        { success: true, settings },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    });
  } catch (error) {
    return storeSettingsError(error);
  }
}

export async function POST(request: Request) {
  return withDbSession(async (database) => {
    try {
      const user = await requireAdmin(database);
      const input = naverStoreSettingsInputSchema.parse(await request.json());
      const settings = await new NaverStoreSettingsRepository(database).create(
        user.id,
        input,
      );
      return NextResponse.json({ success: true, settings });
    } catch (error) {
      return storeSettingsError(error);
    }
  });
}

function storeSettingsError(error: unknown) {
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
          message: error.issues[0]?.message ?? "스토어 정보를 확인해 주세요.",
        },
      },
      { status: 400 },
    );
  }
  if (error instanceof NaverStoreConnectionLimitError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "store_connection_limit",
          message: "스마트스토어는 최대 5개까지 연결할 수 있습니다.",
        },
      },
      { status: 409 },
    );
  }
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "internal_error",
        message: "스마트스토어 설정을 저장하지 못했습니다.",
      },
    },
    { status: 500 },
  );
}
