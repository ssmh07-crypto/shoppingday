import { NextResponse } from "next/server";
import {
  withAdminProductReadRoute,
  withAdminProductRoute,
} from "../../route-utils";
import { SourcingSupplierSourceService } from "@/modules/products/sourcing-supplier-source";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductReadRoute(async (user, database) => {
    const { id } = await params;
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const items = await new SourcingSupplierSourceService(database).search(
      id,
      user.id,
      query,
    );
    return NextResponse.json(
      { success: true, items },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductRoute(async (user, database) => {
    const { id } = await params;
    const data = await new SourcingSupplierSourceService(database).apply(
      id,
      user.id,
      await request.json(),
    );
    return NextResponse.json({ success: true, data });
  });
}
