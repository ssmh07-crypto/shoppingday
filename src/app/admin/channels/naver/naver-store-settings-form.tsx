"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StoreConnection = {
  id: string;
  storeName: string;
  storeUrl: string;
  authType: "SELF" | "SELLER";
  accountId: string | null;
  isDefault: boolean;
};

type Draft = Omit<StoreConnection, "id">;

const emptyDraft: Draft = {
  storeName: "",
  storeUrl: "",
  authType: "SELF",
  accountId: null,
  isDefault: false,
};

export function NaverStoreSettingsForm({
  initial,
}: {
  initial: StoreConnection[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(
    initial.length ? null : "new",
  );
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function edit(connection: StoreConnection) {
    setEditingId(connection.id);
    setDraft({
      storeName: connection.storeName,
      storeUrl: connection.storeUrl,
      authType: connection.authType,
      accountId: connection.accountId,
      isDefault: connection.isDefault,
    });
    setMessage("");
  }

  function add() {
    setEditingId("new");
    setDraft({ ...emptyDraft, isDefault: initial.length === 0 });
    setMessage("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const endpoint =
        editingId === "new"
          ? "/api/settings/channels/naver/store"
          : `/api/settings/channels/naver/store/${editingId}`;
      const response = await fetch(endpoint, {
        method: editingId === "new" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draft,
          accountId: draft.authType === "SELLER" ? draft.accountId ?? "" : "",
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "스마트스토어 연결을 저장하지 못했습니다.",
        );
      }
      setMessage("스마트스토어 연결을 저장했습니다.");
      setEditingId(null);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "스마트스토어 연결을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(connection: StoreConnection) {
    if (!confirm(`${connection.storeName} 연결을 삭제할까요?`)) return;
    setMessage("");
    const response = await fetch(
      `/api/settings/channels/naver/store/${connection.id}`,
      { method: "DELETE" },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(body?.error?.message ?? "스토어 연결을 삭제하지 못했습니다.");
      return;
    }
    setMessage("스토어 연결을 삭제했습니다.");
    router.refresh();
  }

  return (
    <section className="naver-store-form">
      <div className="naver-store-form-heading">
        <div>
          <span>등록 대상 계정</span>
          <h2>연결된 스마트스토어</h2>
          <p>
            최대 5개까지 연결할 수 있으며 기본 스토어는 신규 상품의 최초
            발행 대상으로 사용됩니다.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={add}
          disabled={initial.length >= 5 || editingId === "new"}
        >
          스토어 추가 ({initial.length}/5)
        </button>
      </div>

      <div className="naver-store-connections">
        {initial.map((connection) => (
          <article key={connection.id} className="naver-store-connection-card">
            <div>
              <span>
                {connection.authType === "SELF" ? "내 스토어" : "다른 판매자"}
                {connection.isDefault && <strong>기본</strong>}
              </span>
              <h3>{connection.storeName}</h3>
              <a href={connection.storeUrl} target="_blank" rel="noreferrer">
                {connection.storeUrl}
              </a>
              {connection.accountId && (
                <small>판매자 ID/UID: {connection.accountId}</small>
              )}
            </div>
            <div>
              <button type="button" className="secondary" onClick={() => edit(connection)}>
                편집
              </button>
              <button type="button" className="secondary" onClick={() => void remove(connection)}>
                삭제
              </button>
            </div>
          </article>
        ))}
      </div>

      {editingId && (
        <form className="naver-store-connection-editor" onSubmit={save}>
          <div className="naver-store-form-grid">
            <label>
              <span>스토어명</span>
              <input
                value={draft.storeName}
                onChange={(event) =>
                  setDraft({ ...draft, storeName: event.target.value })
                }
                maxLength={100}
                required
              />
            </label>
            <label>
              <span>스마트스토어 URL</span>
              <input
                type="url"
                value={draft.storeUrl}
                onChange={(event) =>
                  setDraft({ ...draft, storeUrl: event.target.value })
                }
                placeholder="https://smartstore.naver.com/store-id"
                required
              />
            </label>
            <label>
              <span>연결 유형</span>
              <select
                value={draft.authType}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    authType: event.target.value as Draft["authType"],
                    accountId:
                      event.target.value === "SELF" ? null : draft.accountId,
                  })
                }
              >
                <option value="SELF">내 명의 스토어 (SELF)</option>
                <option value="SELLER">다른 판매자 스토어 (SELLER)</option>
              </select>
            </label>
            {draft.authType === "SELLER" && (
              <label>
                <span>판매자 ID 또는 UID</span>
                <input
                  value={draft.accountId ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, accountId: event.target.value })
                  }
                  placeholder="판매자 ID 또는 ncp_로 시작하는 UID"
                  maxLength={100}
                  required
                />
              </label>
            )}
          </div>
          <label className="naver-store-default-check">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(event) =>
                setDraft({ ...draft, isDefault: event.target.checked })
              }
            />
            신규 상품의 기본 발행 스토어로 지정
          </label>
          <p className="naver-store-security-note">
            SELLER 연결은 판매자 ID/UID만 입력한다고 승인되지 않습니다. 해당
            판매자가 Shoppingday 커머스 솔루션의 접근 요청을 승인한 뒤 사용할 수
            있습니다. Client Secret은 화면이나 데이터베이스에 저장하지 않습니다.
          </p>
          <div className="naver-store-form-actions">
            <button type="submit" disabled={saving}>
              {saving ? "저장 중…" : "연결 저장"}
            </button>
            <button type="button" className="secondary" onClick={() => setEditingId(null)}>
              취소
            </button>
          </div>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
