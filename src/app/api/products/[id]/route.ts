import { NextResponse } from "next/server";
import { createProductEditService } from "@/modules/products/product-edit-factory";
import { withAdminProductReadRoute } from "../route-utils";
import { ProductProcessingSettingsRepository } from "@/modules/products/product-processing-settings-repository";
import { NaverPublicationPolicyRepository } from "@/modules/channels/naver/naver-publication-policy-repository";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductReadRoute(async (user, database) => {
    const { id } = await params;
    const [data, settings, naverPublicationPolicy] = await Promise.all([
      createProductEditService(database).get(id, user.id),
      new ProductProcessingSettingsRepository(database).get(user.id),
      new NaverPublicationPolicyRepository(database).getForProduct(id, user.id),
    ]);
    return NextResponse.json(
      { success: true, data: { ...data, settings, naverPublicationPolicy } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
