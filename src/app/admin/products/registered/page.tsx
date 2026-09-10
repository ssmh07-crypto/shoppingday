import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import {
  listRegisteredProductManagement,
  registeredNeeds,
  registeredSupplierCodes,
  type RegisteredNeed,
  type RegisteredSupplierCode,
} from "@/modules/products/registered-product-management";
import { RegisteredProductManager } from "./registered-product-manager";
import "./registered-products.css";

export const dynamic = "force-dynamic";
const pageSize = 30;

export default async function RegisteredProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    supplier?: string;
    need?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const supplier = registeredSupplierCodes.includes(
    params.supplier as RegisteredSupplierCode,
  )
    ? (params.supplier as RegisteredSupplierCode)
    : undefined;
  const need = registeredNeeds.includes(params.need as RegisteredNeed)
    ? (params.need as RegisteredNeed)
    : "all";
  const search = params.q?.trim().slice(0, 100) || undefined;
  const page = Math.min(
    10_000,
    Math.max(1, Math.floor(Number(params.page) || 1)),
  );

  return withDbReadRecovery(async (database) => {
    const user = await requireAdminPage(database);
    const result = await listRegisteredProductManagement(database, user.id, {
      supplier,
      need,
      search,
      page,
      pageSize,
    });
    const pages = Math.max(1, Math.ceil(result.total / pageSize));
    return (
      <main className="registered-products-page">
        <header className="registered-products-heading">
          <div>
            <span className="inventory-eyebrow">REGISTERED PRODUCTS</span>
            <h1>등록상품관리</h1>
            <p>
              스마트스토어에 등록된 위탁상품을 도매처별로 확인하고,
              품절·가격·상세 변경이 필요한 상품만 골라 반영합니다.
            </p>
          </div>
          <Link href="/admin/products/import">공급처 변경 확인</Link>
        </header>

        <form className="registered-filter" method="get">
          <label className="registered-search">
            <span>상품 검색</span>
            <input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="상품명·도매처 상품번호·원상품번호"
            />
          </label>
          <label>
            <span>도매처</span>
            <select name="supplier" defaultValue={supplier ?? "all"}>
              <option value="all">전체 도매처</option>
              <option value="dome">친구도매</option>
              <option value="zicgam">직감</option>
              <option value="ebulsamchon">이불삼촌</option>
            </select>
          </label>
          <label>
            <span>필요 작업</span>
            <select name="need" defaultValue={need}>
              <option value="all">전체 등록 상품</option>
              <option value="stock">품절·단종 필요</option>
              <option value="price">가격 변경 필요</option>
              <option value="description">상세 변경 필요</option>
            </select>
          </label>
          <button type="submit">조회</button>
        </form>

        <section className="registered-summary" aria-label="조회 결과 요약">
          <div>
            <strong>{result.total.toLocaleString("ko-KR")}</strong>
            <span>조회 상품</span>
          </div>
          <p>
            변경 반영 전 공급처 최신값과 스마트스토어 현재값을 다시 확인합니다.
            실패한 작업은 원인을 남기고 다음 실행에서 다시 선택할 수 있습니다.
          </p>
        </section>

        {!result.rows.length ? (
          <section className="registered-empty">
            <strong>조건에 맞는 등록 상품이 없습니다.</strong>
            <p>공급처 변경 확인을 먼저 실행했거나 다른 필터를 선택해 보세요.</p>
          </section>
        ) : (
          <RegisteredProductManager
            rows={result.rows}
            supplier={supplier}
            need={need}
          />
        )}

        {pages > 1 && (
          <nav className="registered-pagination" aria-label="등록 상품 페이지">
            {page > 1 && (
              <Link href={pageHref(supplier, need, search, page - 1)}>
                이전
              </Link>
            )}
            <span>
              {page} / {pages}페이지
            </span>
            {page < pages && (
              <Link href={pageHref(supplier, need, search, page + 1)}>
                다음
              </Link>
            )}
          </nav>
        )}
      </main>
    );
  });
}

function pageHref(
  supplier: RegisteredSupplierCode | undefined,
  need: RegisteredNeed,
  search: string | undefined,
  page: number,
) {
  const params = new URLSearchParams({ need, page: String(page) });
  if (supplier) params.set("supplier", supplier);
  if (search) params.set("q", search);
  return `?${params.toString()}`;
}
