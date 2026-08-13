import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery, type Database } from "@/lib/db";
import { isNaverCommerceConfigured } from "@/modules/channels/naver/naver-category-service";
import { NaverStoreSettingsRepository } from "@/modules/channels/naver/naver-store-settings-repository";
import { RegistrationManagementRepository } from "@/modules/products/registration-management-repository";
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
  const activeTab = params.tab === "wholesale" ? "wholesale" : "sourcing";
  const wholesalePage = Math.max(1, Number(params.page) || 1);
  const [sourcingItems, wholesaleResult, storeSettings] = await Promise.all([
    createSourcingResearchService(database).listRegistrations(user.id),
    new RegistrationManagementRepository(database).listWholesaleProducts(
      user.id,
      {
        supplierCode: params.supplier || undefined,
        page: wholesalePage,
      },
    ),
    new NaverStoreSettingsRepository(database).get(user.id),
  ]);
  const wholesaleItems = wholesaleResult.items;
  const connected = isNaverCommerceConfigured() && Boolean(storeSettings);
  const suppliers = wholesaleResult.suppliers;
  const selectedSupplier = suppliers.some(
    (supplier) => supplier.code === params.supplier,
  )
    ? params.supplier
    : "";
  const wholesaleGroups = groupWholesaleItems(wholesaleItems);
  const publishedCount =
    sourcingItems.filter((item) => item.smartstorePublished).length +
    wholesaleResult.summary.published;

  return (
    <>
      <header className="inventory-topbar registration-topbar">
        <div>
          <strong>상품 등록관리</strong>
          <span>
            소싱 상품과 위탁상품의 스마트스토어 등록·변경·판매 상태를 한 곳에서
            관리합니다.
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
              상품의 출처별 준비 상태를 확인하고 등록, 변경, 품절, 판매재개,
              삭제 작업을 빠르게 처리하세요.
            </p>
          </div>
        </section>

        <section className="registration-stats" aria-label="상품 등록 현황">
          <article>
            <span>소싱조사 상품</span>
            <strong>{sourcingItems.length.toLocaleString("ko-KR")}</strong>
          </article>
          <article>
            <span>위탁상품</span>
            <strong>
              {wholesaleResult.summary.total.toLocaleString("ko-KR")}
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

        <nav className="registration-source-tabs" aria-label="상품 출처">
          <Link
            className={activeTab === "sourcing" ? "active" : undefined}
            href="/admin/registration?tab=sourcing"
          >
            소싱조사 상품
            <strong>{sourcingItems.length}</strong>
          </Link>
          <Link
            className={activeTab === "wholesale" ? "active" : undefined}
            href="/admin/registration?tab=wholesale"
          >
            위탁상품
            <strong>{wholesaleResult.summary.total}</strong>
          </Link>
        </nav>

        {activeTab === "sourcing" ? (
          <SourcingRegistrationTable
            items={sourcingItems}
            connected={connected}
          />
        ) : (
          <WholesaleRegistrationTable
            groups={wholesaleGroups}
            suppliers={suppliers}
            selectedSupplier={selectedSupplier}
            total={wholesaleResult.total}
            page={wholesaleResult.page}
            pageSize={wholesaleResult.pageSize}
            connected={connected}
          />
        )}
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

type WholesaleItem = Awaited<
  ReturnType<RegistrationManagementRepository["listWholesaleProducts"]>
>["items"][number];

function WholesaleRegistrationTable({
  groups,
  suppliers,
  selectedSupplier,
  total,
  page,
  pageSize,
  connected,
}: {
  groups: Map<string, WholesaleItem[]>;
  suppliers: Array<{ code: string; name: string }>;
  selectedSupplier: string | undefined;
  total: number;
  page: number;
  pageSize: number;
  connected: boolean;
}) {
  return (
    <section className="registration-panel">
      <div className="registration-panel-head registration-wholesale-head">
        <div>
          <h2>위탁상품 등록관리</h2>
          <p>도매처별 상품 {total.toLocaleString("ko-KR")}개를 표시합니다.</p>
        </div>
        <form action="/admin/registration">
          <input type="hidden" name="tab" value="wholesale" />
          <select
            name="supplier"
            defaultValue={selectedSupplier}
            aria-label="도매처 선택"
          >
            <option value="">모든 도매처</option>
            {suppliers.map((supplier) => (
              <option key={supplier.code} value={supplier.code}>
                {supplier.name}
              </option>
            ))}
          </select>
          <button type="submit">적용</button>
        </form>
      </div>
      <div className="registration-table-wrap">
        <table className="registration-table wholesale-registration-table">
          <thead>
            <tr>
              <th>상품</th>
              <th>도매처 상품번호</th>
              <th>판매가</th>
              <th>공급 상태</th>
              <th>스마트스토어 상태</th>
              <th>스마트스토어 작업</th>
            </tr>
          </thead>
          {[...groups.entries()].map(([supplierCode, items]) => (
            <tbody key={supplierCode}>
              <tr className="registration-supplier-row">
                <th colSpan={6}>
                  {items[0]?.supplierName}
                  <span>{items.length}개 상품</span>
                </th>
              </tr>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.title || item.externalProductId}</strong>
                    <span>
                      {item.status === "ready" ? "등록 준비 완료" : "편집 중"}
                    </span>
                  </td>
                  <td>
                    <code>{item.externalProductId}</code>
                  </td>
                  <td>{formatWon(item.sellingPrice)}</td>
                  <td>{availabilityLabel(item.supplierAvailability)}</td>
                  <td>
                    <RegistrationStatus
                      label={publicationLabel(item)}
                      className={
                        item.publicationStatus === "published"
                          ? "published"
                          : (item.publicationStatus ?? "waiting")
                      }
                      remoteStatusType={item.remoteStatusType}
                      channelProductNo={item.channelProductNo}
                    />
                  </td>
                  <td>
                    <RegistrationNaverActions
                      productId={item.id}
                      title={item.title || item.externalProductId}
                      editHref={`/admin/products?edit=${encodeURIComponent(
                        item.id,
                      )}`}
                      channelProductNo={item.channelProductNo}
                      publicationStatus={item.publicationStatus}
                      remoteStatusType={item.remoteStatusType}
                      connected={connected}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      {!total && (
        <div className="registration-empty">
          <strong>조건에 맞는 위탁상품이 없습니다.</strong>
          <Link href="/admin/products">위탁상품관리 열기</Link>
        </div>
      )}
      {total > pageSize && (
        <RegistrationPagination
          page={page}
          pageSize={pageSize}
          total={total}
          supplier={selectedSupplier}
        />
      )}
    </section>
  );
}

function RegistrationPagination({
  page,
  pageSize,
  total,
  supplier,
}: {
  page: number;
  pageSize: number;
  total: number;
  supplier?: string;
}) {
  const totalPages = Math.ceil(total / pageSize);
  const href = (targetPage: number) => {
    const query = new URLSearchParams({
      tab: "wholesale",
      page: String(targetPage),
    });
    if (supplier) query.set("supplier", supplier);
    return `/admin/registration?${query.toString()}`;
  };
  return (
    <nav className="registration-pagination" aria-label="위탁상품 페이지">
      {page > 1 ? <Link href={href(page - 1)}>← 이전</Link> : <span />}
      <strong>
        {page} / {totalPages}
      </strong>
      {page < totalPages ? <Link href={href(page + 1)}>다음 →</Link> : <span />}
    </nav>
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

function publicationLabel(item: WholesaleItem) {
  if (item.publicationStatus === "deleted") return "스마트스토어 삭제됨";
  if (item.publicationStatus === "failed") return "등록 확인 필요";
  if (item.channelProductNo) return "스마트스토어 등록완료";
  return item.status === "ready" ? "등록 가능" : "상품정보 편집 필요";
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

function availabilityLabel(status: string) {
  return (
    {
      active: "판매 가능",
      sold_out: "공급처 품절",
      discontinued: "공급처 단종",
      unknown: "확인 필요",
    }[status] ?? status
  );
}

function groupWholesaleItems(items: WholesaleItem[]) {
  const groups = new Map<string, WholesaleItem[]>();
  for (const item of items) {
    const group = groups.get(item.supplierCode) ?? [];
    group.push(item);
    groups.set(item.supplierCode, group);
  }
  return groups;
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
