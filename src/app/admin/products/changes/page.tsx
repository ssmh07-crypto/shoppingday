import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { productAuditLogs, products, supplierPriceApplications, supplierChangeApplications } from "@/lib/db/schema";
import "../import/product-import.css";
import { PriceApplicationControl } from "./price-application-control";
import { SupplierStatusControl } from "./supplier-status-control";
import { ChangeApplicationControl } from "./change-application-control";

export const dynamic = "force-dynamic";
const labels: Record<string, string> = {
  supplierPrice: "공급가",
  sellingPrice: "판매가",
  availability: "공급 상태",
  rawDescription: "상세페이지",
};
function display(key: string, value: unknown) {
  if (key === "rawDescription") return value ? "상세 내용 있음" : "없음";
  if (value === null || value === undefined) return "확인 불가";
  if (key.endsWith("Price"))
    return `${Number(value).toLocaleString("ko-KR")}원`;
  return (
    (
      {
      active: "판매 가능",
      sold_out: "품절",
        discontinued: "단종",
        unknown: "확인 불가",
      } as Record<string, string>
    )[String(value)] ?? String(value)
  );
}
export default async function SupplierChangesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const input = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Math.floor(Number(input.page) || 1)),
  );
  return withDbReadRecovery(async (database) => {
    const user = await requireAdminPage(database);
    const changes = await database.select({ id: supplierChangeApplications.id, title: products.title, kind: supplierChangeApplications.kind, status: supplierChangeApplications.status, error: supplierChangeApplications.errorMessage }).from(supplierChangeApplications).innerJoin(products, eq(products.id, supplierChangeApplications.productId)).where(eq(products.ownerId, user.id)).orderBy(desc(supplierChangeApplications.createdAt)).limit(30);
    const applications = await database.select({ id: supplierPriceApplications.id, title: products.title, price: supplierPriceApplications.targetPrice, status: supplierPriceApplications.status, error: supplierPriceApplications.errorMessage }).from(supplierPriceApplications).innerJoin(products, eq(products.id, supplierPriceApplications.productId)).where(eq(products.ownerId, user.id)).orderBy(desc(supplierPriceApplications.createdAt)).limit(30);
    const rows = await database
      .select({
        id: productAuditLogs.id,
        productId: products.id,
        title: products.title,
        createdAt: productAuditLogs.createdAt,
        changedFields: productAuditLogs.changedFields,
        oldValues: productAuditLogs.oldValues,
        newValues: productAuditLogs.newValues,
        registered: sql<boolean>`exists (select 1 from product_publications p where p.product_id = ${products.id} and p.origin_product_no is not null and p.remote_status_type is distinct from 'DELETE')`,
      })
      .from(productAuditLogs)
      .innerJoin(products, eq(products.id, productAuditLogs.entityId))
      .where(
        and(
          eq(products.ownerId, user.id),
          eq(productAuditLogs.action, "supplier_sync"),
        ),
      )
      .orderBy(desc(productAuditLogs.createdAt), desc(productAuditLogs.id))
      .limit(31)
      .offset((page - 1) * 30);
    return (
      <main className="supplier-import-page">
        <header className="supplier-import-heading">
          <span className="inventory-eyebrow">SUPPLIER CHANGES</span>
          <h1>공급처 변경 이력</h1>
          <p>
            공급처 수집 결과와 판매가 재계산을 확인합니다. 이력 기록은
            스마트스토어 반영 완료를 뜻하지 않습니다.
          </p>
          <Link href="/admin/products/import">도매처 확인으로 돌아가기</Link>
        </header>
        <section className="supplier-import-summary">
          <strong>가격 반영 기준</strong>
          <p>
            기존 판매가 ÷ 기존 공급가 × 새 공급가를 10원 단위 올림합니다.
            수수료·배송비를 제외한 비율이며, 공급가를 읽지 못하거나 0원인
            경우에는 판매가를 바꾸지 않습니다. 가공한 상세페이지는 자동으로
            덮어쓰지 않습니다.
          </p>
        </section>
        {!rows.length && <p>기록된 공급처 변경이 없습니다.</p>}
      <PriceApplicationControl />
      <ChangeApplicationControl />
      {!!changes.length && <section className="supplier-import-card"><h2>최근 공급 상태·상세 반영</h2><ul>{changes.map(change => <li key={change.id}>{change.title} · {({ sold_out: "품절", discontinued: "판매 중지", description: "상세페이지" })[change.kind]} · {({ pending: "반영 대기", succeeded: "반영 확인 완료", failed: "반영 실패", superseded: "최신값 변경으로 제외" })[change.status]}{change.error && <p>{change.error}</p>}</li>)}</ul></section>}
      {!!applications.length && <section className="supplier-import-card"><h2>최근 판매가 반영 상태</h2><ul>{applications.map((application) => <li key={application.id}>{application.title} · {application.price.toLocaleString("ko-KR")}원 · {({ pending: "반영 대기", running: "진행 중", succeeded: "실제 가격 확인 완료", failed: "반영 실패", superseded: "새 편집값으로 대체됨" })[application.status]}{application.error && <p>{application.error}</p>}</li>)}</ul></section>}
        {rows.slice(0, 30).map((row) => (
          <article className="supplier-import-card" key={row.id}>
            <header>
              <h2>{row.title}</h2>
              <p>
                {row.createdAt.toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}{" "}
                ·{" "}
                {row.registered
                  ? "등록 상품 · 반영 상태 별도 확인"
                  : "미등록 상품"}
              </p>
            </header>
            <dl>
              {row.changedFields.map((key) => (
                <div key={key}>
                  <dt>{labels[key] ?? key}</dt>
                <dd>
                  {display(key, row.oldValues[key])} →{" "}
                  {display(key, row.newValues[key])}
                  {key === "rawDescription" && <details><summary>상세페이지 변경 전후 보기</summary><p>변경 전</p><pre style={{ whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}>{String(row.oldValues[key] ?? "")}</pre><p>변경 후</p><pre style={{ whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}>{String(row.newValues[key] ?? "")}</pre></details>}
                  </dd>
                </div>
              ))}
            </dl>
            <Link href={`/admin/products/${row.productId}/edit`}>
              상품 검토·스마트스토어 반영
            </Link>
            {row.registered && row.changedFields.includes("availability") && <SupplierStatusControl productId={row.productId} title={row.title} availability={String(row.newValues.availability)} />}
          </article>
        ))}
        <nav aria-label="변경 이력 페이지">
          {page > 1 && <Link href={`?page=${page - 1}`}>이전</Link>}{" "}
          <span>{page}페이지</span>{" "}
          {rows.length > 30 && <Link href={`?page=${page + 1}`}>다음</Link>}
        </nav>
      </main>
    );
  });
}
