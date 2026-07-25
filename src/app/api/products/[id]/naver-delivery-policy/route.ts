import { NextResponse } from "next/server";
import { z } from "zod";
import {
  NaverDeliveryPolicyNotFoundError,
  NaverDeliveryPolicyRepository,
} from "@/modules/channels/naver/naver-delivery-policy-repository";
import { withAdminProductRoute } from "../../route-utils";

const inputSchema = z.object({ deliveryPolicyId: z.uuid() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductRoute(async (user, database) => {
    try {
      const { id } = await params;
      const input = inputSchema.parse(await request.json());
      const policy = await new NaverDeliveryPolicyRepository(
        database,
      ).saveSelection(id, user.id, input.deliveryPolicyId);
      return NextResponse.json({ success: true, policy });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "validation_error",
              message: "배송정책 관리번호를 선택해 주세요.",
            },
          },
          { status: 400 },
        );
      }
      if (error instanceof NaverDeliveryPolicyNotFoundError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "delivery_policy_not_found",
              message:
                "현재 발행 대상 스토어에서 사용할 수 있는 배송정책이 아닙니다.",
            },
          },
          { status: 422 },
        );
      }
      throw error;
    }
  });
}
