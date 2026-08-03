import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery, withDbSession } from "@/lib/db";
import { wholesaleSiteInputSchema } from "@/modules/wholesale-sites/wholesale-site";
import { WholesaleSiteRepository } from "@/modules/wholesale-sites/wholesale-site-repository";
import { wholesaleSiteError } from "./errors";

export async function GET() {
  try {
    return await withDbReadRecovery(async (database) => {
      const user = await requireAdmin(database);
      const sites = await new WholesaleSiteRepository(database).list(user.id);
      return NextResponse.json(
        { success: true, sites },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    });
  } catch (error) {
    return wholesaleSiteError(error);
  }
}

export async function POST(request: Request) {
  return withDbSession(async (database) => {
    try {
      const user = await requireAdmin(database);
      const input = wholesaleSiteInputSchema.parse(await request.json());
      const site = await new WholesaleSiteRepository(database).create(
        user.id,
        input,
      );
      return NextResponse.json({ success: true, site }, { status: 201 });
    } catch (error) {
      return wholesaleSiteError(error);
    }
  });
}
