"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function ProductGrowthButton({ productId }: { productId: string }) {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function open() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(productId)}/growth`,
        { method: "POST" },
      );
      const body = await response.json();
      if (!response.ok || !body.id)
        throw new Error(body.error?.message ?? "성장관리 연결에 실패했습니다.");
      router.push(`/admin/keywords?product=${encodeURIComponent(body.id)}`);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "연결 상태를 확인해 주세요.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => void open()}>
        {pending ? "연결 중…" : "성장관리"}
      </button>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
