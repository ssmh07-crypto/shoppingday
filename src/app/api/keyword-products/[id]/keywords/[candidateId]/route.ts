import { NextResponse } from "next/server";
import { createKeywordManagementService } from "@/modules/keywords/keyword-factory";
import { withAdminKeywordRoute } from "../../../route-utils";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; candidateId: string }> },
) {
  return withAdminKeywordRoute(async (user, database) => {
    const { id, candidateId } = await params;
    const data = await createKeywordManagementService(database).updateKeywordReview(
      user.id,
      id,
      candidateId,
      await request.json(),
    );
    return NextResponse.json({ success: true, data });
  });
}
