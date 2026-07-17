import Link from "next/link";
import type { ReactNode } from "react";
/* eslint-disable @next/next/no-img-element -- supplier URLs are intentionally loaded directly; no image storage/optimizer proxy */
import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery, type Database } from "@/lib/db";
import { createProductEditService } from "@/modules/products/product-edit-factory";
import { ProductEditorDrawer } from "./[id]/edit/product-editor-drawer";
import { ProductSyncControl } from "./product-sync-control";
import { ProductTitleInlineEditor } from "./product-title-inline-editor";

type SearchParams = Record<string, string | undefined>;

// Authentication and Hyperdrive bindings are request-only. Explicitly opt out
// of Next.js build-time execution even when no search parameters are present.
export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return withDbReadRecovery((database) =>
    renderProductsPage(searchParams, database),
  );
}

async function renderProductsPage(
  searchParams: Promise<SearchParams>,
  database: Database,
) {
  const user = await requireAdminPage(database);
  const params = await searchParams;
  const service = createProductEditService(database);
  const result = await service.list(user.id, {
    search: params.search,
    filter: params.filter,
    sort: params.sort,
    page: Number(params.page) || 1,
    pageSize: Number(params.size) || 30,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const firstItem = result.total ? (result.page - 1) * result.pageSize + 1 : 0;
  const lastItem = Math.min(result.page * result.pageSize, result.total);
  return (
    <div className="inventory-app">
      <aside className="inventory-sidebar">
        <div className="inventory-brand">
          <div className="inventory-brand-mark">S</div>
          <div>
            <strong>쇼핑데이</strong>
            <span>판매자 상품 관리</span>
          </div>
        </div>
        <nav className="inventory-nav" aria-label="관리자 메뉴">
          <Link className="active" href="/admin/products">
            <Icon name="box" />
            <span>상품 관리</span>
          </Link>
          <Link href="/admin/products/import">
            <Icon name="download" />
            <span>상품 가져오기</span>
          </Link>
          <Link href="/admin/channels/naver">
            <Icon name="store" />
            <span>판매 채널</span>
          </Link>
          <Link href="/admin/settings/products">
            <Icon name="settings" />
            <span>설정</span>
          </Link>
        </nav>
        <div className="inventory-sidebar-note">
          <Icon name="database" />
          <div>
            <strong>친구도매 연동</strong>
            <span>최근 동기화된 상품을 관리합니다.</span>
          </div>
        </div>
      </aside>

      <div className="inventory-content">
        <header className="inventory-topbar">
          <form className="inventory-search" action="/admin/products">
            <Icon name="search" />
            <input
              name="search"
              defaultValue={params.search}
              placeholder="상품명 또는 상품번호 검색"
              aria-label="상품 검색"
            />
            {params.filter && (
              <input type="hidden" name="filter" value={params.filter} />
            )}
            {params.sort && (
              <input type="hidden" name="sort" value={params.sort} />
            )}
            {params.size && (
              <input type="hidden" name="size" value={params.size} />
            )}
          </form>
          <div className="inventory-admin-label">
            <span className="inventory-status-dot" />
            관리자 화면
          </div>
        </header>

        <main className="inventory-main">
          <section className="inventory-heading">
            <div>
              <span className="inventory-eyebrow">상품 운영</span>
              <h1>상품 관리</h1>
              <p>친구도매에서 가져온 상품을 확인하고 판매 정보를 편집하세요.</p>
            </div>
            <ProductSyncControl mode="changes" />
          </section>

          <section className="inventory-stats" aria-label="상품 현황">
            <StatCard
              label="전체 상품"
              value={result.stats.total}
              note="저장된 전체 상품"
            />
            <StatCard
              label="판매 가능"
              value={result.stats.available}
              note="품절·단종이 아닌 상품"
              tone="blue"
            />
            <StatCard
              label="품절"
              value={result.stats.soldOut}
              note="품절·단종 상태 상품"
              tone="red"
            />
            <StatCard
              label="미등록 상품"
              value={result.stats.unregistered}
              note="마켓에 등록되지 않은 상품"
              tone="amber"
            />
          </section>

          <section className="inventory-panel">
            <div className="inventory-panel-head">
              <div>
                <h2>상품 목록</h2>
                <p>
                  현재 조건에 맞는 상품 {result.total.toLocaleString("ko-KR")}개
                </p>
              </div>
              <form className="inventory-filters" action="/admin/products">
                {params.search && (
                  <input type="hidden" name="search" value={params.search} />
                )}
                <label>
                  <span className="sr-only">상태 필터</span>
                  <select name="filter" defaultValue={params.filter ?? ""}>
                    <option value="">모든 상태</option>
                    <option value="draft">초안</option>
                    <option value="editing">편집 중</option>
                    <option value="ready">등록 준비 완료</option>
                    <option value="sold_out">품절 원본</option>
                    <option value="missing_price">판매가 미입력</option>
                    <option value="missing_category">카테고리 미지정</option>
                    <option value="missing_image">이미지 없음</option>
                    <option value="option_review">옵션 검토 필요</option>
                  </select>
                </label>
                <label>
                  <span className="sr-only">목록 표시 개수</span>
                  <select name="size" defaultValue={String(result.pageSize)}>
                    <option value="30">30개씩 보기</option>
                    <option value="50">50개씩 보기</option>
                    <option value="100">100개씩 보기</option>
                  </select>
                </label>
                <label>
                  <span className="sr-only">정렬 기준</span>
                  <select name="sort" defaultValue={params.sort ?? ""}>
                    <option value="">최근 가져온 순</option>
                    <option value="updated">최근 수정 순</option>
                    <option value="cost">공급가 낮은 순</option>
                    <option value="price">판매가 낮은 순</option>
                    <option value="title">상품명 순</option>
                  </select>
                </label>
                <button type="submit" className="inventory-filter-button">
                  <Icon name="filter" />
                  적용
                </button>
                {(params.search || params.filter || params.sort) && (
                  <Link className="inventory-reset-link" href="/admin/products">
                    초기화
                  </Link>
                )}
              </form>
            </div>

            <div className="inventory-table-scroll">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th className="image-column">상품</th>
                    <th>상품명</th>
                    <th>상품번호</th>
                    <th>공급처</th>
                    <th>공급가</th>
                    <th>판매가</th>
                    <th>공급 상태</th>
                    <th>편집 상태</th>
                    <th>마지막 수정</th>
                    <th>
                      <span className="sr-only">관리</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => {
                    const image =
                      item.selectedImages.find(
                        (entry) => entry.enabled && entry.isPrimary,
                      ) ?? item.selectedImages.find((entry) => entry.enabled);
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="inventory-product-image">
                            {image ? (
                              <img
                                src={image.storedUrl ?? image.sourceUrl}
                                alt=""
                              />
                            ) : (
                              <Icon name="image" />
                            )}
                          </div>
                        </td>
                        <td className="inventory-product-name">
                          <ProductTitleInlineEditor
                            id={item.id}
                            initialTitle={item.title}
                            initialDraftVersion={item.draftVersion}
                          />
                          <span>{item.originalName || "원본 상품명 없음"}</span>
                        </td>
                        <td className="inventory-product-number">
                          <code>{item.externalProductId}</code>
                        </td>
                        <td>
                          <span className="inventory-supplier">
                            {item.supplierName}
                          </span>
                        </td>
                        <td className="inventory-price">
                          {formatWon(item.supplierPrice)}
                        </td>
                        <td
                          className={`inventory-price ${item.sellingPrice == null ? "empty" : ""}`}
                        >
                          {formatWon(item.sellingPrice)}
                        </td>
                        <td>
                          <AvailabilityBadge value={item.availability} />
                        </td>
                        <td>
                          <StatusBadge value={item.status} />
                        </td>
                        <td className="inventory-date">
                          {formatDate(item.updatedAt)}
                          <span>{formatTime(item.updatedAt)}</span>
                        </td>
                        <td className="inventory-actions">
                          <Link
                            href={editorHref(params, item.id)}
                            scroll={false}
                            prefetch={false}
                            data-product-editor-id={item.id}
                          >
                            편집
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!result.items.length && (
              <div className="inventory-empty">
                <Icon name="search" />
                <strong>조건에 맞는 상품이 없습니다.</strong>
                <span>검색어나 필터를 변경해 보세요.</span>
              </div>
            )}

            <div className="inventory-pagination">
              <p>
                전체 {result.total.toLocaleString("ko-KR")}개 중{" "}
                {firstItem.toLocaleString("ko-KR")}–
                {lastItem.toLocaleString("ko-KR")}개 표시
              </p>
              <nav aria-label="페이지 이동">
                <Link
                  className={result.page <= 1 ? "disabled" : ""}
                  href={query(params, Math.max(1, result.page - 1))}
                  aria-disabled={result.page <= 1}
                >
                  <Icon name="left" />
                  <span className="sr-only">이전</span>
                </Link>
                {pageNumbers(result.page, totalPages).map((page) => (
                  <Link
                    className={page === result.page ? "current" : ""}
                    href={query(params, page)}
                    key={page}
                  >
                    {page}
                  </Link>
                ))}
                <Link
                  className={result.page >= totalPages ? "disabled" : ""}
                  href={query(params, Math.min(totalPages, result.page + 1))}
                  aria-disabled={result.page >= totalPages}
                >
                  <Icon name="right" />
                  <span className="sr-only">다음</span>
                </Link>
              </nav>
            </div>
          </section>
        </main>
      </div>
      <ProductEditorDrawer initialProductId={params.edit} />
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  tone = "",
}: {
  label: string;
  value: number;
  note: string;
  tone?: string;
}) {
  return (
    <article className={`inventory-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString("ko-KR")}</strong>
      <small>{note}</small>
    </article>
  );
}

function AvailabilityBadge({ value }: { value: string }) {
  const label =
    value === "active"
      ? "판매 가능"
      : value === "sold_out"
        ? "품절"
        : "확인 필요";
  return (
    <span className={`inventory-badge availability-${value}`}>{label}</span>
  );
}

function StatusBadge({ value }: { value: string }) {
  const labels: Record<string, string> = {
    draft: "초안",
    editing: "편집 중",
    ready: "준비 완료",
    archived: "보관",
  };
  return (
    <span className={`inventory-badge status-${value}`}>
      {labels[value] ?? value}
    </span>
  );
}

function formatWon(value: string | number | null) {
  if (value == null || value === "") return "미입력";
  const number = Number(value);
  if (!Number.isFinite(number)) return "미입력";
  return `${Math.round(number).toLocaleString("ko-KR")}원`;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(value);
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(value);
}

function pageNumbers(current: number, total: number) {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  return Array.from(
    { length: Math.min(5, total) },
    (_, index) => start + index,
  );
}

function query(params: SearchParams, page: number) {
  const queryString = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value && key !== "page" && key !== "edit") queryString.set(key, value);
  queryString.set("page", String(page));
  return `/admin/products?${queryString}`;
}

function editorHref(params: SearchParams, id: string) {
  const queryString = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value && key !== "edit") queryString.set(key, value);
  queryString.set("edit", id);
  return `/admin/products?${queryString}`;
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    box: (
      <>
        <path d="m21 8-9-5-9 5 9 5 9-5Z" />
        <path d="m3 8 9 5 9-5" />
        <path d="M12 13v9" />
        <path d="m21 8v9l-9 5-9-5V8" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    store: (
      <>
        <path d="M4 10v10h16V10" />
        <path d="M3 4h18l-2 6H5L3 4Z" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7h-5V2" />
        <path d="M20 2a9 9 0 1 0 2 10" />
      </>
    ),
    filter: (
      <>
        <path d="M4 6h16M7 12h10M10 18h4" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="2" />
        <path d="m21 15-5-5L5 20" />
      </>
    ),
    left: <path d="m15 18-6-6 6-6" />,
    right: <path d="m9 18 6-6-6-6" />,
  };
  return (
    <svg
      className="inventory-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
