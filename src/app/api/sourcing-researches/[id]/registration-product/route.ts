import { NextResponse } from "next/server";
import { createSourcingResearchService } from "@/modules/sourcing/sourcing-factory";
import { withAdminSourcingRoute } from "../../route-utils";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminSourcingRoute(async (user, database) => {
    const { id } = await params;
    const data = await createSourcingResearchService(database)
      .createRegistrationProduct(user.id, id);
    return NextResponse.json(
      { success: true, data },
      { status: data.alreadyExists ? 200 : 201 },
    );
  });
}
