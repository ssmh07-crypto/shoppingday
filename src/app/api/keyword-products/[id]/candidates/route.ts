import { NextResponse } from "next/server";
import { createKeywordManagementService } from "@/modules/keywords/keyword-factory";
import { withAdminKeywordRoute } from "../../route-utils";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminKeywordRoute(async (user, database) => {
    const { id } = await params;
    const data = await createKeywordManagementService(database).generateCandidates(
      user.id,
      id,
    );
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
