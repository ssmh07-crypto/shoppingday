import { NextResponse } from "next/server";
import { createKeywordManagementService } from "@/modules/keywords/keyword-factory";
import { withAdminKeywordRoute } from "../route-utils";

export async function POST() {
  return withAdminKeywordRoute(async (user, database) => {
    const items = await createKeywordManagementService(
      database,
      user.id,
    ).refreshAllSalesSummaries(user.id);
    return NextResponse.json(
      { success: true, items },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
