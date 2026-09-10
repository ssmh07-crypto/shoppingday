import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminProductRoute } from "../route-utils";
import { applyNextSupplierChange } from "@/modules/suppliers/core/change-application-service";

export async function POST(request: Request) {
  return withAdminProductRoute(async (user, database) => {
    const input = z
      .object({
        confirmed: z.literal(true),
        kinds: z
          .array(z.enum(["sold_out", "discontinued", "description"]))
          .min(1)
          .max(3),
        supplierCode: z.enum(["dome", "zicgam", "ebulsamchon"]).optional(),
      })
      .strict()
      .parse(await request.json());
    return NextResponse.json({
      success: true,
      result: await applyNextSupplierChange(
        database,
        user.id,
        input.kinds,
        input.supplierCode,
      ),
    });
  });
}
