import { NextResponse } from "next/server";
import { createProductEditService } from "@/modules/products/product-edit-factory";
import { withAdminProductReadRoute } from "../route-utils";
import { ProductProcessingSettingsRepository } from "@/modules/products/product-processing-settings-repository";
import { NaverPublicationPolicyRepository } from "@/modules/channels/naver/naver-publication-policy-repository";
import { NaverStoreSettingsRepository } from "@/modules/channels/naver/naver-store-settings-repository";
import { NaverStoreTargetRepository } from "@/modules/channels/naver/naver-store-target-repository";
import { emptyNaverPublicationPolicy } from "@/modules/channels/naver/naver-publication-policy";
import { NaverDeliveryPolicyRepository } from "@/modules/channels/naver/naver-delivery-policy-repository";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductReadRoute(async (user, database) => {
    const { id } = await params;
    const [data, settings, naverStoreConnections, targetStore] =
      await Promise.all([
        createProductEditService(database).get(id, user.id),
        new ProductProcessingSettingsRepository(database).get(user.id),
        new NaverStoreSettingsRepository(database).list(user.id),
        new NaverStoreTargetRepository(database).getForProduct(id, user.id),
      ]);
    const [naverPublicationPolicy, naverDeliveryPolicies] = targetStore
      ? await Promise.all([
          new NaverPublicationPolicyRepository(database).getForProduct(
            id,
            user.id,
            targetStore.id,
          ),
          new NaverDeliveryPolicyRepository(database).listSummaries(
            user.id,
            targetStore.id,
          ),
        ])
      : [
          {
            defaults: emptyNaverPublicationPolicy,
            overrides: {},
            effective: emptyNaverPublicationPolicy,
            deliveryPolicy: null,
          },
          [],
        ];
    return NextResponse.json(
      {
        success: true,
        data: {
          ...data,
          settings,
          naverPublicationPolicy,
          naverDeliveryPolicies,
          naverStoreConnections,
          naverStoreConnectionId: targetStore?.id ?? null,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
