import { NextResponse } from "next/server";
import {
  createKeywordManagementService,
  keywordRuntimeStatus,
} from "@/modules/keywords/keyword-factory";
import {
  withAdminKeywordReadRoute,
  withAdminKeywordRoute,
} from "../route-utils";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminKeywordReadRoute(async (user, database) => {
    const { id } = await params;
    const data = await createKeywordManagementService(database).get(user.id, id);
    return NextResponse.json(
      { success: true, data, runtime: keywordRuntimeStatus() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminKeywordRoute(async (user, database) => {
    const { id } = await params;
    const data = await createKeywordManagementService(database).update(
      user.id,
      id,
      await request.json(),
    );
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}

