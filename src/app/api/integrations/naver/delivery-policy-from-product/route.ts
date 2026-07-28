import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { NaverCommerceError } from "@/modules/channels/naver/naver-commerce-client";
import { createConfiguredNaverClientForUser } from "@/modules/channels/naver/naver-category-service";
import { naverDeliveryInfoSchema } from "@/modules/channels/naver/naver-publication-policy";
import { extractSmartstoreProductNo } from "@/modules/keywords/keyword-utils";

const inputSchema = z.object({
  storeConnectionId: z.uuid(),
  product: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    return await withDbReadRecovery(async (database) => {
      const user = await requireAdmin(database);
      const input = inputSchema.parse(await request.json());
      const channelProductNo = parseChannelProductNo(input.product);
      if (!channelProductNo) {
        return errorResponse(
          400,
          "invalid_product",
          "스마트스토어 상품 링크 또는 채널상품번호를 확인해 주세요.",
        );
      }
      const client = await createConfiguredNaverClientForUser(
        database,
        user.id,
        undefined,
        input.storeConnectionId,
      );
      const product = await client.fetchChannelProduct(channelProductNo);
      const deliveryInfo = naverDeliveryInfoSchema.safeParse(
        product.originProduct.deliveryInfo,
      );
      if (!deliveryInfo.success || !Object.keys(deliveryInfo.data).length) {
        return errorResponse(
          422,
          "delivery_info_missing",
          "해당 상품에서 배송정책을 확인하지 못했습니다.",
        );
      }
      return NextResponse.json(
        {
          success: true,
          data: {
            channelProductNo,
            productName: product.originProduct.name,
            deliveryInfo: deliveryInfo.data,
          },
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(401, error.code, error.message);
    }
    if (error instanceof z.ZodError) {
      return errorResponse(
        400,
        "validation_error",
        "연결된 스마트스토어와 기존 상품을 확인해 주세요.",
      );
    }
    if (error instanceof NaverCommerceError) {
      return errorResponse(
        error.responseStatus === 404 ? 404 : error.code === "timeout" ? 504 : 502,
        error.code,
        error.responseStatus === 404
          ? "선택한 스토어에서 해당 상품을 찾지 못했습니다."
          : error.message,
      );
    }
    throw error;
  }
}

function parseChannelProductNo(value: string) {
  const normalized = value.trim();
  return /^\d{1,20}$/.test(normalized)
    ? normalized
    : extractSmartstoreProductNo(normalized);
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}
