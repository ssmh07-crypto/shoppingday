import { NextResponse } from "next/server";
import { createSourcingResearchService } from "@/modules/sourcing/sourcing-factory";
import {
  withAdminSourcingReadRoute,
  withAdminSourcingRoute,
} from "./route-utils";

export async function GET() {
  return withAdminSourcingReadRoute(async (user, database) => {
    const items = await createSourcingResearchService(database).list(user.id);
    return NextResponse.json(
      { success: true, items },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}

export async function POST(request: Request) {
  return withAdminSourcingRoute(async (user, database) => {
    const data = await createSourcingResearchService(database).create(
      user.id,
      await request.json(),
    );
    return NextResponse.json(
      { success: true, data },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
