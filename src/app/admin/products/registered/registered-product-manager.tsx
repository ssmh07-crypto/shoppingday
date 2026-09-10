"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type {
  RegisteredNeed,
  RegisteredProductManagementRow,
  RegisteredSupplierCode,
} from "@/modules/products/registered-product-management";

type ApplyKind = "price" | "sold_out" | "discontinued" | "description";

const supplierLabels: Record<RegisteredSupplierCode, string> = {
  dome: "친구도매",
  zicgam: "직감",
  ebulsamchon: "이불삼촌",
};
const needLabels: Record<RegisteredNeed, string> = {
  all: "전체 등록 상품",
  stock: "품절·단종 필요",
  price: "가격 변경 필요",
  description: "상세 변경 필요",
};

export function RegisteredProductManager({
  rows,
  supplier,
  need,
}: {
  rows: RegisteredProductManagementRow[];
  supplier?: RegisteredSupplierCode;
  need: RegisteredNeed;
}) {
  const router = useRouter();
  const active = useRef(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const selectable = useMemo(
    () =>
      rows.filter((row) => kindsForRow(row).length).map((row) => row.productId),
    [rows],
  );
  const selectedOnPage = selected.filter((id) => selectable.includes(id));

  async function apply(
    label: string,
    kinds: ApplyKind[],
    productIds?: string[],
  ) {
    if (
      active.current ||
      !kinds.length ||
      !window.confirm(
        `${label}의 ${kinds.map(kindLabel).join(", ")} 변경을 스마트스토어에 반영할까요? 실제 원격 상태를 다시 확인한 뒤 순차 처리합니다.`,
      )
    )
      return;
    active.current = true;
    setRunning(true);
    setMessage("반영을 시작합니다.");
    let completed = 0;
    try {
      if (kinds.includes("price")) {
        completed += await drain(
          "/api/products/supplier-price-applications",
          { confirmed: true, supplierCode: supplier, productIds },
          () => active.current,
          (count) => setMessage(`가격 ${count}건 반영 완료`),
        );
      }
      const changeKinds = kinds.filter(
        (kind): kind is Exclude<ApplyKind, "price"> => kind !== "price",
      );
      if (active.current && changeKinds.length) {
        completed += await drain(
          "/api/products/supplier-change-applications",
          {
            confirmed: true,
            supplierCode: supplier,
            kinds: changeKinds,
            productIds,
          },
          () => active.current,
          (count) => setMessage(`상태·상세 ${count}건 반영 완료`),
        );
      }
      setMessage(
        `${completed}건 처리 완료${active.current ? " · 남은 대상 없음" : " · 현재 상품 처리 후 중단"}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "변경 반영 실패");
    } finally {
      active.current = false;
      setRunning(false);
      setSelected([]);
      router.refresh();
    }
  }

  const allKinds = kindsForNeed(need);
  return (
    <>
      <section className="registered-bulk-bar" aria-label="등록 상품 일괄 작업">
        <div>
          <strong>{selectedOnPage.length}개 선택</strong>
          <span>현재 조회 조건: {needLabels[need]}</span>
        </div>
        <div className="registered-actions">
          <button
            type="button"
            disabled={running || !selectedOnPage.length}
            onClick={() =>
              void apply(
                `선택 상품 ${selectedOnPage.length}개`,
                allKinds,
                selectedOnPage,
              )
            }
          >
            선택 상품 반영
          </button>
          <button
            type="button"
            className="secondary"
            disabled={running}
            onClick={() =>
              void apply(
                `${supplier ? supplierLabels[supplier] : "전체 도매처"}의 ${needLabels[need]}`,
                allKinds,
              )
            }
          >
            조회 조건 전체 반영
          </button>
          {running && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                active.current = false;
              }}
            >
              현재 상품 처리 후 중단
            </button>
          )}
        </div>
        <p role="status">{message}</p>
      </section>

      <div className="registered-list">
        {rows.map((row) => {
          const kinds = kindsForRow(row);
          const checked = selected.includes(row.productId);
          return (
            <article
              className="registered-product-card"
              key={row.publicationId}
            >
              <label className="registered-product-select">
                <input
                  type="checkbox"
                  disabled={!kinds.length || running}
                  checked={checked}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...new Set([...current, row.productId])]
                        : current.filter((id) => id !== row.productId),
                    )
                  }
                />
                <span className="sr-only">{row.title} 선택</span>
              </label>
              <div className="registered-product-main">
                <div className="registered-product-title">
                  <span className={`registered-supplier ${row.supplierCode}`}>
                    {row.supplierName}
                  </span>
                  <h2>{row.title}</h2>
                  <span
                    className={`registered-remote ${remoteTone(row.remoteStatusType)}`}
                  >
                    스마트스토어 {remoteLabel(row.remoteStatusType)}
                  </span>
                </div>
                <p className="registered-product-source">
                  도매처 상품번호 {row.externalProductId} · 스마트스토어
                  원상품번호 {row.originProductNo}
                </p>
                <div className="registered-product-metrics">
                  <span>공급가 {money(row.supplierPrice)}</span>
                  <span>판매가 {money(row.sellingPrice)}</span>
                  <span>공급 상태 {availabilityLabel(row.availability)}</span>
                  <span>
                    마지막 확인{" "}
                    {row.lastSyncedAt.toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}
                  </span>
                </div>
                <div className="registered-needs">
                  {!kinds.length && (
                    <span className="clear">변경 필요 없음</span>
                  )}
                  {row.needsSoldOut && (
                    <span className="danger">품절 필요</span>
                  )}
                  {row.needsDiscontinued && (
                    <span className="danger">판매 중지 필요</span>
                  )}
                  {row.needsPrice && (
                    <span className="warning">
                      가격 {money(row.sellingPrice)} → {money(row.targetPrice)}
                    </span>
                  )}
                  {row.needsDescription && (
                    <span className="info">상세 변경 필요</span>
                  )}
                </div>
              </div>
              <div className="registered-row-actions">
                {kinds.map((kind) => (
                  <button
                    type="button"
                    className="secondary"
                    disabled={running}
                    key={kind}
                    onClick={() =>
                      void apply(row.title, [kind], [row.productId])
                    }
                  >
                    {kindLabel(kind)} 반영
                  </button>
                ))}
                <Link href={`/admin/products/${row.productId}/edit`}>
                  상품 상세 검토
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

async function drain(
  endpoint: string,
  body: Record<string, unknown>,
  keepRunning: () => boolean,
  progress: (count: number) => void,
) {
  let completed = 0;
  while (keepRunning()) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(payload?.error?.message ?? "변경 반영 요청 실패");
    const result = payload?.result;
    if (["idle", "busy"].includes(result?.status)) break;
    if (result?.status === "failed")
      throw new Error(result.message ?? "변경 반영 실패");
    if (result?.status === "succeeded") completed += 1;
    progress(completed);
  }
  return completed;
}

function kindsForNeed(need: RegisteredNeed): ApplyKind[] {
  if (need === "stock") return ["sold_out", "discontinued"];
  if (need === "price") return ["price"];
  if (need === "description") return ["description"];
  return ["price", "sold_out", "discontinued", "description"];
}

function kindsForRow(row: RegisteredProductManagementRow): ApplyKind[] {
  return [
    ...(row.needsPrice ? (["price"] as const) : []),
    ...(row.needsSoldOut ? (["sold_out"] as const) : []),
    ...(row.needsDiscontinued ? (["discontinued"] as const) : []),
    ...(row.needsDescription ? (["description"] as const) : []),
  ];
}

function kindLabel(kind: ApplyKind) {
  return {
    price: "가격",
    sold_out: "품절",
    discontinued: "판매 중지",
    description: "상세페이지",
  }[kind];
}

function money(value: string | number | null) {
  if (value === null || value === "") return "확인 불가";
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

function availabilityLabel(value: string) {
  return (
    {
      active: "판매 가능",
      sold_out: "품절",
      discontinued: "단종",
      unknown: "확인 불가",
    }[value] ?? value
  );
}

function remoteLabel(value: string | null) {
  return (
    { SALE: "판매 중", OUTOFSTOCK: "품절", SUSPENSION: "판매 중지" }[
      value ?? ""
    ] ?? "상태 미확인"
  );
}

function remoteTone(value: string | null) {
  return value === "SALE" ? "sale" : value ? "stopped" : "unknown";
}
