"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  WholesaleSiteInput,
  WholesaleSiteItem,
} from "@/modules/wholesale-sites/wholesale-site";

const emptyDraft: WholesaleSiteInput = {
  name: "",
  url: "",
  description: "",
};

export function WholesaleSiteMemo({
  initial,
}: {
  initial: WholesaleSiteItem[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(
    initial.length ? null : "new",
  );
  const [draft, setDraft] = useState<WholesaleSiteInput>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function startAdd() {
    setEditingId("new");
    setDraft(emptyDraft);
    setMessage("");
  }

  function startEdit(site: WholesaleSiteItem) {
    setEditingId(site.id);
    setDraft({
      name: site.name,
      url: site.url,
      description: site.description,
    });
    setMessage("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(
        editingId === "new"
          ? "/api/wholesale-sites"
          : `/api/wholesale-sites/${editingId}`,
        {
          method: editingId === "new" ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "도매사이트 메모를 저장하지 못했습니다.",
        );
      }
      setEditingId(null);
      setDraft(emptyDraft);
      setMessage("도매사이트 메모를 저장했습니다.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "도매사이트 메모를 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(site: WholesaleSiteItem) {
    if (!confirm(`${site.name} 링크를 삭제할까요?`)) return;
    setMessage("");
    const response = await fetch(`/api/wholesale-sites/${site.id}`, {
      method: "DELETE",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(
        body?.error?.message ?? "도매사이트 메모를 삭제하지 못했습니다.",
      );
      return;
    }
    if (editingId === site.id) setEditingId(null);
    setMessage("도매사이트 메모를 삭제했습니다.");
    router.refresh();
  }

  return (
    <section className="wholesale-site-memo">
      <div className="wholesale-site-toolbar">
        <div>
          <h2>저장한 사이트</h2>
          <p>사이트명을 누르면 새 탭에서 해당 도매사이트가 열립니다.</p>
        </div>
        <button type="button" onClick={startAdd} disabled={editingId === "new"}>
          링크 추가
        </button>
      </div>

      {editingId && (
        <form className="wholesale-site-editor" onSubmit={save}>
          <label>
            <span>사이트명</span>
            <input
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              placeholder="예: 직감"
              maxLength={100}
              required
            />
          </label>
          <label>
            <span>사이트 링크</span>
            <input
              type="url"
              value={draft.url}
              onChange={(event) =>
                setDraft({ ...draft, url: event.target.value })
              }
              placeholder="https://example.com"
              maxLength={2048}
              required
            />
          </label>
          <label className="wide">
            <span>설명</span>
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
              placeholder="주요 상품, 로그인 계정 메모를 제외한 이용 팁, 배송 조건 등을 적어두세요."
              maxLength={2000}
              rows={4}
            />
          </label>
          <div className="wholesale-site-editor-actions">
            <button type="submit" disabled={saving}>
              {saving ? "저장 중…" : editingId === "new" ? "추가" : "변경 저장"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditingId(null)}
              disabled={saving}
            >
              취소
            </button>
          </div>
        </form>
      )}

      {message && (
        <p className="wholesale-site-message" role="status">
          {message}
        </p>
      )}

      <div className="wholesale-site-list">
        {initial.map((site) => (
          <article key={site.id} className="wholesale-site-card">
            <div className="wholesale-site-card-main">
              <a href={site.url} target="_blank" rel="noreferrer">
                <strong>{site.name}</strong>
                <span>사이트 열기 ↗</span>
              </a>
              <small>{site.url}</small>
              <p>{site.description || "설명 없음"}</p>
            </div>
            <div className="wholesale-site-card-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => startEdit(site)}
              >
                수정
              </button>
              <button
                type="button"
                className="secondary danger"
                onClick={() => void remove(site)}
              >
                삭제
              </button>
            </div>
          </article>
        ))}
      </div>

      {!initial.length && !editingId && (
        <div className="wholesale-site-empty">
          <strong>저장한 도매사이트가 없습니다.</strong>
          <button type="button" onClick={startAdd}>
            첫 링크 추가하기
          </button>
        </div>
      )}
    </section>
  );
}
