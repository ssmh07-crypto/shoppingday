import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { ProductProcessingSettingsRepository } from "@/modules/products/product-processing-settings-repository";
import { ProductSettingsForm } from "./product-settings-form";

export const dynamic = "force-dynamic";

export default async function ProductSettingsPage() {
  return withDbReadRecovery(async (database) => {
    const user = await requireAdminPage(database);
    const settings = await new ProductProcessingSettingsRepository(
      database,
    ).get(user.id);
    return (
      <main className="product-settings-page">
        <div className="product-settings-shell">
          <Link href="/admin/products" className="product-settings-back">
            ← 상품 관리
          </Link>
          <header className="product-settings-heading">
            <span>상품 관리</span>
            <h1>상품 처리 설정</h1>
          </header>
          <ProductSettingsForm initial={settings} />
        </div>
      </main>
    );
  });
}
