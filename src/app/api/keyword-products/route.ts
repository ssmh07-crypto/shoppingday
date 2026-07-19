import { NextResponse } from "next/server";
import {
  createKeywordManagementService,
  keywordRuntimeStatus,
} from "@/modules/keywords/keyword-factory";
import { withAdminKeywordReadRoute, withAdminKeywordRoute } from "./route-utils";

export async function GET() {
  return withAdminKeywordReadRoute(async (user, database) => {
    const items = await createKeywordManagementService(database).list(user.id);
    return NextResponse.json(
      { success: true, items, runtime: keywordRuntimeStatus() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}

export async function POST(request: Request) {
  return withAdminKeywordRoute(async (user, database) => {
    const data = await createKeywordManagementService(database).create(
      user.id,
      await request.json(),
    );
    return NextResponse.json(
      { success: true, data, runtime: keywordRuntimeStatus() },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  });
}

