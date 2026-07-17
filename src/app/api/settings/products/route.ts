import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery, withDbSession } from "@/lib/db";
import { productProcessingSettingsInputSchema } from "@/modules/products/product-processing-settings";
import { ProductProcessingSettingsRepository } from "@/modules/products/product-processing-settings-repository";

export async function GET() {
  try {
    return await withDbReadRecovery(async (database) => {
      const user = await requireAdmin(database);
      const settings = await new ProductProcessingSettingsRepository(
        database,
      ).get(user.id);
      return NextResponse.json(
        { success: true, settings },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    });
  } catch (error) {
    return settingsError(error);
  }
}

export async function PATCH(request: Request) {
  return withDbSession(async (database) => {
    try {
      const user = await requireAdmin(database);
      const input = productProcessingSettingsInputSchema.parse(
        await request.json(),
      );
      const settings = await new ProductProcessingSettingsRepository(
        database,
      ).save(user.id, input);
      return NextResponse.json({ success: true, settings });
    } catch (error) {
      return settingsError(error);
    }
  });
}

function settingsError(error: unknown) {
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
        error: { code: "validation_error", message: "설정값을 확인해 주세요." },
      },
      { status: 400 },
    );
  }
  return NextResponse.json(
    {
      success: false,
      error: { code: "internal_error", message: "설정을 저장하지 못했습니다." },
    },
    { status: 500 },
  );
}
