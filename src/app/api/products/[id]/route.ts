import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { ProductEditService } from "@/modules/products/product-edit-service";
import { ProductEditRepository } from "@/modules/products/product-edit-repository";
import { productError } from "../route-utils";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdmin();
    const { id } = await params;
    return NextResponse.json({
      success: true,
      data: await withDbReadRecovery(() =>
        new ProductEditService(new ProductEditRepository()).get(id, user.id),
      ),
    });
  } catch (error) {
    return productError(error);
  }
}
