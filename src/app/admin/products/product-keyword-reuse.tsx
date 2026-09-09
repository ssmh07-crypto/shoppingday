"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
type Preview = {
  id: string;
  title: string;
  draftVersion: number;
  previousKeywordCount: number;
  nextKeywordCount: number;
  categoryChanges: boolean;
  previousCategory?: string | null;
  nextCategory?: string | null;
};
export function ProductKeywordReuse({
  products,
}: {
  products: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [sourceId, setSourceId] = useState("");
  const [copyCategory, setCopyCategory] = useState(false);
  const [copyTags, setCopyTags] = useState(false);
  const [preview, setPreview] = useState<{
    sourceVersion: number;
    sourceTitle?: string;
    searchTags?: string[];
    previews: Preview[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function request(url: string, method: string, body: object) {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message ?? "요청 실패");
    return result;
  }
  async function inspect() {
    setBusy(true);
    setPreview(null);
    try {
      setPreview(
        await request("/api/products/reuse-keywords", "POST", {
          sourceId,
          targetIds: products.map((p) => p.id),
          copyCategory,
          copyTags,
        }),
      );
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "미리보기 실패");
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (
      !preview ||
      !confirm(
        "선택 상품이 같은 상품군이고 키워드·태그·카테고리가 적합함을 확인했나요? 상품명과 가격은 유지합니다.",
      )
    )
      return;
    setBusy(true);
    const failures: string[] = [];
    const failedTargets: Preview[] = [];
    let success = 0;
    for (const target of preview.previews) {
      try {
        await request("/api/products/reuse-keywords", "PATCH", {
          sourceId,
          targetId: target.id,
          sourceVersion: preview.sourceVersion,
          draftVersion: target.draftVersion,
          copyCategory,
          copyTags,
          confirmed: true,
        });
        success++;
      } catch (error) {
        failedTargets.push(target);
        failures.push(
          `${target.title}: ${error instanceof Error ? error.message : "실패"}`,
        );
      }
    }
    setMessage(`${success}개 적용. ${failures.join(" / ")}`);
    setPreview(failedTargets.length ? { ...preview, previews: failedTargets } : null);
    setBusy(false);
    router.refresh();
  }
  return (
    <details className="inventory-keyword-reuse">
      <summary>선택 상품군에 엑셀 키워드 재사용</summary>
      <p>
        기준 상품 편집에서 엑셀을 한 번 저장한 뒤 같은 상품군에 후보를
        추가합니다. 기존 분류·상품명·가격은 유지합니다.
      </p>
      <fieldset disabled={busy}>
        <label>
          기준 상품{" "}
          <select
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value);
              setPreview(null);
            }}
          >
            <option value="">선택하세요</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={copyCategory}
            onChange={(e) => {
              setCopyCategory(e.target.checked);
              setPreview(null);
            }}
          />
          카테고리도 적용 (변경 시 기존 속성 초기화)
        </label>
        <label>
          <input
            type="checkbox"
            checked={copyTags}
            onChange={(e) => {
              setCopyTags(e.target.checked);
              setPreview(null);
            }}
          />
          검색 태그도 교체
        </label>
        <button
          type="button"
          disabled={!sourceId || products.length < 2}
          onClick={() => void inspect()}
        >
          변경 미리보기
        </button>
        {preview && (
          <>
            <p>기준 상품: {preview.sourceTitle}</p>
            {copyTags && <p>교체할 검색 태그: {preview.searchTags?.join(", ") || "없음 (기존 태그 삭제)"}</p>}
            <ul>
              {preview.previews.map((p) => (
                <li key={p.id}>
                  {p.title}: 후보 {p.previousKeywordCount} →{" "}
                  {p.nextKeywordCount}개
                  {p.categoryChanges ? ` · 카테고리 ${p.previousCategory || "미지정"} → ${p.nextCategory || "미지정"} · 기존 속성 초기화` : ""}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => void apply()}>
              확인한 {preview.previews.length}개에 적용
            </button>
          </>
        )}
      </fieldset>
      <p role="status">{message}</p>
      {message && preview && <p>실패한 상품만 남았습니다. 편집 충돌이 있으면 변경 미리보기를 다시 확인하세요.</p>}
    </details>
  );
}
