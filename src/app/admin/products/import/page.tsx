import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { ImportForm } from "./import-form";
import { ProductSyncControl } from "../product-sync-control";
import { ZicgamFullImport } from "./zicgam-full-import";

// Authentication and the database binding only exist at request time. Never
// execute this administrator page during Next.js static prerendering.
export const dynamic = "force-dynamic";

export default async function ImportProductPage() {
  return withDbReadRecovery(async (database) => {
    await requireAdminPage(database);
    return (
      <main className="container">
        <h1>위탁상품 가져오기</h1>
        <p>공급처별 원본 상품을 가져온 뒤 등록할 상품을 선별합니다.</p>
        <ZicgamFullImport />
        <section className="card">
          <h2>친구도매 전체 상품 가져오기</h2>
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
