"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type KeywordDraft = {
  id: string; keyword: string; normalizedKeyword: string;
  monthlySearchVolume: number | null;
  placement: "unclassified" | "product_name" | "tag";
  source: "naver-search-ad"; importedAt: string;
};
type Preview = {
  id: string; previousTitle: string; proposedTitle: string;
  previousTags: string[]; proposedTags: string[]; draftVersion: number;
  seed: string; candidateCount: number; keywordDrafts: KeywordDraft[];
  warning: string | null; selected: boolean; applyTitle: boolean; applyTags: boolean;
};

export function ProductNaverKeywordBulk({ productIds }: { productIds: string[] }) {
  const router = useRouter();
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [meta, setMeta] = useState<{ groupCount: number; tagLookupConfigured: boolean } | null>(null);
  const applicableCount = previews.filter(
    (item) => item.selected && (item.applyTitle || item.applyTags),
  ).length;

  async function analyze() {
    setBusy(true); setMessage(""); setPreviews([]);
    try {
      const response = await fetch("/api/products/bulk-keywords", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ productIds }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.errors?.naverSearchAd ?? result.error?.message ?? "분석하지 못했습니다.");
      setPreviews(result.data.previews.map((item: Omit<Preview, "selected" | "applyTitle" | "applyTags">) => ({
        ...item, selected: true,
        applyTitle: item.proposedTitle !== item.previousTitle,
        applyTags: item.proposedTags.join("|") !== item.previousTags.join("|"),
      })));
      setMeta(result.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "분석하지 못했습니다.");
    } finally { setBusy(false); }
  }

  async function apply() {
    const selected = previews.filter((item) => item.selected && (item.applyTitle || item.applyTags));
    if (!selected.length) { setMessage("적용할 상품과 변경 항목을 선택해 주세요."); return; }
    if (!confirm(`${selected.length}개 상품의 선택한 상품명·태그를 저장할까요? 스마트스토어에는 아직 전송하지 않습니다.`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/products/bulk-keywords", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ applications: selected.map((item) => ({
          id: item.id, draftVersion: item.draftVersion, title: item.proposedTitle,
          searchTags: item.proposedTags, keywordDrafts: item.keywordDrafts,
          applyTitle: item.applyTitle, applyTags: item.applyTags,
        })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "저장하지 못했습니다.");
      setMessage(`${result.data.succeeded}개 저장 완료${result.data.failed ? `, ${result.data.failed}개 실패` : ""}`);
      const succeeded = new Set<string>(result.data.results.filter((item: { success: boolean }) => item.success).map((item: { id: string }) => item.id));
      setPreviews((current) => current.filter((item) => !succeeded.has(item.id)));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장하지 못했습니다.");
    } finally { setBusy(false); }
  }

  function update(id: string, values: Partial<Preview>) {
    setPreviews((current) => current.map((item) => item.id === id ? { ...item, ...values } : item));
  }

  return (
    <details className="inventory-keyword-reuse inventory-naver-keyword-bulk">
      <summary>네이버 연관키워드로 선택 상품 일괄 가공</summary>
      <p>같은 카테고리는 한 번만 조회해 월간 검색수 기반 상품명 후보와 네이버 공식 추천 태그를 만듭니다. 저장 후 스마트스토어 등록 단계에서 별도로 전송됩니다.</p>
      <button type="button" disabled={busy || !productIds.length} onClick={() => void analyze()}>
        {busy ? "처리 중…" : `${productIds.length}개 상품 분석`}
      </button>
      {meta && <p className="inventory-bulk-meta">카테고리 {meta.groupCount}개로 묶어 조회 · 공식 태그 {meta.tagLookupConfigured ? "연결됨" : "미연결(기존 태그 유지)"}</p>}
      {previews.length > 0 && <>
        <div className="inventory-bulk-selection">
          <button className="inventory-bulk-save" type="button" disabled={busy || !applicableCount} onClick={() => void apply()}>
            {applicableCount ? `${applicableCount}개 가공 결과 적용·저장` : "적용할 변경 없음"}
          </button>
          <button type="button" onClick={() => setPreviews((items) => items.map((item) => ({ ...item, selected: true })))}>전체 선택</button>
          <button type="button" onClick={() => setPreviews((items) => items.map((item) => ({ ...item, selected: false })))}>전체 해제</button>
        </div>
        <div className="inventory-keyword-preview-list">
          {previews.map((item) => <article key={item.id} className={item.selected ? "is-selected" : ""}>
            <header><label><input type="checkbox" checked={item.selected} onChange={(event) => update(item.id, { selected: event.target.checked })} /><strong>{item.previousTitle}</strong></label><span>기준어 {item.seed} · 후보 {item.candidateCount}개</span></header>
            <label className="inventory-keyword-change"><input type="checkbox" checked={item.applyTitle} onChange={(event) => update(item.id, { applyTitle: event.target.checked })} /><span>상품명</span><input value={item.proposedTitle} maxLength={200} onChange={(event) => update(item.id, { proposedTitle: event.target.value })} /></label>
            <label className="inventory-keyword-change"><input type="checkbox" checked={item.applyTags} onChange={(event) => update(item.id, { applyTags: event.target.checked })} /><span>태그</span><input value={item.proposedTags.join(", ")} onChange={(event) => update(item.id, { proposedTags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 10) })} placeholder="쉼표로 구분, 최대 10개" /></label>
            {item.warning && <small>{item.warning}</small>}
          </article>)}
        </div>
        <div className="inventory-bulk-selection inventory-bulk-selection-bottom">
          <span>선택한 상품명·태그 변경을 Shoppingday 초안에 저장합니다.</span>
          <button className="inventory-bulk-save" type="button" disabled={busy || !applicableCount} onClick={() => void apply()}>
            {applicableCount ? `${applicableCount}개 가공 결과 적용·저장` : "적용할 변경 없음"}
          </button>
        </div>
      </>}
      <p role="status">{message}</p>
    </details>
  );
}
