import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { ImportForm } from "./import-form";
import { ProductSyncControl } from "../product-sync-control";

// Authentication and the database binding only exist at request time. Never
// execute this administrator page during Next.js static prerendering.
export const dynamic = "force-dynamic";

export default async function ImportProductPage() {
  return withDbReadRecovery(async (database) => {
    await requireAdminPage(database);
    return (
      <main className="container">
        <h1>친구도매 상품 가져오기</h1>
        <p>상품번호를 입력하고 버튼을 누를 때만 친구도매 API를 호출합니다.</p>
        <section className="card">
          <h2>전체 상품 가져오기</h2>
          <p>
            GitHub Actions에서 전체 상품을 가져옵니다. 기존 판매 편집값은
            유지됩니다.
          </p>
          <ProductSyncControl mode="all" variant="card" />
        </section>
        <ImportForm />
      </main>
    );
  });
}
