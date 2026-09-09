"use client";
import { useState } from "react";
export function SupplierStatusControl({ productId, title, availability }: { productId: string; title: string; availability: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const statusType = availability === "sold_out" ? "OUTOFSTOCK" : availability === "discontinued" ? "SUSPENSION" : null;
  if (!statusType) return null;
  const label = statusType === "OUTOFSTOCK" ? "품절" : "판매 중지";
  async function apply() {
    if (!window.confirm(`${title}의 선택된 스마트스토어 판매 상태를 ${label}로 변경할까요? 공급처 최신 상태를 다시 확인한 뒤 실행하세요.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/products/${productId}/naver-publication`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmed: true, statusType, expectedSupplierAvailability: availability }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "반영 실패");
      setMessage(`${label} 반영 완료`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "반영 실패"); }
    finally { setBusy(false); }
  }
  return <div><button type="button" disabled={busy} onClick={() => void apply()}>{busy ? "반영 중…" : `선택 스토어 ${label} 반영`}</button><p role="status">{message}</p></div>;
}
