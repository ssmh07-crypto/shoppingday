import { NextResponse } from "next/server";
import { z } from "zod";
import { NaverBulkJobService } from "@/modules/channels/naver/naver-bulk-job-service";
import {
  withAdminProductReadRoute,
  withAdminProductRoute,
} from "../route-utils";

const createSchema = z.object({
  confirmed: z.literal(true),
  type: z.enum(["upload_images", "publish"]),
  productIds: z.array(z.uuid()).min(1).max(100),
});

export async function GET() {
  return withAdminProductReadRoute(async (user, database) => {
    const jobs = await new NaverBulkJobService(database).list(user.id);
    return NextResponse.json(
      { success: true, jobs },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}

export async function POST(request: Request) {
  return withAdminProductRoute(async (user, database) => {
    const input = createSchema.parse(await request.json());
    const job = await new NaverBulkJobService(database).create(
      user.id,
      input.type,
      input.productIds,
    );
    return NextResponse.json({ success: true, job }, { status: 201 });
  });
}
