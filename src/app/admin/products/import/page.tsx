import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { ImportForm } from "./import-form";
import { ProductSyncControl } from "../product-sync-control";
import { ZicgamFullImport } from "./zicgam-full-import";
import Link from "next/link";
import "./product-import.css";

// Authentication and the database binding only exist at request time. Never
// execute this administrator page during Next.js static prerendering.
export const dynamic = "force-dynamic";

export default async function ImportProductPage() {
  return withDbReadRecovery(async (database) => {
    await requireAdminPage(database);
    return (
      <main className="supplier-import-page">
        <header className="supplier-import-heading">
          <div>
            <span className="inventory-eyebrow">SUPPLIER IMPORTS</span>
            <h1>위탁상품 가져오기</h1>
            <p>
              도매처별로 신규·변경 상품을 확인하고, 가져온 상품 중 등록할 상품만
              선별합니다.
            </p>
          </div>
          <Link
            className="supplier-import-add-button"
            href="/admin/wholesale-sites"
          >
            <PlusIcon />새 도매처 준비
          </Link>
        </header>

        <section
          className="supplier-import-summary"
          aria-label="가져오기 운영 안내"
        >
          <div>
            <strong>반복 수집</strong>
            <span>운영 기준</span>
          </div>
          <p>
            평소에는 각 도매처의 <strong>신규·변경 상품 확인</strong>만
            실행하세요. 전체 가져오기는 최초 연결이나 데이터 복구가 필요할 때
            사용합니다.
          </p>
        </section>

        <div className="supplier-import-section-title">
          <div>
            <h2>연결된 도매처</h2>
            <p>도매처마다 수집 방식과 최근 작업 상태를 따로 관리합니다.</p>
          </div>
        </div>

        <section className="supplier-import-grid" aria-label="연결된 도매처">
          <ZicgamFullImport />
          <article className="supplier-import-card">
            <header className="supplier-import-card-head">
              <div className="supplier-import-logo dome" aria-hidden="true">
                친
              </div>
              <div>
                <div className="supplier-import-title-row">
                  <h2>친구도매</h2>
                  <span className="supplier-import-badge api">API 연동</span>
                </div>
                <p>
                  마지막 확인 이후 추가되거나 바뀐 상품만 빠르게 가져옵니다.
                </p>
              </div>
            </header>
            <div className="supplier-import-primary-action">
              <ProductSyncControl
                mode="changes"
                variant="card"
                actionLabel="신규·변경 상품 확인"
              />
            </div>
            <p className="supplier-import-connection ready">
              API 연결됨 · 기존 판매 편집값 보호
            </p>
            <details className="supplier-import-more">
              <summary>초기 연결·복구 도구</summary>
              <div className="supplier-import-tools">
                <section>
                  <h3>전체 상품 다시 가져오기</h3>
                  <p>
                    최초 연결 또는 누락 복구 때 전체 상품을 다시 확인합니다.
                  </p>
                  <ProductSyncControl mode="all" variant="card" />
                </section>
                <section>
                  <h3>상품번호로 한 개 가져오기</h3>
                  <p>특정 상품을 바로 확인해야 할 때만 사용합니다.</p>
                  <ImportForm variant="embedded" />
                </section>
              </div>
            </details>
            <footer className="supplier-import-card-foot">
              신규 상품은 추가하고 기존 상품은 공급처 원본만 갱신합니다.
              사용자가 편집한 판매 정보는 유지됩니다.
            </footer>
          </article>
        </section>

        <section className="supplier-import-next-source">
          <div className="supplier-import-next-icon" aria-hidden="true">
            <PlusIcon />
          </div>
          <div>
            <h2>다음 도매처도 같은 방식으로 추가할 수 있습니다</h2>
            <p>
              먼저 도매사이트 주소와 이용 메모를 저장해 두세요. API·엑셀·Chrome
              수집 중 가능한 방식을 확인한 뒤 이 화면에 독립된 도매처 카드로
              연결합니다.
            </p>
          </div>
          <Link href="/admin/wholesale-sites">도매처 후보 정리하기</Link>
        </section>
      </main>
    );
  });
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
