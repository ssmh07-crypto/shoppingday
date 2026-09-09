"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function PriceApplicationControl() {
  const router = useRouter();
  const active = useRef(false);
  const [running, setRunning] = useState(false);
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
      !confirm(
        "공급가 변경으로 재계산된 판매가를 등록된 스마트스토어 상품에 반영할까요? 상품명·태그는 변경하지 않습니다.",
      )
    )
      return;
    active.current = true;
    setRunning(true);
    let completed = 0;
    try {
      while (active.current) {
        const response = await fetch(
          "/api/products/supplier-price-applications",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ confirmed: true }),
          },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error?.message ?? "가격 반영을 요청하지 못했습니다.",
          );
        if (body.result.status === "idle") {
          setMessage(`${completed}건 처리 완료 · 반영할 작업이 없습니다.`);
          break;
        }
        if (body.result.status === "failed")
          throw new Error(body.result.message);
        if (body.result.status === "busy") {
          setMessage("다른 작업이 처리 중입니다. 잠시 후 다시 실행하세요.");
          break;
        }
        if (body.result.status === "succeeded") completed++;
        setMessage(`${completed}건 가격 반영 완료`);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "가격 반영에 실패했습니다.",
      );
    } finally {
      active.current = false;
      setRunning(false);
      router.refresh();
    }
  }
  return (
    <section className="supplier-import-summary">
      <strong>스마트스토어 판매가 반영</strong>
      <p>
        실제 가격을 재확인하며 순차 처리합니다. 실패하면 멈추며, 연결 문제를
        해결한 뒤 같은 버튼으로 재시도합니다.
      </p>
      <button type="button" disabled={running} onClick={() => void run()}>
        대기·실패 판매가 반영
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
