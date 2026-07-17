import { NextResponse } from "next/server";
import { createProductEditService } from "@/modules/products/product-edit-factory";
import { withAdminProductReadRoute } from "../route-utils";
import { ProductProcessingSettingsRepository } from "@/modules/products/product-processing-settings-repository";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductReadRoute(async (user, database) => {
    const { id } = await params;
    const [data, settings] = await Promise.all([
      createProductEditService(database).get(id, user.id),
      new ProductProcessingSettingsRepository(database).get(user.id),
    ]);
    return NextResponse.json(
      { success: true, data: { ...data, settings } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
