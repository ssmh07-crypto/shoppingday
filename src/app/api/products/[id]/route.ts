import { NextResponse } from "next/server";
import { createProductEditService } from "@/modules/products/product-edit-factory";
import { withAdminProductReadRoute } from "../route-utils";
import { ProductProcessingSettingsRepository } from "@/modules/products/product-processing-settings-repository";
import { NaverPublicationPolicyRepository } from "@/modules/channels/naver/naver-publication-policy-repository";
import { NaverStoreSettingsRepository } from "@/modules/channels/naver/naver-store-settings-repository";
import { NaverStoreTargetRepository } from "@/modules/channels/naver/naver-store-target-repository";
import { emptyNaverPublicationPolicy } from "@/modules/channels/naver/naver-publication-policy";

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
    const naverPublicationPolicy = targetStore
      ? await new NaverPublicationPolicyRepository(database).getForProduct(
          id,
          user.id,
          targetStore.id,
        )
      : {
          defaults: emptyNaverPublicationPolicy,
          overrides: {},
          effective: emptyNaverPublicationPolicy,
        };
    return NextResponse.json(
      {
        success: true,
        data: {
          ...data,
          settings,
          naverPublicationPolicy,
          naverStoreConnections,
          naverStoreConnectionId: targetStore?.id ?? null,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
