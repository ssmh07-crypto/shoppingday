import { NextResponse } from "next/server";
import { createProductEditService } from "@/modules/products/product-edit-factory";
import { withAdminProductRoute } from "../../route-utils";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductRoute(async (user, database) => {
    const { id } = await params;
    const data = await createProductEditService(database).markReady(
      id,
      user.id,
      await request.json(),
    );
    return NextResponse.json({ success: true, data });
  });
}
