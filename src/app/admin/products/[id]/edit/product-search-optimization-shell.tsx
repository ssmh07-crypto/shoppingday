"use client";

import type { ReactNode } from "react";

export function ProductSearchOptimizationSummary({
  title,
  maximumLength,
  titleKeywords,
  searchTags,
  confirmationRequiredCount,
  originalName,
  error,
  onTitleChange,
  onTitleBlur,
  onOpen,
}: {
  title: string;
  maximumLength: number;
  titleKeywords: string[];
  searchTags: string[];
  confirmationRequiredCount: number;
  originalName: string | null;
  error?: string;
  onTitleChange: (title: string) => void;
  onTitleBlur: () => void;
  onOpen: () => void;
}) {
  const normalizedTags = searchTags.map((tag) => tag.trim()).filter(Boolean);
  return (
    <div className="drawer-search-optimization-summary">
      <div className="drawer-product-title-heading">
        <label htmlFor="product-selling-title">판매용 상품명</label>
        <button type="button" onClick={onOpen}>키워드 편집</button>
      </div>
      <input
        id="product-selling-title"
        value={title}
        maxLength={maximumLength}
        onChange={(event) => onTitleChange(event.target.value)}
        onBlur={onTitleBlur}
      />
      <div className="drawer-search-optimization-meta">
        <span>{title.length}/{maximumLength}자</span>
        <span>상품명 키워드 {titleKeywords.length}개</span>
        <span>검색 태그 {normalizedTags.length}/10</span>
        {confirmationRequiredCount > 0 && (
          <span className="needs-review">연결 확인 {confirmationRequiredCount}개</span>
        )}
      </div>
      {titleKeywords.length > 0 && (
        <div className="drawer-search-optimization-chips" aria-label="추천에 사용할 상품명 키워드 요약">
          {titleKeywords.slice(0, 6).map((keyword) => <span key={keyword}>{keyword}</span>)}
          {titleKeywords.length > 6 && <small>+{titleKeywords.length - 6}</small>}
        </div>
      )}
      {normalizedTags.length > 0 && (
        <div className="drawer-search-tag-chips" aria-label="검색 태그 요약">
          {normalizedTags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      )}
      {maximumLength === 50 && title.length > 40 && (
        <small className="registration-title-length-warning">
          40자를 넘었습니다. 핵심 상품과 수식어가 바로 이해되는지 검토해 주세요.
        </small>
      )}
      {error && <small className="field-error">{error}</small>}
      <span className="drawer-original-title">
        <small>원본 상품명</small>
        <strong>{originalName ?? "-"}</strong>
      </span>
    </div>
  );
}

export function ProductKeywordWorkspaceShell({
  sourcing,
  onClose,
  children,
}: {
  sourcing: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="keyword-workspace-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyword-workspace-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <section className="keyword-workspace-panel">
        <header className="keyword-workspace-header">
          <div>
            <small>{sourcing ? "소싱 키워드 재사용" : "위탁상품 빠른 등록"}</small>
            <h3 id="keyword-workspace-title">검색 최적화</h3>
            <p>
              상품명 추천 재료와 검색 태그를 한곳에서 정리합니다. 저장 전까지
              스마트스토어에는 반영되지 않습니다.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="검색 최적화 닫기">완료</button>
        </header>
        <div className="keyword-workspace-body">{children}</div>
      </section>
    </div>
  );
}
