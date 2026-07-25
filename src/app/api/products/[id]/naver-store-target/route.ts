import { NextResponse } from "next/server";
import { z } from "zod";
import { NaverStoreTargetRepository } from "@/modules/channels/naver/naver-store-target-repository";
import { withAdminProductRoute } from "../../route-utils";

const inputSchema = z.object({ storeConnectionId: z.uuid() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductRoute(async (user, database) => {
    const { id } = await params;
    const input = inputSchema.parse(await request.json());
    const connection = await new NaverStoreTargetRepository(database).save(
      id,
      user.id,
      input.storeConnectionId,
    );
    return NextResponse.json({ success: true, connection });
  });
}
