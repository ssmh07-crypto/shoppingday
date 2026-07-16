import { NextResponse } from "next/server";
import { createProductEditService } from "@/modules/products/product-edit-factory";
import { withAdminProductReadRoute } from "../route-utils";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductReadRoute(async (user, database) => {
    const { id } = await params;
    const data = await createProductEditService(database).get(id, user.id);
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
