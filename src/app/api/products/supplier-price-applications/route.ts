import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminProductRoute } from "../route-utils";
import { applyNextSupplierPrice } from "@/modules/suppliers/core/price-application-service";

export async function POST(request: Request) {
  return withAdminProductRoute(async (user, database) => {
    const input = z
      .object({
        confirmed: z.literal(true),
        supplierCode: z.enum(["dome", "zicgam", "ebulsamchon"]).optional(),
        productIds: z.array(z.uuid()).min(1).max(100).optional(),
      })
      .strict()
      .parse(await request.json());
    return NextResponse.json({
      success: true,
      result: await applyNextSupplierPrice(
        database,
        user.id,
        input.supplierCode,
        input.productIds,
      ),
    });
  });
}
