"use client";
/* eslint-disable @next/next/no-img-element -- supplier thumbnails are external URLs */

export type SupplierSourceCandidate = {
  supplierProductId: string;
  productId: string;
  externalProductId: string;
  originalName: string;
  supplierPrice: number | null;
  thumbnailUrl: string | null;
  imageCount: number;
  optionCount: number;
  hasDescription: boolean;
  url: string | null;
};

export function SupplierSourcePicker({
  query,
  candidates,
  status,
  searching,
  applyingId,
  onQueryChange,
  onSearch,
  onApply,
}: {
  query: string;
  candidates: SupplierSourceCandidate[];
  status: string;
  searching: boolean;
  applyingId: string | null;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onApply: (candidate: SupplierSourceCandidate) => void;
}) {
  return (
    <section className="drawer-form-section sourcing-supplier-source">
      <div className="drawer-section-title">
        <span>직감</span>
        <div>
          <h3>타겟 직감 상품 연결</h3>
          <p>
            직감에 수집된 상품을 이 소싱 등록과 하나로 연결합니다. 이미지·상세페이지·
            옵션은 직감 상품을 사용하고 상품명·검색태그·판매가·카테고리는 소싱에서
            정한 값을 유지합니다.
          </p>
        </div>
      </div>
      <div className="sourcing-supplier-source-search">
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSearch();
            }
          }}
          placeholder="직감 상품명, 상품번호 또는 상세페이지 URL"
          aria-label="가져올 직감 상품 검색"
        />
        <button type="button" onClick={onSearch} disabled={searching}>
          {searching ? "검색 중…" : "직감 상품 찾기"}
        </button>
      </div>
      {status && <p className="sourcing-supplier-source-status" role="status">{status}</p>}
      {candidates.length > 0 && (
        <div className="sourcing-supplier-source-results" aria-label="직감 상품 검색 결과">
          {candidates.map((candidate) => (
            <article key={candidate.supplierProductId}>
              <div className="sourcing-supplier-source-thumbnail">
                {candidate.thumbnailUrl ? (
                  <img src={candidate.thumbnailUrl} alt="" loading="lazy" />
                ) : (
                  <span>이미지 없음</span>
                )}
              </div>
              <div>
                <strong>{candidate.originalName}</strong>
                <span>
                  직감 {candidate.externalProductId} · 공급가{" "}
                  {candidate.supplierPrice == null
                    ? "미입력"
                    : `${candidate.supplierPrice.toLocaleString("ko-KR")}원`}
                </span>
                <small>
                  이미지 {candidate.imageCount}개 · 상세페이지{" "}
                  {candidate.hasDescription ? "있음" : "없음"} · 옵션 {candidate.optionCount}개
                </small>
                {candidate.url && <a href={candidate.url} target="_blank" rel="noreferrer">직감 상품 확인</a>}
              </div>
              <button
                type="button"
                onClick={() => onApply(candidate)}
                disabled={applyingId !== null || searching}
              >
                {applyingId === candidate.supplierProductId ? "연결하는 중…" : "이 상품으로 연결"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
