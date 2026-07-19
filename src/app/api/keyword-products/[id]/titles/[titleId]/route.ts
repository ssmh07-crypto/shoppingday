import { NextResponse } from "next/server";
import { createKeywordManagementService } from "@/modules/keywords/keyword-factory";
import { withAdminKeywordRoute } from "../../../route-utils";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; titleId: string }>;
  },
) {
  return withAdminKeywordRoute(async (user, database) => {
    const { id, titleId } = await params;
    const data = await createKeywordManagementService(database).updateTitle(
      user.id,
      id,
      titleId,
      await request.json(),
    );
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}

