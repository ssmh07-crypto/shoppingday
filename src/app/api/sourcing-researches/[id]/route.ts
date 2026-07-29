import { NextResponse } from "next/server";
import { createSourcingResearchService } from "@/modules/sourcing/sourcing-factory";
import {
  withAdminSourcingReadRoute,
  withAdminSourcingRoute,
} from "../route-utils";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminSourcingReadRoute(async (user, database) => {
    const { id } = await params;
    const data = await createSourcingResearchService(database).get(user.id, id);
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminSourcingRoute(async (user, database) => {
    const { id } = await params;
    const data = await createSourcingResearchService(database).update(
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
