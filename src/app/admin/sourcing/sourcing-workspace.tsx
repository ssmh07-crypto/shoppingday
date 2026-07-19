"use client";

import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import {
  mergeImportedKeywords,
  parseItemScoutWorkbook,
} from "@/modules/sourcing/itemscout-import";
import { buildSourcingRegistrationDraft } from "@/modules/sourcing/registration-draft";
import {
  analyzeReviews,
  formatReviewEvidence,
  parsePastedReviews,
  parseReviewFile,
  type SourcingReviewAnalysis,
  type SourcingReviewEntry,
} from "@/modules/sourcing/review-analysis";
import {
  defaultSourcingSignals,
  type SourcingKeywordPlacement,
  type SourcingResearchInput,
  type SourcingResearchRecord,
  type SourcingResearchSignal,
  type SourcingResearchSignals,
  type SourcingResearchStatus,
  type SourcingSample,
} from "@/modules/sourcing/types";

type ListItem = Pick<
  SourcingResearchRecord,
  | "id"
  | "status"
  | "sourcingKeyword"
  | "monthlySearchVolume"
  | "sixMonthRevenue"
  | "maximumPurchasePrice"
  | "createdAt"
  | "updatedAt"
>;

type ProductOption = {
  id: string;
  title: string;
  originalName: string | null;
  status: string;
};

const statusLabels: Record<SourcingResearchStatus, string> = {
  researching: "조사 중",
  candidate: "소싱 후보",
  sample_ordered: "샘플 확인 중",
  selected: "소싱 결정",
  rejected: "보류",
};

const keywordPlacementLabels: Record<SourcingKeywordPlacement, string> = {
  unclassified: "미분류",
  product_name: "상품명 키워드",
  tag: "태그 키워드",
  attribute: "속성 키워드",
  category: "카테고리 키워드",
};

type KeywordVolumeFilter = "all" | "up_to_1000" | "1001_to_10000" | "over_10000";

const keywordVolumeFilterLabels: Record<KeywordVolumeFilter, string> = {
  all: "검색수 전체",
  up_to_1000: "1,000 이하",
  "1001_to_10000": "1,001~10,000",
  over_10000: "10,001 이상",
};

const signalQuestions: Array<{
  key: keyof SourcingResearchSignals;
  label: string;
  description: string;
  preferred: "yes" | "no";
}> = [
  { key: "widePriceSpectrum", label: "가격 스펙트럼이 넓은가?", description: "저가부터 프리미엄까지 선택 폭이 있는지 확인합니다.", preferred: "yes" },
  { key: "manyCustomerPainPoints", label: "소비자의 불편함이 많은가?", description: "낮은 평점과 반복되는 단점에서 개선 기회를 찾습니다.", preferred: "yes" },
  { key: "mainKeywordDominant", label: "메인 키워드가 명확하고 대다수 상품이 일치하는가?", description: "소비자가 실제로 검색하는 대표 품목명과 시장 상품이 일치하는지 확인합니다.", preferred: "yes" },
  { key: "strongBrandMarket", label: "브랜드성이 강한가?", description: "브랜드 이름이 구매 결정에 큰 영향을 미치는 시장인지 봅니다.", preferred: "no" },
  { key: "expertiseRequired", label: "전문성이 필요한가?", description: "사용 경험 없이 제품 품질을 판단하기 어려운지 확인합니다.", preferred: "no" },
  { key: "trendDriven", label: "유행성 제품인가?", description: "짧은 기간에 수요가 급등했다 사라질 위험을 확인합니다.", preferred: "no" },
  { key: "domesticProductsDominant", label: "국산 제품이 대다수인가?", description: "중국 소싱 제품이 원산지 선호와 충돌하는지 확인합니다.", preferred: "no" },
  { key: "manySkus", label: "SKU가 많은 제품인가?", description: "색상·사이즈별 재고 분산 위험을 확인합니다.", preferred: "no" },
  { key: "seasonal", label: "시즌성 제품인가?", description: "월별 관심도 최고·최저 차이가 큰지 확인합니다.", preferred: "no" },
  { key: "bulky", label: "부피가 큰 제품인가?", description: "초기 보관비와 배송비 부담을 확인합니다.", preferred: "no" },
  { key: "certificationRequired", label: "인증이 필요한 제품인가?", description: "KC 등 인증 비용과 출시 지연 가능성을 확인합니다.", preferred: "no" },
];

export function SourcingWorkspace({
  initialItems,
  initialDetail,
}: {
  initialItems: ListItem[];
  initialDetail: SourcingResearchRecord | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [detail, setDetail] = useState<SourcingResearchRecord | null>(initialDetail);
  const [draft, setDraft] = useState<SourcingResearchInput>(() =>
    initialDetail ? recordToInput(initialDetail) : emptyResearch(),
  );
  const [creating, setCreating] = useState(!initialDetail);
  const [busy, setBusy] = useState(false);
  const [importingKeywords, setImportingKeywords] = useState(false);
  const [keywordQuery, setKeywordQuery] = useState("");
  const [keywordPlacementFilter, setKeywordPlacementFilter] =
    useState<SourcingKeywordPlacement | "all">("all");
  const [keywordVolumeFilter, setKeywordVolumeFilter] =
    useState<KeywordVolumeFilter>("all");
  const [keywordVolumeSort, setKeywordVolumeSort] = useState<"desc" | "asc">("desc");
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [targetProductId, setTargetProductId] = useState("");
  const [registrationTitle, setRegistrationTitle] = useState("");
  const [registrationTags, setRegistrationTags] = useState<string[]>([]);
  const [registrationPrepared, setRegistrationPrepared] = useState(false);
  const [appliedProductId, setAppliedProductId] = useState<string | null>(null);
  const [reviewRawText, setReviewRawText] = useState("");
  const [reviewFileEntries, setReviewFileEntries] = useState<SourcingReviewEntry[]>([]);
  const [reviewAnalysis, setReviewAnalysis] = useState<SourcingReviewAnalysis | null>(null);
  const [reviewImporting, setReviewImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const maximumPurchasePrice = useMemo(
    () =>
      draft.expectedSellingPrice == null
        ? null
        : Math.floor(draft.expectedSellingPrice * 0.7),
    [draft.expectedSellingPrice],
  );

  const keywordCounts = useMemo(() => {
    const counts: Record<SourcingKeywordPlacement, number> = {
      unclassified: 0,
      product_name: 0,
      tag: 0,
      attribute: 0,
      category: 0,
    };
    for (const item of draft.relatedKeywords) counts[item.placement] += 1;
    return counts;
  }, [draft.relatedKeywords]);

  const visibleRelatedKeywords = useMemo(() => {
    const normalizedQuery = keywordQuery.trim().replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
    return draft.relatedKeywords.filter(
      (item) => {
        const volume = item.monthlySearchVolume;
        const volumeMatches =
          keywordVolumeFilter === "all" ||
          (keywordVolumeFilter === "up_to_1000" && volume != null && volume <= 1_000) ||
          (keywordVolumeFilter === "1001_to_10000" && volume != null && volume > 1_000 && volume <= 10_000) ||
          (keywordVolumeFilter === "over_10000" && volume != null && volume > 10_000);
        return (
        (keywordPlacementFilter === "all" || item.placement === keywordPlacementFilter) &&
          volumeMatches &&
          (!normalizedQuery || item.normalizedKeyword.includes(normalizedQuery))
        );
      },
    ).sort((left, right) => {
      const leftVolume = left.monthlySearchVolume;
      const rightVolume = right.monthlySearchVolume;
      if (leftVolume == null && rightVolume == null) return left.keyword.localeCompare(right.keyword, "ko");
      if (leftVolume == null) return 1;
      if (rightVolume == null) return -1;
      return keywordVolumeSort === "desc"
        ? rightVolume - leftVolume
        : leftVolume - rightVolume;
    });
  }, [draft.relatedKeywords, keywordPlacementFilter, keywordQuery, keywordVolumeFilter, keywordVolumeSort]);

  const registrationDraft = useMemo(
    () => buildSourcingRegistrationDraft(draft.sourcingKeyword, draft.relatedKeywords),
    [draft.relatedKeywords, draft.sourcingKeyword],
  );

  async function selectItem(id: string) {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await api<SourcingResearchRecord>(`/api/sourcing-researches/${id}`);
      setDetail(response.data!);
      setDraft(recordToInput(response.data!));
      setCreating(false);
      resetRegistrationPreparation();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function startNew() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      if (detail) {
        await api<SourcingResearchRecord>(`/api/sourcing-researches/${detail.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
      }
      const response = await api<SourcingResearchRecord>("/api/sourcing-researches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emptyResearch()),
      });
      setDetail(response.data!);
      setDraft(recordToInput(response.data!));
      setCreating(false);
      resetRegistrationPreparation();
      const listResponse = await api<never, ListItem[]>("/api/sourcing-researches");
      setItems(listResponse.items ?? []);
      setMessage("새 소싱 아이템을 목록에 추가했습니다.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function save(temporary = false) {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await api<SourcingResearchRecord>(
        creating ? "/api/sourcing-researches" : `/api/sourcing-researches/${detail!.id}`,
        {
          method: creating ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      setDetail(response.data!);
      setDraft(recordToInput(response.data!));
      setCreating(false);
      setMessage(temporary ? "소싱 아이템을 임시저장했습니다." : "소싱 아이템을 저장했습니다.");
      const listResponse = await api<never, ListItem[]>("/api/sourcing-researches");
      setItems(listResponse.items ?? []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function importItemScoutKeywords(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setImportingKeywords(true);
    setMessage(null);
    setError(null);
    try {
      const imported = await parseItemScoutWorkbook(file);
      setDraft((current) => ({
        ...current,
        relatedKeywords: mergeImportedKeywords(
          current.relatedKeywords,
          imported.keywords,
        ),
      }));
      setKeywordPlacementFilter("all");
      setKeywordQuery("");
      setMessage(
        `${imported.sourceRowCount}행에서 키워드 ${imported.keywords.length}개를 가져왔습니다. 중복 ${imported.duplicateCount}개는 합쳤습니다.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      input.value = "";
      setImportingKeywords(false);
    }
  }

  async function prepareRegistration() {
    setRegistrationTitle(registrationDraft.title);
    setRegistrationTags(registrationDraft.searchTags);
    setRegistrationPrepared(true);
    setAppliedProductId(null);
    setMessage(null);
    setError(null);
    if (productOptions.length) return;
    await loadProductOptions();
  }

  async function loadProductOptions(search = productSearch) {
    try {
      const query = new URLSearchParams({ pageSize: "100" });
      if (search.trim()) query.set("search", search.trim());
      const response = await api<never, ProductOption[]>(`/api/products?${query}`);
      setProductOptions(response.items ?? []);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function applyRegistrationToProduct() {
    if (!targetProductId || !registrationTitle.trim()) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await api<SourcingResearchRecord>(
        creating ? "/api/sourcing-researches" : `/api/sourcing-researches/${detail!.id}`,
        {
          method: creating ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const savedResearch = saved.data!;
      setDetail(savedResearch);
      setDraft(recordToInput(savedResearch));
      setCreating(false);
      await api(`/api/sourcing-researches/${savedResearch.id}/apply-to-product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: targetProductId,
          title: registrationTitle,
          searchTags: registrationTags,
        }),
      });
      setAppliedProductId(targetProductId);
      setMessage("상품명과 검색 태그를 상품 등록 초안에 반영했습니다.");
      const listResponse = await api<never, ListItem[]>("/api/sourcing-researches");
      setItems(listResponse.items ?? []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function importReviewFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setReviewImporting(true);
    setMessage(null);
    setError(null);
    try {
      const reviews = await parseReviewFile(file);
      setReviewFileEntries(reviews);
      setReviewAnalysis(null);
      setMessage(`리뷰 파일에서 ${reviews.length}개를 읽었습니다. 분석 버튼을 눌러 결과를 확인하세요.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      input.value = "";
      setReviewImporting(false);
    }
  }

  function runReviewAnalysis() {
    setMessage(null);
    setError(null);
    try {
      const pasted = parsePastedReviews(reviewRawText);
      setReviewAnalysis(analyzeReviews([...reviewFileEntries, ...pasted]));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function applyReviewAnalysis() {
    if (!reviewAnalysis) return;
    setDraft((current) => ({
      ...current,
      positiveReviews: replaceGeneratedReviewSection(
        current.positiveReviews,
        formatReviewEvidence(reviewAnalysis.positiveTerms, reviewAnalysis.positiveExamples),
      ),
      negativeReviews: replaceGeneratedReviewSection(
        current.negativeReviews,
        formatReviewEvidence(reviewAnalysis.negativeTerms, reviewAnalysis.negativeExamples),
      ),
      customerNeeds: replaceGeneratedReviewSection(
        current.customerNeeds,
        reviewAnalysis.customerNeedCandidates.map((item) => `- ${item}`).join("\n"),
      ),
      finalSellingPoint: replaceGeneratedReviewSection(
        current.finalSellingPoint,
        reviewAnalysis.sellingPointCandidates.map((item) => `- ${item}`).join("\n"),
      ),
    }));
    setMessage("규칙 기반 리뷰 분석 결과를 조사 항목에 반영했습니다. 저장 전에 내용을 확인하세요.");
  }

  return (
    <>
      <header className="inventory-topbar sourcing-topbar">
        <div>
          <strong>소싱 조사</strong>
          <span>키워드에서 시작해 국내 시장·리뷰·샘플을 순서대로 검토합니다.</span>
        </div>
        <div className="sourcing-topbar-actions">
          <a href="/admin/registration">상품 등록관리</a>
          <button type="button" onClick={startNew} disabled={busy}>소싱 리스트 추가</button>
        </div>
      </header>
      <main className="inventory-content sourcing-page">
        <section className="inventory-heading sourcing-heading">
          <div>
            <span className="inventory-eyebrow">SOURCING RESEARCH</span>
            <h1>상품보다 시장을 먼저 조사하세요</h1>
            <p>
              사실 데이터와 직접 확인한 리뷰를 기록해 소싱 판단의 재현성을 높입니다.
              체크리스트는 재고 소진, 검색 노출 또는 매출을 보장하지 않습니다.
            </p>
          </div>
        </section>
        {message && <div className="sourcing-callout success">{message}</div>}
        {error && <div className="sourcing-callout error">{error}</div>}
        <div className="sourcing-workspace">
          <aside className="sourcing-list">
            <div className="sourcing-list-head">
              <strong>소싱 목록</strong>
              <span>{items.length}개</span>
            </div>
            {items.length ? items.map((item) => (
              <button
                type="button"
                key={item.id}
                className={!creating && detail?.id === item.id ? "active" : undefined}
                onClick={() => selectItem(item.id)}
                disabled={busy}
              >
                <strong>{item.sourcingKeyword || "새 소싱 아이템"}</strong>
                <span>{statusLabels[item.status]}</span>
                <small>
                  검색 {formatNumber(item.monthlySearchVolume)} · 6개월 {formatEok(item.sixMonthRevenue)}
                </small>
              </button>
            )) : (
              <div className="sourcing-list-empty">첫 소싱 키워드를 기록해 보세요.</div>
            )}
          </aside>

          <div className="sourcing-editor">
            <div className="sourcing-editor-bar">
              <div>
                <strong>{draft.sourcingKeyword || "새 소싱 아이템"}</strong>
                <span>각 항목은 직접 확인한 값만 입력하세요.</span>
              </div>
              <label>
                <span>진행 상태</span>
                <select
                  value={draft.status}
                  onChange={(event) => setField("status", event.target.value as SourcingResearchStatus)}
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>

            <ResearchSection number="01" title="키워드 시장 조사" description="온라인에서 실제로 진입할 키워드 시장의 크기를 기록합니다.">
              <div className="sourcing-grid three">
                <Field label="소싱하고 싶은 키워드" required>
                  <input value={draft.sourcingKeyword} onChange={(event) => setField("sourcingKeyword", event.target.value)} placeholder="예: 욕실 선반" />
                </Field>
                <Field label="월간 검색수" help="10,000 이상은 선호 기준으로 표시합니다.">
                  <NumberInput value={draft.monthlySearchVolume} onChange={(value) => setField("monthlySearchVolume", value)} placeholder="10000" />
                  <PreferenceBadge met={(draft.monthlySearchVolume ?? 0) >= 10_000} metText="선호 검색수 충족" pendingText="선호 기준 10,000" />
                </Field>
                <Field label="최근 6개월 매출" help="억원 단위로 입력합니다. 실제 확인값만 기록하세요.">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={draft.sixMonthRevenue == null ? "" : draft.sixMonthRevenue / 100_000_000}
                    onChange={(event) => setField("sixMonthRevenue", event.target.value === "" ? null : Math.round(Number(event.target.value) * 100_000_000))}
                    placeholder="1.0"
                  />
                  <PreferenceBadge met={(draft.sixMonthRevenue ?? 0) >= 100_000_000} metText="선호 매출 충족" pendingText="선호 기준 1억원" />
                </Field>
                <Field label="시장 조사 메모" wide>
                  <textarea rows={4} value={draft.marketNotes} onChange={(event) => setField("marketNotes", event.target.value)} placeholder="데이터 출처, 조회일, 상위 상품 특징 등을 기록하세요." />
                </Field>
              </div>
            </ResearchSection>

            <ResearchSection number="02" title="연관 키워드 분류" description="아이템스카우트 엑셀에서 키워드와 총 검색수만 가져온 뒤, 직접 검색한 결과에 따라 사용할 위치를 표시합니다.">
              <div className="sourcing-keyword-import">
                <div>
                  <strong>아이템스카우트 엑셀 가져오기</strong>
                  <span>같은 키워드를 다시 가져오면 기존 분류를 유지하고 검색량을 새 값으로 바꿉니다.</span>
                </div>
                <label className="sourcing-file-button">
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={importItemScoutKeywords}
                    disabled={importingKeywords}
                  />
                  {importingKeywords ? "엑셀 읽는 중…" : "엑셀 파일 선택"}
                </label>
              </div>

              {draft.relatedKeywords.length ? (
                <>
                  <div className="sourcing-keyword-summary" aria-label="키워드 분류 현황">
                    <button type="button" className={keywordPlacementFilter === "all" ? "active" : undefined} onClick={() => setKeywordPlacementFilter("all")}>전체 <strong>{draft.relatedKeywords.length}</strong></button>
                    {(Object.keys(keywordPlacementLabels) as SourcingKeywordPlacement[]).map((placement) => (
                      <button type="button" key={placement} className={keywordPlacementFilter === placement ? `active ${placement}` : placement} onClick={() => setKeywordPlacementFilter(placement)}>
                        {keywordPlacementLabels[placement]} <strong>{keywordCounts[placement]}</strong>
                      </button>
                    ))}
                  </div>
                  <div className="sourcing-keyword-tools">
                    <input value={keywordQuery} onChange={(event) => setKeywordQuery(event.target.value)} placeholder="키워드 검색" aria-label="가져온 키워드 검색" />
                    <span>표시 중 {visibleRelatedKeywords.length}개</span>
                    <button type="button" onClick={() => setDraft((current) => ({ ...current, relatedKeywords: current.relatedKeywords.map((item) => ({ ...item, placement: "unclassified" })) }))}>분류 초기화</button>
                  </div>
                  <div className="sourcing-keyword-volume-filters" aria-label="검색수 필터">
                    {(Object.entries(keywordVolumeFilterLabels) as Array<[KeywordVolumeFilter, string]>).map(([value, label]) => (
                      <button type="button" key={value} className={keywordVolumeFilter === value ? "active" : undefined} onClick={() => setKeywordVolumeFilter(value)}>{label}</button>
                    ))}
                    <button type="button" className="sort" onClick={() => setKeywordVolumeSort((current) => current === "desc" ? "asc" : "desc")}>
                      검색수 {keywordVolumeSort === "desc" ? "높은순 ↓" : "낮은순 ↑"}
                    </button>
                  </div>
                  <div className="sourcing-keyword-table-wrap">
                    <table className="sourcing-keyword-table">
                      <thead><tr><th>키워드</th><th>총 검색수</th><th>직접 분류</th></tr></thead>
                      <tbody>
                        {visibleRelatedKeywords.map((item) => (
                          <tr key={item.id}>
                            <td>{item.keyword}</td>
                            <td>{formatNumber(item.monthlySearchVolume)}</td>
                            <td>
                              <div className="keyword-placement-buttons" role="group" aria-label={`${item.keyword} 사용 위치`}>
                                {(Object.entries(keywordPlacementLabels) as Array<[SourcingKeywordPlacement, string]>).filter(([value]) => value !== "unclassified").map(([value, label]) => (
                                  <button
                                    type="button"
                                    key={value}
                                    className={item.placement === value ? `active ${value}` : value}
                                    aria-pressed={item.placement === value}
                                    onClick={() => updateKeywordPlacement(item.id, item.placement === value ? "unclassified" : value)}
                                  >
                                    {label.replace(" 키워드", "")}
                                  </button>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="sourcing-keyword-empty">엑셀을 올리면 키워드와 총 검색수가 여기에 표시됩니다.</div>
              )}
            </ResearchSection>

            <ResearchSection number="03" title="품목 조사" description="가격 구조와 진입 위험을 확인하고, 어떤 제품을 찾아야 하는지 기준을 세웁니다.">
              <div className="sourcing-grid four sourcing-price-grid">
                <Field label="쿠팡 평균단가"><MoneyInput value={draft.coupangAveragePrice} onChange={(value) => setField("coupangAveragePrice", value)} /></Field>
                <Field label="네이버 평균단가"><MoneyInput value={draft.naverAveragePrice} onChange={(value) => setField("naverAveragePrice", value)} /></Field>
                <Field label="내 예상 판매단가"><MoneyInput value={draft.expectedSellingPrice} onChange={(value) => setField("expectedSellingPrice", value)} /></Field>
                <Field label="최대 구매단가 (마진 30%)" help="판매가의 70% 단순 계산값입니다.">
                  <div className="sourcing-calculated-price">{formatWon(maximumPurchasePrice)}</div>
                </Field>
              </div>
              <div className="sourcing-margin-warning">
                실제 최대 매입가는 수수료·배송비·관부가세·포장비·반품비를 뺀 뒤 다시 계산해야 합니다.
              </div>
              <div className="sourcing-signal-grid">
                {signalQuestions.map(({ key, ...question }) => (
                  <SignalQuestion
                    key={key}
                    {...question}
                    value={draft.signals[key]}
                    onChange={(value) => setDraft((current) => ({ ...current, signals: { ...current.signals, [key]: value } }))}
                  />
                ))}
              </div>
            </ResearchSection>

            <ResearchSection number="04" title="상품 리뷰 조사" description="상세페이지보다 낮은 평점과 반복되는 불만을 먼저 읽고 개선 조건을 정리합니다.">
              <div className="sourcing-review-analyzer">
                <div className="sourcing-review-analyzer-head">
                  <div>
                    <strong>경쟁 상품 리뷰 가져오기</strong>
                    <span>리뷰 원문은 브라우저에서만 처리하며 서버에 그대로 저장하지 않습니다.</span>
                  </div>
                  <label className="sourcing-file-button">
                    <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importReviewFile} disabled={reviewImporting} />
                    {reviewImporting ? "리뷰 읽는 중…" : "리뷰 파일 선택"}
                  </label>
                </div>
                <textarea
                  rows={8}
                  value={reviewRawText}
                  onChange={(event) => { setReviewRawText(event.target.value); setReviewAnalysis(null); }}
                  placeholder={"리뷰를 한 줄에 하나씩 붙여넣으세요. 별점이 있으면 ‘1점 접착력이 약해요’처럼 입력할 수 있습니다.\n\n여러 줄 리뷰는 빈 줄로 구분하세요."}
                  aria-label="분석할 리뷰 원문"
                />
                <div className="sourcing-review-actions">
                  <span>{reviewFileEntries.length ? `파일 리뷰 ${reviewFileEntries.length}개 준비됨` : "CSV/XLSX의 리뷰 내용·평점 열을 자동으로 찾습니다."}</span>
                  <button type="button" onClick={runReviewAnalysis} disabled={!reviewRawText.trim() && !reviewFileEntries.length}>규칙 기반 리뷰 분석</button>
                </div>
                {reviewAnalysis && (
                  <div className="sourcing-review-result">
                    <div className="sourcing-review-stats">
                      <span>전체 <strong>{reviewAnalysis.totalCount}</strong></span>
                      <span className="positive">장점 <strong>{reviewAnalysis.positiveCount}</strong></span>
                      <span className="negative">단점 <strong>{reviewAnalysis.negativeCount}</strong></span>
                      <span>중립·판단 필요 <strong>{reviewAnalysis.neutralCount}</strong></span>
                    </div>
                    <div className="sourcing-review-result-grid">
                      <ReviewTermSummary title="장점 반복 표현" terms={reviewAnalysis.positiveTerms} />
                      <ReviewTermSummary title="단점 반복 표현" terms={reviewAnalysis.negativeTerms} />
                    </div>
                    <p>별점이 있으면 4~5점은 장점, 1~3점은 단점으로 우선 분류합니다. 별점이 없으면 제한된 감성 사전으로 분류하므로 반드시 원문을 함께 확인하세요.</p>
                    <button type="button" onClick={applyReviewAnalysis}>분석 결과를 아래 항목에 반영</button>
                  </div>
                )}
              </div>
              <div className="sourcing-grid two">
                <Field label="최종 소구 포인트" wide help="가져올 제품이 반드시 해결해야 할 핵심 조건을 우선순위로 적습니다.">
                  <textarea rows={5} value={draft.finalSellingPoint} onChange={(event) => setField("finalSellingPoint", event.target.value)} placeholder="예: 무타공이면서 장기간 떨어지지 않고 설치가 쉬워야 한다." />
                </Field>
                <Field label="장점 리뷰"><textarea rows={7} value={draft.positiveReviews} onChange={(event) => setField("positiveReviews", event.target.value)} placeholder="반복되는 만족 요소와 표현" /></Field>
                <Field label="단점 리뷰"><textarea rows={7} value={draft.negativeReviews} onChange={(event) => setField("negativeReviews", event.target.value)} placeholder="1~3점 리뷰에서 반복되는 불편" /></Field>
                <Field label="고객 니즈 파악"><textarea rows={6} value={draft.customerNeeds} onChange={(event) => setField("customerNeeds", event.target.value)} placeholder="구매 이유, 해결하려는 문제, 선택 기준" /></Field>
                <Field label="제품 제원"><textarea rows={6} value={draft.productSpecs} onChange={(event) => setField("productSpecs", event.target.value)} placeholder="소재, 크기, 하중, 구성, 설치 방식 등" /></Field>
                <Field label="주요 타겟"><textarea rows={5} value={draft.primaryTarget} onChange={(event) => setField("primaryTarget", event.target.value)} placeholder="사용자, 사용 장소, 구매 상황" /></Field>
                <Field label="기타 참고 내용"><textarea rows={5} value={draft.referenceNotes} onChange={(event) => setField("referenceNotes", event.target.value)} placeholder="경쟁 상품 링크, 인증, 포장, 물류 참고사항" /></Field>
              </div>
            </ResearchSection>

            <ResearchSection number="05" title="샘플 확인" description="1688 후보를 비교하고 국내 시장에서 찾은 소구 조건을 충족하는지 기록합니다.">
              <div className="sourcing-samples">
                {draft.samples.map((sample, index) => (
                  <SampleEditor key={sample.id} sample={sample} index={index} onChange={(next) => updateSample(index, next)} onRemove={() => removeSample(index)} />
                ))}
                <button type="button" className="sourcing-add-sample" onClick={addSample} disabled={draft.samples.length >= 10}>+ 1688 샘플 후보 추가</button>
              </div>
            </ResearchSection>

            <ResearchSection number="06" title="상품 등록 초안" description="직접 분류한 검색수 1,000 이하 키워드만 사용해 상품명과 검색 태그 초안을 준비합니다.">
              <div className="sourcing-registration-rule">
                <strong>카테고리 키워드는 상품명에 절대 포함하지 않습니다.</strong>
                <span>속성 키워드는 네이버 공식 속성값을 확인한 뒤 상품 편집 화면에서 선택합니다.</span>
              </div>
              <button
                type="button"
                className="sourcing-prepare-registration"
                onClick={prepareRegistration}
                disabled={!draft.relatedKeywords.length}
              >
                등록 초안 만들기
              </button>
              {registrationPrepared && (
                <div className="sourcing-registration-draft">
                  <Field label="판매용 상품명 초안" help={`${registrationTitle.length}/200자 · 최종 등록 전에 직접 확인하세요.`}>
                    <input
                      value={registrationTitle}
                      maxLength={200}
                      onChange={(event) => setRegistrationTitle(event.target.value)}
                      placeholder="상품명 키워드를 먼저 분류해 주세요."
                    />
                  </Field>
                  <div className="sourcing-registration-group">
                    <strong>검색 태그 자동 반영</strong>
                    <div className="sourcing-registration-chips">
                      {registrationTags.length ? registrationTags.map((tag) => (
                        <button type="button" key={tag} onClick={() => setRegistrationTags((current) => current.filter((item) => item !== tag))}>
                          {tag} ×
                        </button>
                      )) : <span>검색수 1,000 이하로 분류된 태그 키워드가 없습니다.</span>}
                    </div>
                  </div>
                  <KeywordReviewGroup title="네이버 속성 확인 목록" keywords={registrationDraft.attributeKeywords} empty="분류된 속성 키워드가 없습니다." />
                  <KeywordReviewGroup title="카테고리 선택 참고 목록 (상품명 제외)" keywords={registrationDraft.categoryKeywords} empty="분류된 카테고리 키워드가 없습니다." />
                  {registrationDraft.warnings.length > 0 && (
                    <ul className="sourcing-registration-warnings">
                      {registrationDraft.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  )}
                  <div className="sourcing-product-apply">
                    <div className="sourcing-product-search">
                      <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="상품명 또는 공급사 원본명 검색" />
                      <button type="button" onClick={() => loadProductOptions()} disabled={busy}>상품 찾기</button>
                    </div>
                    <label>
                      <span>반영할 등록 상품</span>
                      <select value={targetProductId} onChange={(event) => setTargetProductId(event.target.value)}>
                        <option value="">상품을 선택하세요</option>
                        {productOptions.map((product) => (
                          <option value={product.id} key={product.id}>
                            {product.title || product.originalName || product.id} · {product.status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" onClick={applyRegistrationToProduct} disabled={busy || !targetProductId || !registrationTitle.trim()}>
                      {busy ? "반영 중…" : "상품 초안에 반영"}
                    </button>
                    {appliedProductId && <a href={`/admin/products/${appliedProductId}/edit`}>상품 편집 화면 열기 →</a>}
                  </div>
                </div>
              )}
            </ResearchSection>

            <div className="sourcing-final-note">
              <strong>최종 판단은 직접 하세요.</strong>
              <span>검색수·매출·체크리스트는 참고 자료이며 재고 소진, 노출 순위 또는 판매 성과를 보장하지 않습니다.</span>
            </div>
            <div className="sourcing-save-bar">
              <span>{maximumPurchasePrice == null ? "예상 판매가를 입력하면 최대 구매단가를 계산합니다." : `단순 최대 구매단가 ${formatWon(maximumPurchasePrice)}`}</span>
              <div className="sourcing-save-actions">
                <button type="button" className="secondary" onClick={() => save(true)} disabled={busy}>{busy ? "저장 중…" : "임시저장"}</button>
                <button type="button" onClick={() => save(false)} disabled={busy || !draft.sourcingKeyword.trim()}>{busy ? "저장 중…" : "소싱 아이템 저장"}</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );

  function setField<K extends keyof SourcingResearchInput>(key: K, value: SourcingResearchInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function addSample() {
    setDraft((current) => ({ ...current, samples: [...current.samples, { id: crypto.randomUUID(), url: "", price: null, features: "" }] }));
  }
  function updateSample(index: number, sample: SourcingSample) {
    setDraft((current) => ({ ...current, samples: current.samples.map((item, itemIndex) => itemIndex === index ? sample : item) }));
  }
  function removeSample(index: number) {
    setDraft((current) => ({ ...current, samples: current.samples.filter((_, itemIndex) => itemIndex !== index) }));
  }
  function updateKeywordPlacement(id: string, placement: SourcingKeywordPlacement) {
    setDraft((current) => ({
      ...current,
      relatedKeywords: current.relatedKeywords.map((item) =>
        item.id === id ? { ...item, placement } : item,
      ),
    }));
  }
  function resetRegistrationPreparation() {
    setRegistrationPrepared(false);
    setRegistrationTitle("");
    setRegistrationTags([]);
    setTargetProductId("");
    setProductSearch("");
    setAppliedProductId(null);
    setReviewRawText("");
    setReviewFileEntries([]);
    setReviewAnalysis(null);
  }
}

function ResearchSection({ number, title, description, children }: { number: string; title: string; description: string; children: ReactNode }) {
  return <section className="sourcing-section"><div className="sourcing-section-head"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></div>{children}</section>;
}

function Field({ label, help, required, wide, children }: { label: string; help?: string; required?: boolean; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? "wide" : undefined}><span>{label}{required ? " *" : ""}</span>{children}{help && <small>{help}</small>}</label>;
}

function KeywordReviewGroup({ title, keywords, empty }: { title: string; keywords: string[]; empty: string }) {
  return <div className="sourcing-registration-group"><strong>{title}</strong><div className="sourcing-registration-chips read-only">{keywords.length ? keywords.map((keyword) => <span key={keyword}>{keyword}</span>) : <span>{empty}</span>}</div></div>;
}

function ReviewTermSummary({ title, terms }: { title: string; terms: Array<{ term: string; count: number }> }) {
  return <div><strong>{title}</strong><div>{terms.length ? terms.map(({ term, count }) => <span key={term}>{term} <b>{count}</b></span>) : <small>반복 표현을 찾지 못했습니다.</small>}</div></div>;
}

function NumberInput({ value, onChange, placeholder }: { value: number | null; onChange: (value: number | null) => void; placeholder?: string }) {
  return <input type="number" min="0" step="1" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} placeholder={placeholder} />;
}
function MoneyInput({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return <div className="sourcing-money-input"><NumberInput value={value} onChange={onChange} placeholder="0" /><span>원</span></div>;
}
function PreferenceBadge({ met, metText, pendingText }: { met: boolean; metText: string; pendingText: string }) {
  return <span className={`sourcing-preference ${met ? "met" : "pending"}`}>{met ? metText : pendingText}</span>;
}

function SignalQuestion({ label, description, preferred, value, onChange }: { label: string; description: string; preferred: "yes" | "no"; value: SourcingResearchSignal; onChange: (value: SourcingResearchSignal) => void }) {
  const favorable = value !== "unknown" && value === preferred;
  return <div className="sourcing-signal"><div className="sourcing-signal-copy"><strong>{label}</strong><p>{description}</p></div><div className="sourcing-signal-actions" role="group" aria-label={label}>{(["yes", "no", "unknown"] as const).map((option) => <button type="button" key={option} className={value === option ? "active" : undefined} onClick={() => onChange(option)}>{option === "yes" ? "예" : option === "no" ? "아니오" : "미확인"}</button>)}</div><span className={`sourcing-signal-result ${value === "unknown" ? "unknown" : favorable ? "favorable" : "caution"}`}>{value === "unknown" ? "확인 필요" : favorable ? "선호 조건" : "주의 조건"}</span></div>;
}

function SampleEditor({ sample, index, onChange, onRemove }: { sample: SourcingSample; index: number; onChange: (sample: SourcingSample) => void; onRemove: () => void }) {
  return <article className="sourcing-sample"><div className="sourcing-sample-head"><strong>샘플 후보 {index + 1}</strong><button type="button" onClick={onRemove}>삭제</button></div><div className="sourcing-grid two"><Field label="1688 링크"><input type="url" value={sample.url} onChange={(event) => onChange({ ...sample, url: event.target.value })} placeholder="https://detail.1688.com/..." /></Field><Field label="1688 가격"><MoneyInput value={sample.price} onChange={(price) => onChange({ ...sample, price })} /></Field><Field label="제품 특징" wide><textarea rows={4} value={sample.features} onChange={(event) => onChange({ ...sample, features: event.target.value })} placeholder="소재, 크기, MOQ, 국내 제품과 다른 점, 확인할 사항" /></Field></div></article>;
}

function emptyResearch(): SourcingResearchInput {
  return { status: "researching", sourcingKeyword: "", monthlySearchVolume: null, sixMonthRevenue: null, marketNotes: "", coupangAveragePrice: null, naverAveragePrice: null, expectedSellingPrice: null, signals: { ...defaultSourcingSignals }, finalSellingPoint: "", positiveReviews: "", negativeReviews: "", customerNeeds: "", productSpecs: "", primaryTarget: "", referenceNotes: "", relatedKeywords: [], samples: [] };
}
function recordToInput(record: SourcingResearchRecord): SourcingResearchInput {
  return {
    status: record.status,
    sourcingKeyword: record.sourcingKeyword,
    monthlySearchVolume: record.monthlySearchVolume,
    sixMonthRevenue: record.sixMonthRevenue,
    marketNotes: record.marketNotes,
    coupangAveragePrice: record.coupangAveragePrice,
    naverAveragePrice: record.naverAveragePrice,
    expectedSellingPrice: record.expectedSellingPrice,
    signals: record.signals,
    finalSellingPoint: record.finalSellingPoint,
    positiveReviews: record.positiveReviews,
    negativeReviews: record.negativeReviews,
    customerNeeds: record.customerNeeds,
    productSpecs: record.productSpecs,
    primaryTarget: record.primaryTarget,
    referenceNotes: record.referenceNotes,
    relatedKeywords: record.relatedKeywords ?? [],
    samples: record.samples,
  };
}
function formatNumber(value: number | null) { return value == null ? "미입력" : new Intl.NumberFormat("ko-KR").format(value); }
function formatEok(value: number | null) { return value == null ? "미입력" : `${(value / 100_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`; }
function formatWon(value: number | null) { return value == null ? "미계산" : `${new Intl.NumberFormat("ko-KR").format(value)}원`; }

async function api<T, I = never>(url: string, init?: RequestInit): Promise<{ data?: T; items?: I }> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json() as { data?: T; items?: I; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "요청을 처리하지 못했습니다.");
  return body;
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "요청을 처리하지 못했습니다."; }

const generatedReviewMarker = "[규칙 기반 리뷰 분석]";
function replaceGeneratedReviewSection(current: string, generated: string) {
  const manual = current.split(generatedReviewMarker)[0]!.trim();
  const section = generated.trim() ? `${generatedReviewMarker}\n${generated.trim()}` : "";
  return [manual, section].filter(Boolean).join("\n\n");
}
