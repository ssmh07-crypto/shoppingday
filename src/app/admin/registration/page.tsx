import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery, type Database } from "@/lib/db";
import { isNaverCommerceConfigured } from "@/modules/channels/naver/naver-category-service";
import { NaverStoreSettingsRepository } from "@/modules/channels/naver/naver-store-settings-repository";
import { redirect } from "next/navigation";
import { registrationDisplay } from "@/modules/sourcing/registration-display";
import { createSourcingResearchService } from "@/modules/sourcing/sourcing-factory";
import { RegistrationNaverActions } from "./registration-naver-actions";
import { RegistrationStartButton } from "./registration-start-button";

export const dynamic = "force-dynamic";

type RegistrationSearchParams = {
  tab?: string;
  supplier?: string;
  page?: string;
};

export default async function RegistrationPage({
  searchParams,
}: {
  searchParams: Promise<RegistrationSearchParams>;
}) {
  return withDbReadRecovery((database) => renderPage(database, searchParams));
}

async function renderPage(
  database: Database,
  searchParams: Promise<RegistrationSearchParams>,
) {
  const user = await requireAdminPage(database);
  const params = await searchParams;
  if (params.tab === "wholesale") {
    const query = new URLSearchParams();
    if (params.supplier) query.set("supplier", params.supplier);
    if (params.page) query.set("page", params.page);
    redirect(`/admin/products${query.size ? `?${query}` : ""}`);
  }
  const [sourcingItems, storeSettings] = await Promise.all([
    createSourcingResearchService(database).listRegistrations(user.id),
    new NaverStoreSettingsRepository(database).get(user.id),
  ]);
  const connected = isNaverCommerceConfigured() && Boolean(storeSettings);
  const publishedCount = sourcingItems.filter(
    (item) => item.smartstorePublished,
  ).length;

  return (
    <>
      <header className="inventory-topbar registration-topbar">
        <div>
          <strong>상품 등록관리</strong>
          <span>
            소싱 조사를 마친 사입상품의 등록 준비와 판매 상태를 관리합니다.
          </span>
        </div>
        <Link href="/admin/channels/naver">
          {connected
            ? `${storeSettings?.storeName} 연결됨`
            : "스마트스토어 설정 필요"}
        </Link>
      </header>

      <main className="inventory-content registration-page">
        <section className="inventory-heading registration-heading">
          <div>
            <span className="inventory-eyebrow">PRODUCT REGISTRATION</span>
            <h1>스마트스토어 상품 등록관리</h1>
            <p>
              소싱 조사 → 이미지·상세페이지 준비 → 카테고리·속성 확인 →
              스마트스토어 등록
            </p>
          </div>
        </section>

        <section className="registration-stats" aria-label="상품 등록 현황">
          <article>
            <span>소싱조사 상품</span>
            <strong>{sourcingItems.length.toLocaleString("ko-KR")}</strong>
          </article>
          <article>
            <span>등록 준비 중</span>
            <strong>
              {(sourcingItems.length - publishedCount).toLocaleString("ko-KR")}
            </strong>
          </article>
          <article>
            <span>스마트스토어 등록</span>
            <strong>{publishedCount.toLocaleString("ko-KR")}</strong>
          </article>
        </section>

        {!connected && (
          <div className="registration-alert">
            <strong>등록하려면 스마트스토어 연결이 필요합니다.</strong>
            <span>
              상품 편집은 가능하지만 실제 등록·변경 작업 전에는 스토어와
              커머스API 인증정보를 설정해야 합니다.
            </span>
            <Link href="/admin/channels/naver">스마트스토어 설정 열기 →</Link>
          </div>
        )}

        <nav className="registration-source-tabs" aria-label="상품 작업 경로">
          <Link href="/admin/sourcing">소싱 조사</Link>
          <Link
            className="active"
            href="/admin/registration"
            aria-current="page"
          >
            사입상품 등록 준비
          </Link>
          <Link href="/admin/products">위탁상품은 위탁상품관리에서 →</Link>
        </nav>
        <SourcingRegistrationTable
          items={sourcingItems}
          connected={connected}
        />
      </main>
    </>
  );
}

function SourcingRegistrationTable({
  items,
  connected,
}: {
  items: Awaited<
    ReturnType<
      ReturnType<typeof createSourcingResearchService>["listRegistrations"]
    >
  >;
  connected: boolean;
}) {
  return (
    <section className="registration-panel">
      <div className="registration-panel-head">
        <div>
          <h2>소싱조사에서 넘어온 상품</h2>
          <p>조사 결과로 만든 등록 초안과 스마트스토어 상태입니다.</p>
        </div>
        <Link href="/admin/sourcing">소싱조사 열기</Link>
      </div>
      <div className="registration-table-wrap">
        <table className="registration-table">
          <thead>
            <tr>
              <th>소싱 아이템</th>
              <th>검색수</th>
              <th>6개월 매출</th>
              <th>판매가</th>
              <th>등록 상태</th>
              <th>스마트스토어 작업</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const display = registrationDisplay(item);
              return (
                <tr key={item.id}>
                  <td>
                    <strong>{item.productTitle || item.sourcingKeyword}</strong>
                    <span>{sourcingStatusLabel(item.sourcingStatus)}</span>
                  </td>
                  <td>{formatNumber(item.monthlySearchVolume)}</td>
                  <td>{formatRevenue(item.sixMonthRevenue)}</td>
                  <td>{formatWon(display.sellingPrice)}</td>
                  <td>
                    <RegistrationStatus
                      label={display.statusLabel}
                      className={display.statusClassName}
                      remoteStatusType={item.remoteStatusType}
                      channelProductNo={item.channelProductNo}
                    />
                  </td>
                  <td>
                    {item.registrationProductId ? (
                      <RegistrationNaverActions
                        productId={item.registrationProductId}
                        title={
                          item.productTitle ||
                          item.sourcingKeyword ||
                          "소싱 상품"
                        }
                        editHref={`/admin/registration/${item.id}/edit`}
                        channelProductNo={item.channelProductNo}
                        publicationStatus={item.publicationStatus}
                        remoteStatusType={item.remoteStatusType}
                        connected={connected}
                      />
                    ) : (
                      <RegistrationStartButton
                        researchId={item.id}
                        disabled={!item.sourcingKeyword.trim()}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
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
  );
}

function RegistrationStatus({
  label,
  className,
  remoteStatusType,
  channelProductNo,
}: {
  label: string;
  className: string;
  remoteStatusType: string | null;
  channelProductNo: string | null;
}) {
  return (
    <span className={`registration-badge ${className}`}>
      {label}
      {channelProductNo && <small>#{channelProductNo}</small>}
      {remoteStatusType && remoteStatusType !== "SALE" && (
        <small>{remoteStatusLabel(remoteStatusType)}</small>
      )}
    </span>
  );
}

function remoteStatusLabel(status: string) {
  return (
    {
      OUTOFSTOCK: "품절",
      SUSPENSION: "판매 중지",
      DELETE: "삭제",
    }[status] ?? status
  );
}

function sourcingStatusLabel(status: string) {
  return (
    {
      researching: "조사 중",
      candidate: "소싱 후보",
      sample_ordered: "샘플 확인 중",
      selected: "소싱 결정",
      rejected: "보류",
    }[status] ?? status
  );
}

function formatNumber(value: number | null) {
  return value == null ? "미입력" : value.toLocaleString("ko-KR");
}

function formatRevenue(value: number | null) {
  return value == null
    ? "미입력"
    : `${(value / 10_000).toLocaleString("ko-KR", {
        maximumFractionDigits: 1,
      })}만원`;
}

function formatWon(value: number | null) {
  return value == null ? "미입력" : `${value.toLocaleString("ko-KR")}원`;
}
