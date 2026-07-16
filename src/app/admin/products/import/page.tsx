import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { ImportForm } from "./import-form";

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
        <ImportForm />
      </main>
    );
  });
}
