import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery, withDbSession } from "@/lib/db";
import { naverDeliveryPolicyTemplateInputSchema } from "@/modules/channels/naver/naver-delivery-policy";
import {
  NaverDeliveryPolicyRepository,
  NaverDeliveryPolicyStoreNotFoundError,
} from "@/modules/channels/naver/naver-delivery-policy-repository";

const storeQuerySchema = z.uuid();
const createSchema = naverDeliveryPolicyTemplateInputSchema.extend({
  storeConnectionId: z.uuid(),
});

export async function GET(request: Request) {
  return withDbReadRecovery(async (database) => {
    try {
      const user = await requireAdmin(database);
      const storeConnectionId = storeQuerySchema.parse(
        new URL(request.url).searchParams.get("storeConnectionId"),
      );
      const policies = await new NaverDeliveryPolicyRepository(database).list(
        user.id,
        storeConnectionId,
      );
      return NextResponse.json(
        { success: true, policies },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return policyError(
          400,
          "validation_error",
          "조회할 스마트스토어를 선택해 주세요.",
        );
      }
      throw error;
    }
  });
}

export async function POST(request: Request) {
  return withDbSession(async (database) => {
    try {
      const user = await requireAdmin(database);
      const input = createSchema.parse(await request.json());
      const policy = await new NaverDeliveryPolicyRepository(database).create(
        user.id,
        input.storeConnectionId,
        input,
      );
      return NextResponse.json({ success: true, policy }, { status: 201 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return policyError(
          400,
          "validation_error",
          error.issues[0]?.message ?? "배송정책을 확인해 주세요.",
        );
      }
      if (error instanceof NaverDeliveryPolicyStoreNotFoundError) {
        return policyError(
          404,
          "store_not_found",
          "연결된 스마트스토어를 찾지 못했습니다.",
        );
      }
      throw error;
    }
  });
}

function policyError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}
