import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery, type Database } from "@/lib/db";
import { isNaverCommerceConfigured } from "@/modules/channels/naver/naver-category-service";
import { NaverStoreSettingsRepository } from "@/modules/channels/naver/naver-store-settings-repository";
import { createSourcingResearchService } from "@/modules/sourcing/sourcing-factory";
import { RegistrationStartButton } from "./registration-start-button";

export const dynamic = "force-dynamic";

export default async function RegistrationPage() {
  return withDbReadRecovery((database) => renderPage(database));
}

async function renderPage(database: Database) {
  const user = await requireAdminPage(database);
  const [items, storeSettings] = await Promise.all([
    createSourcingResearchService(database).listRegistrations(user.id),
    new NaverStoreSettingsRepository(database).get(user.id),
  ]);
  const apiConfigured = isNaverCommerceConfigured();
  const connected = apiConfigured && Boolean(storeSettings);
  const prepared = items.filter((item) => item.registrationProductId).length;
  const ready = items.filter((item) => item.productStatus === "ready").length;

  return (
    <>
      <header className="inventory-topbar registration-topbar">
        <div>
          <strong>상품 등록관리</strong>
          <span>
            소싱 아이템을 스마트스토어 등록용 상품 초안으로 준비합니다.
          </span>
        </div>
        <Link href="/admin/sourcing">소싱 목록 열기</Link>
      </header>
      <main className="inventory-content registration-page">
        <section className="inventory-heading registration-heading">
          <div>
            <span className="inventory-eyebrow">PRODUCT REGISTRATION</span>
            <h1>소싱 아이템 등록 준비</h1>
            <p>
              상품명·태그·판매가 초안을 가져오고, 카테고리·속성·재고·이미지를
              확인한 뒤 네이버에 등록하세요.
            </p>
          </div>
          <Link
            className={connected ? "connected" : "needs-setting"}
            href="/admin/channels/naver"
          >
            {connected
              ? `${storeSettings?.storeName} 연결됨`
              : "스마트스토어 설정 필요"}
          </Link>
        </section>

        <section className="registration-stats" aria-label="등록 준비 현황">
          <article>
            <span>저장된 소싱 아이템</span>
            <strong>{items.length}</strong>
          </article>
          <article>
            <span>상품 초안 생성</span>
            <strong>{prepared}</strong>
          </article>
          <article>
            <span>등록 준비 완료</span>
            <strong>{ready}</strong>
          </article>
        </section>

        {!connected && (
          <div className="registration-alert">
            <strong>등록할 스마트스토어 연결이 필요합니다.</strong>
            <span>
              상품 준비는 먼저 할 수 있지만 실제 등록 전에는 등록 대상 스토어와
              커머스 API 인증정보를 모두 설정해야 합니다.
            </span>
            <Link href="/admin/channels/naver">스마트스토어 설정 열기 →</Link>
          </div>
        )}

        <section className="registration-panel">
          <div className="registration-panel-head">
            <div>
              <h2>등록 대기 소싱 아이템</h2>
              <p>소싱 조사에 저장된 모든 아이템을 표시합니다.</p>
            </div>
          </div>
          <div className="registration-table-wrap">
            <table className="registration-table">
              <thead>
                <tr>
                  <th>소싱 아이템</th>
                  <th>검색수</th>
                  <th>6개월 매출</th>
                  <th>예상 판매가</th>
                  <th>등록 상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>
                        {item.sourcingKeyword || "새 소싱 아이템"}
                      </strong>
                      <span>{sourcingStatusLabel(item.sourcingStatus)}</span>
                    </td>
                    <td>{formatNumber(item.monthlySearchVolume)}</td>
                    <td>{formatRevenue(item.sixMonthRevenue)}</td>
                    <td>{formatWon(item.expectedSellingPrice)}</td>
                    <td>
                      <RegistrationStatus
                        status={item.productStatus}
                        productId={item.registrationProductId}
                      />
                    </td>
                    <td>
                      {item.registrationProductId ? (
                        <Link
                          className="registration-edit-link"
                          href={`/admin/products/${item.registrationProductId}/edit`}
                        >
                          등록 정보 편집
                        </Link>
                      ) : (
                        <RegistrationStartButton
                          researchId={item.id}
                          disabled={!item.sourcingKeyword.trim()}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!items.length && (
            <div className="registration-empty">
              <strong>저장된 소싱 아이템이 없습니다.</strong>
              <Link href="/admin/sourcing">소싱 아이템 추가하기</Link>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function RegistrationStatus({
  status,
  productId,
}: {
  status: string | null;
  productId: string | null;
}) {
  if (!productId)
    return <span className="registration-badge waiting">초안 생성 전</span>;
  const labels: Record<string, string> = {
    draft: "입력 대기",
    editing: "편집 중",
    ready: "등록 준비 완료",
    archived: "보관",
  };
  return (
    <span className={`registration-badge ${status ?? "draft"}`}>
      {labels[status ?? "draft"] ?? status}
    </span>
  );
}
function sourcingStatusLabel(status: string) {
  return (
    (
      {
        researching: "조사 중",
        candidate: "소싱 후보",
        sample_ordered: "샘플 확인 중",
        selected: "소싱 결정",
        rejected: "보류",
      } as Record<string, string>
    )[status] ?? status
  );
}
function formatNumber(value: number | null) {
  return value == null ? "미입력" : value.toLocaleString("ko-KR");
}
function formatRevenue(value: number | null) {
  return value == null
    ? "미입력"
    : `${(value / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만원`;
}
function formatWon(value: number | null) {
  return value == null ? "미입력" : `${value.toLocaleString("ko-KR")}원`;
}
