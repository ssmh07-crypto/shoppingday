"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RegistrationStartButton({
  researchId,
  disabled,
}: {
  researchId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/sourcing-researches/${researchId}/registration-product`,
        { method: "POST" },
      );
      const body = await response.json().catch(() => null) as {
        data?: { productId?: string };
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.data?.productId) {
        throw new Error(body?.error?.message ?? "상품 등록 초안을 만들지 못했습니다.");
      }
      router.push(`/admin/registration/${researchId}/edit`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "상품 등록 초안을 만들지 못했습니다.");
      setBusy(false);
    }
  }

  return (
    <div className="registration-start-action">
      <button type="button" onClick={start} disabled={disabled || busy}>
        {busy ? "초안 생성 중…" : "등록 준비 시작"}
      </button>
      {disabled && <small>소싱 키워드를 먼저 입력해 주세요.</small>}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
