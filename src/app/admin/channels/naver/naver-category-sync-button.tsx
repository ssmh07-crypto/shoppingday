"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NaverCategorySyncButton({
  configured,
}: {
  configured: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  async function sync() {
    setPending(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/integrations/naver/categories", {
        method: "POST",
        headers: { accept: "application/json" },
      });
      const data = (await response.json()) as {
        success: boolean;
        result?: { total: number; leaf: number };
        error?: { message?: string };
      };
      if (!response.ok || !data.success) {
        throw new Error(
          data.error?.message || "카테고리 동기화에 실패했습니다.",
        );
      }
      setMessage(
        `완료: 전체 ${data.result?.total ?? 0}개 · 최종 카테고리 ${data.result?.leaf ?? 0}개`,
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "카테고리 동기화에 실패했습니다.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="naver-sync-control">
      <button type="button" onClick={sync} disabled={!configured || pending}>
        {pending ? "동기화 중…" : "네이버 카테고리 동기화"}
      </button>
      {message && <span role="status">{message}</span>}
    </div>
  );
}
