import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { withDbSession } from "@/lib/db";
import { wholesaleSiteInputSchema } from "@/modules/wholesale-sites/wholesale-site";
import { WholesaleSiteRepository } from "@/modules/wholesale-sites/wholesale-site-repository";
import { wholesaleSiteError } from "../errors";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDbSession(async (database) => {
    try {
      const user = await requireAdmin(database);
      const { id } = await params;
      const input = wholesaleSiteInputSchema.parse(await request.json());
      const site = await new WholesaleSiteRepository(database).update(
        user.id,
        id,
        input,
      );
      if (!site) return notFound();
      return NextResponse.json({ success: true, site });
    } catch (error) {
      return wholesaleSiteError(error);
    }
  });
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDbSession(async (database) => {
    try {
      const user = await requireAdmin(database);
      const { id } = await params;
      const removed = await new WholesaleSiteRepository(database).remove(
        user.id,
        id,
      );
      if (!removed) return notFound();
      return NextResponse.json({ success: true });
    } catch (error) {
      return wholesaleSiteError(error);
    }
  });
}

function notFound() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "not_found",
        message: "도매사이트 메모를 찾지 못했습니다.",
      },
    },
    { status: 404 },
  );
}
