"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StoreSettings = {
  storeName: string;
  storeUrl: string;
  accountId: string | null;
} | null;

export function NaverStoreSettingsForm({
  initial,
}: {
  initial: StoreSettings;
}) {
  const router = useRouter();
  const [storeName, setStoreName] = useState(initial?.storeName ?? "");
  const [storeUrl, setStoreUrl] = useState(initial?.storeUrl ?? "");
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings/channels/naver/store", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeName, storeUrl, accountId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "스마트스토어 설정을 저장하지 못했습니다.",
        );
      }
      setMessage("등록 대상 스마트스토어를 저장했습니다.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "설정을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="naver-store-form" onSubmit={save}>
      <div className="naver-store-form-heading">
        <div>
          <span>등록 대상 계정</span>
          <h2>연동할 스마트스토어</h2>
          <p>상품 등록관리에서 사용할 스토어를 지정합니다.</p>
        </div>
        <strong>{initial ? "설정됨" : "입력 필요"}</strong>
      </div>
      <div className="naver-store-form-grid">
        <label>
          <span>스토어명</span>
          <input
            value={storeName}
            onChange={(event) => setStoreName(event.target.value)}
            placeholder="예: 쇼핑데이"
            maxLength={100}
            required
          />
        </label>
        <label>
          <span>스마트스토어 URL</span>
          <input
            type="url"
            value={storeUrl}
            onChange={(event) => setStoreUrl(event.target.value)}
            placeholder="https://smartstore.naver.com/스토어주소"
            required
          />
        </label>
        <label>
          <span>커머스 API 계정 ID (선택)</span>
          <input
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            placeholder="판매자 계정 인증 방식일 때 입력"
            maxLength={100}
          />
        </label>
      </div>
      <p className="naver-store-security-note">
        Client ID와 비밀키는 브라우저에 저장하지 않고 서버 환경변수에서만
        관리합니다. 위 계정과 API 앱 권한이 같은 스토어인지 확인하세요.
      </p>
      <div className="naver-store-form-actions">
        <button type="submit" disabled={saving}>
          {saving ? "저장 중…" : "스마트스토어 저장"}
        </button>
        {message && <span role="status">{message}</span>}
      </div>
    </form>
  );
}
