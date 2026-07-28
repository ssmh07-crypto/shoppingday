import { NextResponse } from "next/server";
import { z } from "zod";
import { NaverBulkJobService } from "@/modules/channels/naver/naver-bulk-job-service";
import { withAdminProductRoute } from "../../../route-utils";

const paramsSchema = z.object({ id: z.uuid() });

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductRoute(async (user, database) => {
    const { id } = paramsSchema.parse(await params);
    const result = await new NaverBulkJobService(database).runNext(id, user.id);
    return NextResponse.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
