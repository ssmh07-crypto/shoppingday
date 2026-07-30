import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { ProductProcessingSettingsRepository } from "@/modules/products/product-processing-settings-repository";
import { ProductSettingsForm } from "./product-settings-form";
import { NaverPublicationPolicyRepository } from "@/modules/channels/naver/naver-publication-policy-repository";
import { NaverPublicationPolicyForm } from "@/app/admin/components/naver-publication-policy-form";
import { NaverStoreSettingsRepository } from "@/modules/channels/naver/naver-store-settings-repository";
import { emptyNaverPublicationPolicy } from "@/modules/channels/naver/naver-publication-policy";

export const dynamic = "force-dynamic";

export default async function ProductSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ storeConnectionId?: string }>;
}) {
  return withDbReadRecovery(async (database) => {
    const user = await requireAdminPage(database);
    const params = await searchParams;
    const stores = await new NaverStoreSettingsRepository(database).list(
      user.id,
    );
    const selectedStore =
      stores.find((store) => store.id === params.storeConnectionId) ??
      stores.find((store) => store.isDefault) ??
      stores[0] ??
      null;
    const [settings, naverPolicy] = await Promise.all([
      new ProductProcessingSettingsRepository(database).get(user.id),
      selectedStore
        ? new NaverPublicationPolicyRepository(database).getDefault(
            user.id,
            selectedStore.id,
          )
        : Promise.resolve(emptyNaverPublicationPolicy),
    ]);
    return (
      <main className="product-settings-page">
        <div className="product-settings-shell">
          <Link href="/admin/products" className="product-settings-back">
            ← 위탁상품관리
          </Link>
          <header className="product-settings-heading">
            <span>위탁상품관리</span>
            <h1>상품 처리 설정</h1>
          </header>
          <ProductSettingsForm initial={settings} />
          <section className="product-settings-section naver-policy-settings">
            <div>
              <span>판매 채널</span>
              <h2>네이버 스마트스토어 기본 정책</h2>
            </div>
            {stores.length > 0 && (
              <form method="get">
                <label>
                  <span>배송·판매 기본정책을 설정할 스토어</span>
                  <select
                    name="storeConnectionId"
                    defaultValue={selectedStore?.id}
                    onChange={undefined}
                  >
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.storeName}
                        {store.isDefault ? " · 기본" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit">스토어 정책 불러오기</button>
              </form>
            )}
            <NaverPublicationPolicyForm
              mode="default"
              endpoint={
                selectedStore
                  ? `/api/settings/channels/naver?storeConnectionId=${selectedStore.id}`
                  : "/api/settings/channels/naver"
              }
              initialDefaults={naverPolicy}
            />
          </section>
        </div>
      </main>
    );
  });
}
