import { NextResponse } from "next/server";
import { createKeywordManagementService } from "@/modules/keywords/keyword-factory";
import { withAdminKeywordRoute } from "../../route-utils";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminKeywordRoute(async (user, database) => {
    const { id } = await params;
    const data = await createKeywordManagementService(database).generateTitle(
      user.id,
      id,
      await request.json(),
    );
    return NextResponse.json(
      { success: true, data },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  });
}

