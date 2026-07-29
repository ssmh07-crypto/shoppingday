import { NextResponse } from "next/server";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import {
  NaverCommerceError,
  type NaverCommerceSellerAddress,
} from "@/modules/channels/naver/naver-commerce-client";
import { createConfiguredNaverClientForUser } from "@/modules/channels/naver/naver-category-service";

const RELEASE_TYPES = new Set([
  "RELEASE",
  "LOGISTICS_CENTER_RELEASE",
]);
const RETURN_TYPES = new Set([
  "REFUND_OR_EXCHANGE",
  "LOGISTICS_CENTER_REFUND_OR_EXCHANGE",
]);

export async function GET(request: Request) {
  try {
    return await withDbReadRecovery(async (database) => {
      const user = await requireAdmin(database);
      const storeConnectionId =
        new URL(request.url).searchParams.get("storeConnectionId") ?? undefined;
      const client = await createConfiguredNaverClientForUser(
        database,
        user.id,
        undefined,
        storeConnectionId,
      );
      const [addresses, bundleGroups, returnDeliveryCompanies] =
        await Promise.all([
          client.fetchSellerAddresses(),
          client.fetchDeliveryBundleGroups(),
          client.fetchReturnDeliveryCompanies(),
        ]);
      return NextResponse.json(
        {
          success: true,
          data: {
            releaseAddresses: addresses.filter((address) =>
              RELEASE_TYPES.has(address.addressType),
            ),
            returnAddresses: addresses.filter((address) =>
              RETURN_TYPES.has(address.addressType),
            ),
            bundleGroups: bundleGroups.filter((group) => group.usable),
            returnDeliveryCompanies,
          },
        },
        {
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: 401 },
      );
    }
    if (error instanceof NaverCommerceError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.code === "timeout" ? 504 : 502 },
      );
    }
    console.error(
      JSON.stringify({ event: "naver_delivery_options_fetch_failed" }),
    );
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "internal_error",
          message: "스마트스토어 배송 정보를 불러오지 못했습니다.",
        },
      },
      { status: 500 },
    );
  }
}

export type NaverDeliveryOptionsResponse = {
  releaseAddresses: NaverCommerceSellerAddress[];
  returnAddresses: NaverCommerceSellerAddress[];
  bundleGroups: Array<{
    id: number;
    name: string;
    baseGroup: boolean;
  }>;
  returnDeliveryCompanies: Array<{
    id: number;
    name: string;
    returnDeliveryCompanyPriorityType: string;
  }>;
};
