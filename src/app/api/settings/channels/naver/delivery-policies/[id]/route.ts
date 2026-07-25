import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { withDbSession } from "@/lib/db";
import { naverDeliveryPolicyTemplateInputSchema } from "@/modules/channels/naver/naver-delivery-policy";
import {
  NaverDeliveryPolicyInUseError,
  NaverDeliveryPolicyRepository,
} from "@/modules/channels/naver/naver-delivery-policy-repository";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDbSession(async (database) => {
    try {
      const user = await requireAdmin(database);
      const { id } = await params;
      const input = naverDeliveryPolicyTemplateInputSchema.parse(
        await request.json(),
      );
      const policy = await new NaverDeliveryPolicyRepository(database).update(
        user.id,
        id,
        input,
      );
      if (!policy) return notFound();
      return NextResponse.json({ success: true, policy });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "validation_error",
              message:
                error.issues[0]?.message ?? "배송정책을 확인해 주세요.",
            },
          },
          { status: 400 },
        );
      }
      throw error;
    }
  });
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDbSession(async (database) => {
    try {
      const user = await requireAdmin(database);
      const { id } = await params;
      const removed = await new NaverDeliveryPolicyRepository(database).remove(
        user.id,
        id,
      );
      if (!removed) return notFound();
      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof NaverDeliveryPolicyInUseError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "delivery_policy_in_use",
              message:
                "상품에서 사용 중인 배송정책은 삭제할 수 없습니다. 상품의 정책을 먼저 변경해 주세요.",
            },
          },
          { status: 409 },
        );
      }
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "validation_error",
              message: error.issues[0]?.message,
            },
          },
          { status: 400 },
        );
      }
      throw error;
    }
  });
}

function notFound() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "delivery_policy_not_found",
        message: "배송정책을 찾지 못했습니다.",
      },
    },
    { status: 404 },
  );
}
