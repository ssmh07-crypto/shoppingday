import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminProductRoute } from "../route-utils";
import { applyNextSupplierPrice } from "@/modules/suppliers/core/price-application-service";

export async function POST(request: Request) {
  return withAdminProductRoute(async (user, database) => {
    z.object({ confirmed: z.literal(true) })
      .strict()
      .parse(await request.json());
    return NextResponse.json({
      success: true,
      result: await applyNextSupplierPrice(database, user.id),
    });
  });
}
