import { NextResponse } from "next/server";
import { naverPublicationPolicyOverridesSchema } from "@/modules/channels/naver/naver-publication-policy";
import { NaverPublicationPolicyRepository } from "@/modules/channels/naver/naver-publication-policy-repository";
import { withAdminProductReadRoute, withAdminProductRoute } from "../../route-utils";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductReadRoute(async (user, database) => {
    const { id } = await params;
    const policy = await new NaverPublicationPolicyRepository(database).getForProduct(id, user.id);
    return NextResponse.json(
      { success: true, policy },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductRoute(async (user, database) => {
    const { id } = await params;
    const overrides = naverPublicationPolicyOverridesSchema.parse(await request.json());
    const policy = await new NaverPublicationPolicyRepository(database).saveProductOverrides(id, user.id, overrides);
    return NextResponse.json({ success: true, policy });
  });
}
