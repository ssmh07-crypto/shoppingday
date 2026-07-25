import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { withDbSession } from "@/lib/db";
import { naverStoreSettingsInputSchema } from "@/modules/channels/naver/naver-store-settings";
import { NaverStoreSettingsRepository } from "@/modules/channels/naver/naver-store-settings-repository";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDbSession(async (database) => {
    const user = await requireAdmin(database);
    const { id } = await params;
    const input = naverStoreSettingsInputSchema.parse(await request.json());
    const settings = await new NaverStoreSettingsRepository(database).update(
      user.id,
      id,
      input,
    );
    if (!settings) {
      return NextResponse.json(
        { success: false, error: { code: "not_found", message: "스토어 연결을 찾지 못했습니다." } },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, settings });
  });
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDbSession(async (database) => {
    const user = await requireAdmin(database);
    const { id } = await params;
    try {
      const removed = await new NaverStoreSettingsRepository(database).remove(
        user.id,
        id,
      );
      if (!removed) {
        return NextResponse.json(
          { success: false, error: { code: "not_found", message: "스토어 연결을 찾지 못했습니다." } },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "store_in_use",
            message: "상품 발행 대상 또는 발행 이력이 있는 스토어는 삭제할 수 없습니다.",
          },
        },
        { status: 409 },
      );
    }
  });
}
