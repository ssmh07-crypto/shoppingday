import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery, type Database } from "@/lib/db";
import { createProductEditService } from "@/modules/products/product-edit-factory";
import {
  ProductListView,
  type ProductListSearchParams,
} from "./product-list-view";

// Authentication and Hyperdrive bindings are request-only. Explicitly opt out
// of Next.js build-time execution even when no search parameters are present.
export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<ProductListSearchParams>;
}) {
  return withDbReadRecovery((database) =>
    renderProductsPage(searchParams, database),
  );
}

async function renderProductsPage(
  searchParams: Promise<ProductListSearchParams>,
  database: Database,
) {
  const user = await requireAdminPage(database);
  const params = await searchParams;
  const result = await createProductEditService(database).list(user.id, {
    search: params.search,
    filter: params.filter,
    sort: params.sort,
    page: Number(params.page) || 1,
    pageSize: Number(params.size) || 30,
  });
  return <ProductListView params={params} result={result} />;
}
