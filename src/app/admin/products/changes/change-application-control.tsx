"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupplierChangeKind } from "@/modules/suppliers/core/change-application-policy";

const choices: { kind: SupplierChangeKind; label: string }[] = [
  { kind: "sold_out", label: "품절" },
  { kind: "discontinued", label: "단종 → 판매 중지" },
  { kind: "description", label: "편집하지 않은 상세페이지" },
];
export function ChangeApplicationControl() {
  const router = useRouter();
  const active = useRef(false);
  const [running, setRunning] = useState(false);
  const [kinds, setKinds] = useState<SupplierChangeKind[]>([]);
  const [supplierCode, setSupplierCode] = useState("dome");
  const [message, setMessage] = useState("");
  useEffect(
    () => () => {
      active.current = false;
    },
    [],
  );
  async function run() {
    if (
      active.current ||
      !kinds.length ||
      !confirm(
        `선택한 도매처의 ${choices
          .filter((choice) => kinds.includes(choice.kind))
          .map((choice) => choice.label)
          .join(
            ", ",
          )} 변경을 연결된 스마트스토어에 반영할까요? 대기·실패 작업을 순차 처리합니다.`,
      )
    )
      return;
    active.current = true;
    setRunning(true);
    let completed = 0;
    try {
      while (active.current) {
        const response = await fetch(
          "/api/products/supplier-change-applications",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ confirmed: true, kinds, supplierCode }),
          },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error?.message ?? "변경 반영 요청 실패");
        if (body.result.status === "failed")
          throw new Error(body.result.message);
        if (["idle", "busy"].includes(body.result.status)) {
          setMessage(
            `${completed}건 반영 완료 · ${body.result.status === "idle" ? "남은 작업 없음" : "다른 작업 처리 중, 잠시 후 재시도하세요"}`,
          );
          break;
        }
        if (body.result.status === "succeeded") completed++;
        setMessage(
          `${completed}건 반영 완료 · 최신값이 달라진 작업은 건너뜁니다.`,
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "변경 반영 실패");
    } finally {
      active.current = false;
      setRunning(false);
      router.refresh();
    }
  }
  return (
    <section className="supplier-import-summary supplier-change-control">
      <h2>공급처 변경 반영</h2>
      <p>
        반영할 도매처와 항목을 선택하세요. 현재 공급처 값과 스마트스토어 반영
        결과를 각각 확인합니다.
      </p>
      <fieldset disabled={running}>
        <legend>반영 범위</legend>
        <select
          aria-label="변경 반영 도매처"
          value={supplierCode}
          onChange={(event) => setSupplierCode(event.target.value)}
        >
          <option value="dome">친구도매</option>
          <option value="zicgam">직감</option>
          <option value="ebulsamchon">이불삼촌</option>
        </select>
        {choices.map((choice) => (
          <label key={choice.kind}>
            <input
              type="checkbox"
              checked={kinds.includes(choice.kind)}
              onChange={(event) =>
                setKinds(
                  event.target.checked
                    ? [...kinds, choice.kind]
                    : kinds.filter((kind) => kind !== choice.kind),
                )
              }
            />
            {choice.label}
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        disabled={running || !kinds.length}
        onClick={() => void run()}
      >
        선택 항목 대기·실패 작업 반영
      </button>
      {running && (
        <button
          type="button"
          onClick={() => {
            active.current = false;
          }}
        >
          현재 상품 처리 후 중단
        </button>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
