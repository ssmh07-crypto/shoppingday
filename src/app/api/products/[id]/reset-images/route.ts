import { NextResponse } from "next/server";
import { z } from "zod";
import { createProductEditService } from "@/modules/products/product-edit-factory";
import { withAdminProductRoute } from "../../route-utils";

const resetInput = z.object({ draftVersion: z.number().int().positive() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductRoute(async (user, database) => {
    const { id } = await params;
    const { draftVersion } = resetInput.parse(await request.json());
    const data = await createProductEditService(database).reset(
      id,
      user.id,
      draftVersion,
      "images",
    );
    return NextResponse.json({ success: true, data });
  });
}
