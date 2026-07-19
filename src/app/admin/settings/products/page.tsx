import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { ProductProcessingSettingsRepository } from "@/modules/products/product-processing-settings-repository";
import { ProductSettingsForm } from "./product-settings-form";
import { NaverPublicationPolicyRepository } from "@/modules/channels/naver/naver-publication-policy-repository";
import { NaverPublicationPolicyForm } from "@/app/admin/components/naver-publication-policy-form";

export const dynamic = "force-dynamic";

export default async function ProductSettingsPage() {
  return withDbReadRecovery(async (database) => {
    const user = await requireAdminPage(database);
    const [settings, naverPolicy] = await Promise.all([
      new ProductProcessingSettingsRepository(database).get(user.id),
      new NaverPublicationPolicyRepository(database).getDefault(user.id),
    ]);
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
          <section className="product-settings-section naver-policy-settings">
            <div>
              <span>판매 채널</span>
              <h2>네이버 스마트스토어 기본 정책</h2>
            </div>
            <NaverPublicationPolicyForm
              mode="default"
              endpoint="/api/settings/channels/naver"
              initialDefaults={naverPolicy}
            />
          </section>
        </div>
      </main>
    );
  });
}
