import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery, withDbSession } from "@/lib/db";
import { naverPublicationPolicySchema } from "@/modules/channels/naver/naver-publication-policy";
import { NaverPublicationPolicyRepository } from "@/modules/channels/naver/naver-publication-policy-repository";

export async function GET() {
  try {
    return await withDbReadRecovery(async (database) => {
      const user = await requireAdmin(database);
      const policy = await new NaverPublicationPolicyRepository(database).getDefault(user.id);
      return NextResponse.json(
        { success: true, policy },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    });
  } catch (error) {
    return policyError(error);
  }
}

export async function PATCH(request: Request) {
  return withDbSession(async (database) => {
    try {
      const user = await requireAdmin(database);
      const input = naverPublicationPolicySchema.parse(await request.json());
      const policy = await new NaverPublicationPolicyRepository(database).saveDefault(user.id, input);
      return NextResponse.json({ success: true, policy });
    } catch (error) {
      return policyError(error);
    }
  });
}

function policyError(error: unknown) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: 401 },
    );
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { success: false, error: { code: "validation_error", message: "네이버 판매 정책을 확인해 주세요." } },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { success: false, error: { code: "internal_error", message: "네이버 판매 정책을 저장하지 못했습니다." } },
    { status: 500 },
  );
}
