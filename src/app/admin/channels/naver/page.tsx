import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery, type Database } from "@/lib/db";
import { NaverCategoryRepository } from "@/modules/channels/naver/naver-category-repository";
import { isNaverCommerceConfigured } from "@/modules/channels/naver/naver-category-service";
import { NaverCategorySyncButton } from "./naver-category-sync-button";

export const dynamic = "force-dynamic";

type SearchParams = { search?: string };

export default async function NaverChannelPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return withDbReadRecovery((database) => renderPage(database, searchParams));
}

async function renderPage(
  database: Database,
  searchParams: Promise<SearchParams>,
) {
  await requireAdminPage(database);
  const params = await searchParams;
  const repository = new NaverCategoryRepository(database);
  const [summary, categories] = await Promise.all([
    repository.summary(),
    repository.list({ search: params.search, leafOnly: true, limit: 100 }),
  ]);
  const configured = isNaverCommerceConfigured();

  return (
    <main className="naver-channel-page">
      <div className="naver-channel-shell">
        <Link className="naver-channel-back" href="/admin/products">
          ← 상품 관리
        </Link>
        <header className="naver-channel-heading">
          <div>
            <span>판매 채널</span>
            <h1>네이버 스마트스토어</h1>
            <p>
              커머스API 카테고리를 저장해 상품의 최적 카테고리 추천과 등록에
              사용합니다.
            </p>
          </div>
          <NaverCategorySyncButton configured={configured} />
        </header>

        {!configured && (
          <section className="naver-channel-alert">
            서버에 <code>NAVER_COMMERCE_CLIENT_ID</code>와{" "}
            <code>NAVER_COMMERCE_CLIENT_SECRET</code>을 설정하면 동기화할 수
            있습니다.
          </section>
        )}

        <section className="naver-channel-stats">
          <article>
            <span>전체 카테고리</span>
            <strong>{summary.total.toLocaleString("ko-KR")}</strong>
          </article>
          <article>
            <span>상품 등록 가능</span>
            <strong>{summary.leaf.toLocaleString("ko-KR")}</strong>
          </article>
          <article>
            <span>마지막 동기화</span>
            <strong>{formatDate(summary.lastSyncedAt)}</strong>
          </article>
        </section>

        <section className="naver-category-panel">
          <div className="naver-category-head">
            <div>
              <h2>최종 카테고리 검색</h2>
              <p>
                상품 등록에 사용할 수 있는 최하위 카테고리를 최대 100개
                표시합니다.
              </p>
            </div>
            <form action="/admin/channels/naver">
              <input
                name="search"
                defaultValue={params.search}
                placeholder="예: 여성 의류, 텀블러"
                aria-label="카테고리 검색"
              />
              <button type="submit">검색</button>
              {params.search && (
                <Link href="/admin/channels/naver">초기화</Link>
              )}
            </form>
          </div>
          <div className="naver-category-table-wrap">
            <table className="naver-category-table">
              <thead>
                <tr>
                  <th>카테고리 ID</th>
                  <th>전체 경로</th>
                  <th>카테고리명</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td>
                      <code>{category.id}</code>
                    </td>
                    <td>{category.wholeCategoryName}</td>
                    <td>{category.name}</td>
                  </tr>
                ))}
                {!categories.length && (
                  <tr>
                    <td colSpan={3}>검색 결과가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function formatDate(value: Date | null) {
  if (!value) return "아직 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(value);
}
