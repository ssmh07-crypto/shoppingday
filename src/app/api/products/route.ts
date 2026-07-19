import { NextResponse } from "next/server";
import { createProductEditService } from "@/modules/products/product-edit-factory";
import { withAdminProductReadRoute } from "./route-utils";

export async function GET(request: Request) {
  return withAdminProductReadRoute(async (user, database) => {
    const url = new URL(request.url);
    const data = await createProductEditService(database).list(user.id, {
      search: url.searchParams.get("search") ?? undefined,
      filter: url.searchParams.get("filter") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      page: Number(url.searchParams.get("page")) || 1,
      pageSize: Number(url.searchParams.get("pageSize")) || undefined,
    });
    return NextResponse.json({ success: true, ...data });
  });
}
