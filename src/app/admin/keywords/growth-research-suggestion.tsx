"use client";
import { useState } from "react";
import type { NaverProductAttribute } from "@/lib/db/schema";
type Suggestion = { title: string; searchTags: string[]; warnings: string[]; categoryId: string | null; attributes: { categoryId: string; attributeSeq: number; attributeValueSeq: number }[] };
export function GrowthResearchSuggestion({ id, categoryId, attributes, onApply }: { id: string; categoryId?: string | null; attributes: NaverProductAttribute[]; onApply: (title: string, tags: string[], attributes: NaverProductAttribute[]) => void }) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function inspect() {
    setBusy(true); setSuggestion(null); setMessage("");
    try {
      const response = await fetch(`/api/growth-research/${id}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "분석 조회 실패");
      setSuggestion(body.suggestion);
      if (!body.suggestion) setMessage("정밀 분석에서 키워드를 분류하고 먼저 저장해 주세요.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "분석 조회 실패"); }
    finally { setBusy(false); }
  }
  function apply() {
    if (!suggestion) return;
    const next = [...attributes];
    if (suggestion.categoryId === categoryId) for (const value of suggestion.attributes) {
      if (value.categoryId === categoryId && !next.some(attribute => attribute.attributeSeq === value.attributeSeq)) next.push({ attributeSeq: value.attributeSeq, attributeValueSeq: value.attributeValueSeq, minValue: "", maxValue: "", unitCode: null });
    }
    onApply(suggestion.title, suggestion.searchTags, next);
    setSuggestion(null); setMessage("편집 초안에 적용했습니다. 변경사항을 확인한 뒤 스마트스토어에 반영하세요.");
  }
  return <section className="keyword-card">
    <button type="button" disabled={busy} onClick={() => void inspect()}>{busy ? "조회 중…" : "저장된 정밀 분석으로 상품명·태그 초안 확인"}</button>
    {suggestion && <div><p>상품명: {suggestion.title}</p><p>검색 태그: {suggestion.searchTags.join(", ") || "없음"}</p><p>현재 카테고리가 같을 때만 비어 있는 공식 속성을 채웁니다. 기존 속성값은 유지합니다.</p>{suggestion.warnings.map((warning, index) => <p key={index}>{warning}</p>)}<button type="button" disabled={!suggestion.title} onClick={apply}>확인한 상품명·태그를 편집 초안에 적용</button></div>}
    <p role="status">{message}</p>
  </section>;
}
