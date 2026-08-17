"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  mergeImportedKeywords,
  parseItemScoutWorkbook,
  parseManualRelatedKeywords,
} from "@/modules/sourcing/itemscout-import";
import {
  analyzeReviews,
  formatReviewEvidence,
  parsePastedReviews,
  parseReviewFile,
  type SourcingReviewAnalysis,
} from "@/modules/sourcing/review-analysis";
import {
  defaultSourcingSignals,
  type SourcingKeywordPlacement,
  type SourcingNaverCategory,
  type SourcingRelatedKeyword,
  type SourcingResearchInput,
  type SourcingResearchRecord,
  type SourcingResearchSignal,
  type SourcingResearchSignals,
  type SourcingResearchStatus,
  type SourcingReviewInput,
} from "@/modules/sourcing/types";
import {
  DEFAULT_TITLE_EXPOSURE_THRESHOLD_PERCENT,
  allocateAutomaticKeywordPlacements,
  assessKeywordContext,
  keywordPlacementReviewReason,
  recommendKeywordPlacement,
  selectAutomaticTitleKeywordIds,
  type KeywordExposureResult,
  type NaverTagDictionaryResult,
  type AutomaticKeywordPlacementAllocation,
  type AutomaticKeywordPlacementInput,
} from "@/modules/sourcing/keyword-exposure";
import {
  matchOfficialAttributeKeyword,
  type OfficialAttributeContext,
} from "@/modules/sourcing/official-keyword-metadata";
import { downloadSourcingKeywordWorkbook } from "@/modules/sourcing/keyword-export";

const KEYWORD_EXPOSURE_REQUEST_EVENT = "shoppingday:keyword-exposure-request";
const KEYWORD_EXPOSURE_RESULT_EVENT = "shoppingday:keyword-exposure-result";
const SMARTSTORE_REVIEW_REQUEST_EVENT = "shoppingday:smartstore-review-request";
const SMARTSTORE_REVIEW_RESULT_EVENT = "shoppingday:smartstore-review-result";
const EXTENSION_STATUS_EVENT = "shoppingday:rank-extension-status";
const EXTENSION_PING_EVENT = "shoppingday:rank-extension-ping";

type ListItem = Pick<
  SourcingResearchRecord,
  | "id"
  | "status"
  | "sourcingKeyword"
  | "monthlySearchVolume"
  | "sixMonthRevenue"
  | "maximumPurchasePrice"
  | "registrationProductId"
  | "createdAt"
  | "updatedAt"
>;

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
type KeywordQualityFilter = "all" | "category_review";

type SmartstoreReviewImportResult = {
  status: "completed" | "failed";
  sourceUrl: string;
  productName: string;
  reviews: Array<{ content: string; rating: number | null }>;
  observedAt: string;
  message?: string;
};

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
  const [exportingKeywords, setExportingKeywords] = useState(false);
  const [manualKeywordText, setManualKeywordText] = useState("");
  const [keywordQuery, setKeywordQuery] = useState("");
  const [keywordExclusionText, setKeywordExclusionText] = useState("");
  const [naverCategorySearch, setNaverCategorySearch] = useState("");
  const [naverCategoryResults, setNaverCategoryResults] = useState<
    SourcingNaverCategory[]
  >([]);
  const [naverCategoryStatus, setNaverCategoryStatus] = useState("");
  const [naverCategoryBusy, setNaverCategoryBusy] = useState(false);
  const [keywordPlacementFilter, setKeywordPlacementFilter] =
    useState<SourcingKeywordPlacement | "all">("all");
  const [keywordVolumeFilter, setKeywordVolumeFilter] =
    useState<KeywordVolumeFilter>("all");
  const [keywordVolumeSort, setKeywordVolumeSort] = useState<"desc" | "asc">("desc");
  const [keywordQualityFilter, setKeywordQualityFilter] =
    useState<KeywordQualityFilter>("all");
  const [keywordExposureResults, setKeywordExposureResults] = useState<
    Record<string, KeywordExposureResult>
  >(() => keywordExposureResultsFrom(initialDetail?.relatedKeywords ?? []));
  const [keywordTagDictionaryResults, setKeywordTagDictionaryResults] = useState<
    Record<string, NaverTagDictionaryResult>
  >(() => keywordTagDictionaryResultsFrom(initialDetail?.relatedKeywords ?? []));
  const [keywordOfficialAttributeStatuses, setKeywordOfficialAttributeStatuses] =
    useState<Record<string, "matched" | "unmatched" | "unavailable">>(() =>
      keywordOfficialAttributeStatusesFrom(initialDetail?.relatedKeywords ?? []),
    );
  const keywordTagDictionaryCacheRef = useRef(
    new Map<string, NaverTagDictionaryResult>(),
  );
  const officialAttributeContextCacheRef = useRef(
    new Map<string, Promise<OfficialAttributeContext | null>>(),
  );
  const [keywordExposureRunning, setKeywordExposureRunning] = useState(false);
  const [keywordExposureProgress, setKeywordExposureProgress] = useState("");
  const keywordExposureCancelRef = useRef(false);
  const [titleExposureThreshold, setTitleExposureThreshold] = useState(
    () =>
      initialDetail?.relatedKeywords.find((item) => item.analysis)?.analysis
        ?.titleExposureThresholdPercent ??
      DEFAULT_TITLE_EXPOSURE_THRESHOLD_PERCENT,
  );
  const [extensionAvailable, setExtensionAvailable] = useState<boolean | null>(null);
  const [sourcingListOpen, setSourcingListOpen] = useState(false);
  const [reviewRawText, setReviewRawText] = useState("");
  const [reviewProductUrl, setReviewProductUrl] = useState("");
  const [reviewListExpanded, setReviewListExpanded] = useState(true);
  const [reviewAnalysis, setReviewAnalysis] = useState<SourcingReviewAnalysis | null>(null);
  const [reviewImporting, setReviewImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const keywordWorkflowSummary = useMemo(() => ({
    titleCandidates: selectAutomaticTitleKeywordIds(
      draft.relatedKeywords.filter((item) => item.placement === "product_name"),
    ).length,
    officialTags: draft.relatedKeywords.filter(
      (item) =>
        Boolean(item.officialTag) &&
        (item.placement === "product_name" || item.placement === "tag"),
    ).length,
    officialAttributes: draft.relatedKeywords.filter(
      (item) => item.placement === "attribute" && item.officialAttribute,
    ).length,
  }), [draft.relatedKeywords]);

  const itemScoutKeywordCount = useMemo(
    () => draft.relatedKeywords.filter((item) => item.source === "itemscout-xlsx").length,
    [draft.relatedKeywords],
  );

  const excludedKeywordCount = useMemo(() => {
    const exclusion = normalizeKeywordText(keywordExclusionText);
    if (!exclusion) return 0;
    return draft.relatedKeywords.filter((item) =>
      normalizeKeywordText(item.keyword).includes(exclusion),
    ).length;
  }, [draft.relatedKeywords, keywordExclusionText]);

  const categoryReviewKeywordCount = useMemo(
    () => draft.relatedKeywords.filter((item) => {
      const exposure = keywordExposureResults[item.id];
      return shouldReviewKeywordDeletion(item, exposure);
    }).length,
    [draft.relatedKeywords, keywordExposureResults],
  );

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
          (keywordQualityFilter === "all" ||
            shouldReviewKeywordDeletion(item, keywordExposureResults[item.id])) &&
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
  }, [draft.relatedKeywords, keywordExposureResults, keywordPlacementFilter, keywordQualityFilter, keywordQuery, keywordVolumeFilter, keywordVolumeSort]);

  useEffect(() => {
    if (!sourcingListOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSourcingListOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sourcingListOpen]);

  useEffect(() => {
    const handleStatus = (event: Event) => {
      const detail = (
        event as CustomEvent<{ available?: boolean; version?: string | null }>
      ).detail;
      setExtensionAvailable(
        detail?.available === true && isExtensionVersionSupported(detail.version),
      );
    };
    window.addEventListener(EXTENSION_STATUS_EVENT, handleStatus);
    window.dispatchEvent(new CustomEvent(EXTENSION_PING_EVENT));
    return () => window.removeEventListener(EXTENSION_STATUS_EVENT, handleStatus);
  }, []);

  useEffect(() => {
    const handleSmartstoreReviews = (event: Event) => {
      const result = (
        event as CustomEvent<{ requestId?: string; result?: SmartstoreReviewImportResult }>
      ).detail?.result;
      if (!result) return;
      if (result.status !== "completed") {
        setError(result.message ?? "스마트스토어 리뷰를 가져오지 못했습니다.");
        return;
      }
      setDraft((current) => ({
        ...current,
        reviewEntries: appendReviewEntries(
          current.reviewEntries,
          result.reviews.map((review) =>
            storedReview(review.content, review.rating, "smartstore"),
          ),
        ),
      }));
      setReviewListExpanded(true);
      setReviewAnalysis(null);
      setError(null);
      setMessage(
        `${result.productName || "스마트스토어 상품"}에서 현재 화면 리뷰 ${result.reviews.length}개를 받았습니다. 이미 가져온 리뷰는 자동으로 제외됩니다.`,
      );
    };
    window.addEventListener(SMARTSTORE_REVIEW_RESULT_EVENT, handleSmartstoreReviews);
    return () =>
      window.removeEventListener(SMARTSTORE_REVIEW_RESULT_EVENT, handleSmartstoreReviews);
  }, []);

  useEffect(() => {
    const search = naverCategorySearch.trim();
    if (!search) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setNaverCategoryStatus("카테고리 검색 중…");
      try {
        const response = await fetch(
          `/api/integrations/naver/categories?search=${encodeURIComponent(search)}&leafOnly=true&limit=20`,
          { signal: controller.signal, cache: "no-store" },
        );
        const body = (await response.json()) as {
          categories?: SourcingNaverCategory[];
          error?: { message?: string };
        };
        if (!response.ok) {
          throw new Error(body.error?.message ?? "카테고리를 검색하지 못했습니다.");
        }
        const categories = body.categories ?? [];
        setNaverCategoryResults(categories);
        setNaverCategoryStatus(categories.length ? "" : "검색 결과가 없습니다.");
      } catch (caught) {
        if (controller.signal.aborted) return;
        setNaverCategoryResults([]);
        setNaverCategoryStatus(errorMessage(caught));
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [naverCategorySearch]);

  async function analyzeKeywordExposure(
    targets: SourcingResearchInput["relatedKeywords"],
    options: { analyzeAll?: boolean; applyRecommendations?: boolean } = {},
  ) {
    if (keywordExposureRunning || targets.length === 0) return;
    if (!draft.sourcingKeyword.trim()) {
      setError("검색 의도를 비교할 기준 상품어를 먼저 입력해 주세요.");
      return;
    }
    if (!draft.naverCategory) {
      setError("연관키워드를 분류하기 전에 판매할 네이버 카테고리를 선택해 주세요.");
      return;
    }
    if (extensionAvailable !== true) {
      setError("Shoppingday Chrome 확장 프로그램 0.5.16 이상을 다시 로드해 주세요.");
      return;
    }
    const limitedTargets = options.analyzeAll ? targets : targets.slice(0, 10);
    keywordExposureCancelRef.current = false;
    setKeywordExposureRunning(true);
    setError(null);
    setMessage(null);
    let completedCount = 0;
    const automaticAnalyses: AutomaticKeywordPlacementInput[] = [];
    let automaticAllocation: AutomaticKeywordPlacementAllocation | null = null;
    const officialAttributeContextPromise =
      checkNaverOfficialAttributeContext(draft.naverCategory);
    try {
      for (let index = 0; index < limitedTargets.length; index += 1) {
        if (keywordExposureCancelRef.current) break;
        const target = limitedTargets[index]!;
        setKeywordExposureProgress(
          `${index + 1}/${limitedTargets.length} · ${target.keyword} 분석 중`,
        );
        const [result, tagDictionary, officialAttributeContext] = await Promise.all([
          requestKeywordExposure(
            target.keyword,
            draft.sourcingKeyword,
            draft.naverCategory,
          ),
          checkNaverTagDictionary(target.keyword),
          officialAttributeContextPromise,
        ]);
        const officialAttribute = officialAttributeContext
          ? matchOfficialAttributeKeyword(
              target.keyword,
              officialAttributeContext,
            )
          : null;
        setKeywordExposureResults((current) => ({
          ...current,
          [target.id]: result,
        }));
        setKeywordTagDictionaryResults((current) => ({
          ...current,
          [target.id]: tagDictionary,
        }));
        setKeywordOfficialAttributeStatuses((current) => ({
          ...current,
          [target.id]: officialAttributeContext
            ? officialAttribute
              ? "matched"
              : "unmatched"
            : "unavailable",
        }));
        if (result.status !== "completed") {
          throw new Error(
            result.message ?? `${target.keyword} 키워드 분석을 완료하지 못했습니다.`,
          );
        }
        const recommendation = recommendKeywordPlacement(
          result,
          titleExposureThreshold,
          tagDictionary,
          officialAttribute,
        );
        const contextAssessment = assessKeywordContext(result);
        const requiresReview = contextAssessment.mismatched;
        if (options.applyRecommendations && options.analyzeAll) {
          automaticAnalyses.push({
            item: target,
            recommendation,
            tagDictionary,
            officialAttribute,
            requiresReview,
          });
        }
        setDraft((current) => ({
          ...current,
          relatedKeywords: current.relatedKeywords.map((item) =>
            item.id === target.id
              ? {
                  ...item,
                  officialTag:
                    tagDictionary.status === "unavailable"
                      ? item.officialTag
                      : tagDictionary.exactTag,
                  ...(officialAttributeContext
                    ? { officialAttribute }
                    : {}),
                  analysis: {
                    exposure: result,
                    tagDictionary,
                    officialAttributeStatus: officialAttributeContext
                      ? officialAttribute
                        ? "matched"
                        : "unmatched"
                      : "unavailable",
                    recommendedPlacement:
                      recommendation?.placement ?? "unclassified",
                    recommendationReason:
                      recommendation?.reason ?? contextAssessment.reason,
                    requiresReview,
                    titleExposureThresholdPercent: titleExposureThreshold,
                    analyzedAt: result.observedAt,
                  },
                  ...(options.applyRecommendations && !options.analyzeAll &&
                  (recommendation || requiresReview)
                    ? {
                        placement:
                          recommendation?.placement ?? "unclassified",
                      }
                    : {}),
                }
              : item,
          ),
        }));
        completedCount += 1;
        if (index + 1 < limitedTargets.length) await wait(1_500);
      }
      if (options.applyRecommendations && options.analyzeAll) {
        automaticAllocation = allocateAutomaticKeywordPlacements(
          automaticAnalyses,
        );
        const placements = automaticAllocation.placements;
        setDraft((current) => ({
          ...current,
          relatedKeywords: current.relatedKeywords.map((item) =>
            placements[item.id]
              ? { ...item, placement: placements[item.id] }
              : item,
          ),
        }));
      }
      setMessage(keywordExposureCancelRef.current
        ? `${completedCount}개까지 분석한 뒤 전체 다시 분류를 중지했습니다. 완료된 분류와 상세 근거는 임시저장하면 다시 열어도 유지됩니다.`
        : options.applyRecommendations
          ? `${completedCount}개 키워드를 다시 분석하고 추천 분류를 초안에 반영했습니다. 상품명 후보 ${automaticAllocation?.productNameKeywordIds.length ?? 0}개 중 ${automaticAllocation?.titleKeywordIds.length ?? 0}개를 상품명 조합 대상으로 검토합니다. 공식 태그 풀은 ${automaticAllocation?.tagKeywordIds.length ?? 0}개이며 등록 초안에서 상품명에 쓰지 않은 태그를 검색수순 최대 10개 사용합니다. 임시저장하면 상세 분석 근거도 함께 보존됩니다.`
          : `${completedCount}개 키워드의 네이버쇼핑 1페이지 노출 분석을 마쳤습니다. 추천을 확인해 적용하고 임시저장하면 상세 분석 근거도 함께 보존됩니다.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setKeywordExposureRunning(false);
      setKeywordExposureProgress("");
    }
  }

  async function checkNaverTagDictionary(keyword: string) {
    const key = normalizeKeywordText(keyword);
    const cached = keywordTagDictionaryCacheRef.current.get(key);
    if (cached) return cached;
    let result: NaverTagDictionaryResult;
    try {
      const response = await api<{
        keyword: string;
        registered: boolean;
        exactTag: { code: number; text: string } | null;
        candidates: Array<{ code: number; text: string }>;
      }>(
        `/api/integrations/naver/recommend-tags?keyword=${encodeURIComponent(keyword)}`,
      );
      const data = response.data!;
      result = {
        keyword: data.keyword,
        status: data.registered ? "registered" : "unregistered",
        exactTag: data.exactTag,
        candidates: data.candidates,
        message: null,
      };
    } catch (caught) {
      result = {
        keyword,
        status: "unavailable",
        exactTag: null,
        candidates: [],
        message: errorMessage(caught),
      };
    }
    keywordTagDictionaryCacheRef.current.set(key, result);
    return result;
  }

  function checkNaverOfficialAttributeContext(category: SourcingNaverCategory) {
    const key = category.id;
    const cached = officialAttributeContextCacheRef.current.get(key);
    if (cached) return cached;
    const pending = loadNaverOfficialAttributeContext(category).catch(
      () => null,
    );
    officialAttributeContextCacheRef.current.set(key, pending);
    return pending;
  }

  async function recommendSourcingNaverCategory() {
    const keyword = draft.sourcingKeyword.trim();
    if (keyword.length < 2) {
      setNaverCategoryStatus("기준 상품어를 두 글자 이상 입력해 주세요.");
      return;
    }
    setNaverCategoryBusy(true);
    setNaverCategoryStatus("기준 상품어로 카테고리를 찾는 중…");
    try {
      const response = await fetch(
        `/api/integrations/naver/categories/recommend?productName=${encodeURIComponent(keyword)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as {
        recommendation?: { category: SourcingNaverCategory } | null;
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(body.error?.message ?? "카테고리를 추천하지 못했습니다.");
      }
      if (!body.recommendation?.category) {
        setNaverCategoryStatus("자동 추천 결과가 없습니다. 카테고리를 직접 검색해 주세요.");
        return;
      }
      selectSourcingNaverCategory(body.recommendation.category);
      setNaverCategoryStatus("추천 카테고리를 선택했습니다. 실제 판매 카테고리가 맞는지 확인해 주세요.");
    } catch (caught) {
      setNaverCategoryStatus(errorMessage(caught));
    } finally {
      setNaverCategoryBusy(false);
    }
  }

  function selectSourcingNaverCategory(category: SourcingNaverCategory) {
    setDraft((current) => ({
      ...current,
      naverCategory: category,
      relatedKeywords: current.relatedKeywords.map((item) => ({
        ...item,
        analysis: null,
        ...(item.officialAttribute
          ? { officialAttribute: null, placement: "unclassified" as const }
          : {}),
      })),
    }));
    setNaverCategorySearch("");
    setNaverCategoryResults([]);
    setKeywordExposureResults({});
    setKeywordOfficialAttributeStatuses({});
    setKeywordQualityFilter("all");
    officialAttributeContextCacheRef.current.clear();
  }

  async function selectItem(id: string) {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await api<SourcingResearchRecord>(`/api/sourcing-researches/${id}`);
      setDetail(response.data!);
      setDraft(recordToInput(response.data!));
      setCreating(false);
      setSourcingListOpen(false);
      resetEditorTransientState(response.data!);
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
      resetEditorTransientState(response.data!);
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
        `${imported.sourceRowCount}행에서 키워드 ${imported.keywords.length}개를 누적 목록에 반영했습니다. 파일 내부 중복 ${imported.duplicateCount}개는 합쳤습니다.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      input.value = "";
      setImportingKeywords(false);
    }
  }

  function addManualKeywords() {
    const parsed = parseManualRelatedKeywords(manualKeywordText);
    if (!parsed.keywords.length) {
      setError("추가할 연관키워드를 한 줄에 하나씩 입력해 주세요.");
      return;
    }
    setDraft((current) => ({
      ...current,
      relatedKeywords: mergeImportedKeywords(
        current.relatedKeywords,
        parsed.keywords,
      ),
    }));
    setManualKeywordText("");
    setKeywordPlacementFilter("all");
    setKeywordQuery("");
    setError(null);
    setMessage(
      `직접 입력한 키워드 ${parsed.keywords.length}개를 누적 목록에 반영했습니다.`,
    );
  }

  function clearItemScoutKeywords() {
    if (!itemScoutKeywordCount) return;
    if (
      !window.confirm(
        `엑셀에서 가져온 연관키워드 ${itemScoutKeywordCount}개를 삭제할까요? 직접 추가한 키워드는 유지됩니다.`,
      )
    ) {
      return;
    }

    setDraft((current) => ({
      ...current,
      relatedKeywords: current.relatedKeywords.filter(
        (item) => item.source !== "itemscout-xlsx",
      ),
    }));
    setKeywordPlacementFilter("all");
    setKeywordVolumeFilter("all");
    setKeywordQuery("");
    setError(null);
    setMessage(
      `엑셀에서 가져온 연관키워드 ${itemScoutKeywordCount}개를 삭제했습니다. 변경사항을 저장하려면 임시저장 또는 저장을 눌러 주세요.`,
    );
  }

  function removeRelatedKeyword(id: string) {
    setDraft((current) => ({
      ...current,
      relatedKeywords: current.relatedKeywords.filter((item) => item.id !== id),
    }));
  }

  function removeKeywordsContainingText() {
    const exclusion = normalizeKeywordText(keywordExclusionText);
    const label = keywordExclusionText.trim();
    if (!exclusion || !excludedKeywordCount) return;
    if (
      !window.confirm(
        `'${label}'이(가) 포함된 연관키워드 ${excludedKeywordCount}개를 삭제할까요?`,
      )
    ) {
      return;
    }

    setDraft((current) => ({
      ...current,
      relatedKeywords: current.relatedKeywords.filter(
        (item) => !normalizeKeywordText(item.keyword).includes(exclusion),
      ),
    }));
    setKeywordExclusionText("");
    setError(null);
    setMessage(
      `'${label}'이(가) 포함된 연관키워드 ${excludedKeywordCount}개를 삭제했습니다. 변경사항을 저장하려면 임시저장 또는 저장을 눌러 주세요.`,
    );
  }

  async function saveAndCreateRegistration() {
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
      const registration = await api<{ productId: string; alreadyExists: boolean }>(
        `/api/sourcing-researches/${savedResearch.id}/registration-product`,
        {
        method: "POST",
        },
      );
      const refreshed = await api<SourcingResearchRecord>(
        `/api/sourcing-researches/${savedResearch.id}`,
      );
      setDetail(refreshed.data!);
      setDraft(recordToInput(refreshed.data!));
      setCreating(false);
      setMessage(
        registration.data?.alreadyExists
          ? "소싱 아이템을 저장하고 기존 등록 초안을 갱신했습니다."
          : "소싱 아이템을 저장하고 상품 등록 초안을 만들었습니다.",
      );
      const listResponse = await api<never, ListItem[]>("/api/sourcing-researches");
      setItems(listResponse.items ?? []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(item: ListItem) {
    if (item.registrationProductId) {
      setError("등록 초안이 만들어진 소싱 아이템은 상품등록관리에서 먼저 정리해 주세요.");
      return;
    }
    if (!window.confirm(`'${item.sourcingKeyword || "새 소싱 아이템"}'을 소싱 목록에서 삭제할까요?`)) {
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await api(`/api/sourcing-researches/${item.id}`, { method: "DELETE" });
      const remaining = items.filter((candidate) => candidate.id !== item.id);
      setItems(remaining);
      if (detail?.id === item.id) {
        if (remaining[0]) {
          const response = await api<SourcingResearchRecord>(
            `/api/sourcing-researches/${remaining[0].id}`,
          );
          setDetail(response.data!);
          setDraft(recordToInput(response.data!));
          setCreating(false);
          resetEditorTransientState(response.data!);
        } else {
          setDetail(null);
          setDraft(emptyResearch());
          setCreating(true);
          resetEditorTransientState();
        }
      }
      setMessage("소싱 아이템을 삭제했습니다.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  function openSmartstoreReviewImporter() {
    setMessage(null);
    setError(null);
    if (extensionAvailable !== true) {
      setError("Chrome 확장 프로그램 0.5.16 이상을 다시 불러온 뒤 Shoppingday 페이지를 새로고침해 주세요.");
      return;
    }
    try {
      const url = new URL(reviewProductUrl.trim());
      if (
        url.protocol !== "https:" ||
        !["smartstore.naver.com", "m.smartstore.naver.com", "brand.naver.com"].includes(url.hostname) ||
        !/^\/[^/]+\/products\/\d+/.test(url.pathname)
      ) {
        throw new Error("스마트스토어 또는 브랜드스토어 상품 주소를 입력해 주세요.");
      }
      window.dispatchEvent(new CustomEvent(SMARTSTORE_REVIEW_REQUEST_EVENT, {
        detail: { requestId: crypto.randomUUID(), url: url.toString() },
      }));
      setMessage("스마트스토어 상품을 열고 있습니다. 리뷰 탭에서 ‘현재 리뷰 가져오기’를 눌러 주세요.");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function exportKeywords() {
    if (!draft.relatedKeywords.length || exportingKeywords) return;
    setExportingKeywords(true);
    setMessage(null);
    setError(null);
    try {
      await downloadSourcingKeywordWorkbook(draft);
      setMessage(
        `분류 키워드 ${draft.relatedKeywords.length}개와 저장된 판독 표본을 엑셀로 내려받았습니다.`,
      );
    } catch (caught) {
      setError(`엑셀 파일을 만들지 못했습니다. ${errorMessage(caught)}`);
    } finally {
      setExportingKeywords(false);
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
      setDraft((current) => ({
        ...current,
        reviewEntries: appendReviewEntries(
          current.reviewEntries,
          reviews.map((review) => storedReview(review.content, review.rating, "file")),
        ),
      }));
      setReviewListExpanded(true);
      setReviewAnalysis(null);
      setMessage(`리뷰 파일에서 ${reviews.length}개를 읽어 입력 목록에 추가했습니다.`);
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
      const reviews = draft.reviewEntries.flatMap((entry) =>
        entry.rating == null
          ? parsePastedReviews(entry.content)
          : [{ content: entry.content, rating: entry.rating }],
      );
      setReviewAnalysis(analyzeReviews(reviews));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function addBulkReviews() {
    try {
      const reviews = parsePastedReviews(reviewRawText);
      if (!reviews.length) return;
      setDraft((current) => ({
        ...current,
        reviewEntries: appendReviewEntries(
          current.reviewEntries,
          reviews.map((review) => storedReview(review.content, review.rating, "bulk")),
        ),
      }));
      setReviewRawText("");
      setReviewListExpanded(true);
      setReviewAnalysis(null);
      setMessage(`${reviews.length}개 리뷰를 입력 목록에 추가했습니다.`);
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
          <span>키워드에서 시작해 시장·품목 위험·리뷰를 순서대로 검토합니다.</span>
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
          {sourcingListOpen ? (
            <button
              type="button"
              className="sourcing-list-backdrop"
              aria-label="소싱 목록 닫기"
              onClick={() => setSourcingListOpen(false)}
            />
          ) : null}
          <aside
            id="sourcing-list-panel"
            className={`sourcing-list${sourcingListOpen ? " open" : ""}`}
            aria-label="소싱 목록"
          >
            <div className="sourcing-list-head">
              <div>
                <strong>소싱 목록</strong>
                <span>{items.length}개</span>
              </div>
              <button
                type="button"
                className="sourcing-list-close"
                aria-label="소싱 목록 닫기"
                onClick={() => setSourcingListOpen(false)}
              >
                ×
              </button>
            </div>
            {items.length ? items.map((item) => (
              <div
                key={item.id}
                className={`sourcing-list-item${!creating && detail?.id === item.id ? " active" : ""}`}
              >
                <button type="button" className="sourcing-list-select" onClick={() => selectItem(item.id)} disabled={busy}>
                  <strong>{item.sourcingKeyword || "새 소싱 아이템"}</strong>
                  <span className={item.status === "selected" ? "selected" : undefined}>{statusLabels[item.status]}</span>
                  <small>
                    검색 {formatNumber(item.monthlySearchVolume)} · 6개월 {formatManwon(item.sixMonthRevenue)}
                  </small>
                </button>
                <button
                  type="button"
                  className="sourcing-list-delete"
                  onClick={() => deleteItem(item)}
                  disabled={busy || Boolean(item.registrationProductId)}
                  aria-label={`${item.sourcingKeyword || "새 소싱 아이템"} 삭제`}
                  title={item.registrationProductId ? "등록 초안이 있는 항목은 상품등록관리에서 먼저 정리해야 합니다." : "소싱 아이템 삭제"}
                >
                  삭제
                </button>
              </div>
            )) : (
              <div className="sourcing-list-empty">첫 소싱 키워드를 기록해 보세요.</div>
            )}
          </aside>

          <div className="sourcing-editor">
            <div className="sourcing-editor-bar">
              <div className="sourcing-editor-title">
                <button
                  type="button"
                  className="sourcing-list-trigger"
                  aria-controls="sourcing-list-panel"
                  aria-expanded={sourcingListOpen}
                  aria-label={`소싱 목록 열기 (${items.length}개)`}
                  onClick={() => setSourcingListOpen(true)}
                >
                  <span aria-hidden="true">☰</span>
                  소싱 목록
                  <strong>{items.length}</strong>
                </button>
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
                  <NumberInput value={draft.monthlySearchVolume} onChange={(value) => setField("monthlySearchVolume", value)} placeholder="10,000" />
                  <PreferenceBadge met={(draft.monthlySearchVolume ?? 0) >= 10_000} metText="선호 검색수 충족" pendingText="선호 기준 10,000" />
                </Field>
                <Field label="최근 6개월 매출" help="만원 단위로 입력합니다. 실제 확인값만 기록하세요.">
                  <div className="sourcing-money-input">
                    <FormattedNumberInput
                      value={draft.sixMonthRevenue == null ? null : Math.round(draft.sixMonthRevenue / 10_000)}
                      onChange={(value) => setField("sixMonthRevenue", value == null ? null : value * 10_000)}
                      placeholder="10,000"
                    />
                    <span>만원</span>
                  </div>
                  <PreferenceBadge met={(draft.sixMonthRevenue ?? 0) >= 100_000_000} metText="선호 매출 충족" pendingText="선호 기준 10,000만원" />
                </Field>
                <Field label="시장 조사 메모" wide>
                  <textarea rows={4} value={draft.marketNotes} onChange={(event) => setField("marketNotes", event.target.value)} placeholder="데이터 출처, 조회일, 상위 상품 특징 등을 기록하세요." />
                </Field>
              </div>
            </ResearchSection>

            <ResearchSection number="02" title="연관 키워드 분류" description="아이템스카우트 엑셀에서 키워드와 총 검색수만 가져온 뒤, 직접 검색한 결과에 따라 사용할 위치를 표시합니다.">
              <div className="sourcing-keyword-import">
                <div>
                  <strong>아이템스카우트 엑셀 추가 가져오기</strong>
                  <span>기존 키워드를 지우지 않고 새 키워드를 누적합니다. 같은 키워드는 기존 분류를 유지하고 검색량만 갱신합니다.</span>
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
              <div className="sourcing-keyword-manual">
                <div>
                  <strong>연관키워드 직접 추가</strong>
                  <span>한 줄에 하나씩 입력하세요. 검색수를 함께 기록하려면 <code>키워드, 1200</code> 형식도 사용할 수 있습니다.</span>
                </div>
                <textarea
                  rows={4}
                  value={manualKeywordText}
                  onChange={(event) => setManualKeywordText(event.target.value)}
                  placeholder={"욕실 미끄럼방지\n물빠짐 욕실화, 420"}
                  aria-label="직접 추가할 연관키워드"
                />
                <button type="button" onClick={addManualKeywords} disabled={!manualKeywordText.trim()}>
                  키워드 추가
                </button>
              </div>

              <div className="sourcing-category-step">
                <div className="sourcing-category-step-head">
                  <div>
                    <strong>분류 기준 네이버 카테고리</strong>
                    <span>키워드 자동 분류와 공식 속성 연결, 등록 초안에 공통으로 사용하는 판매 카테고리입니다.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void recommendSourcingNaverCategory()}
                    disabled={naverCategoryBusy || draft.sourcingKeyword.trim().length < 2}
                  >
                    {naverCategoryBusy ? "추천 확인 중…" : "기준 상품어로 추천"}
                  </button>
                </div>
                {draft.naverCategory ? (
                  <div className="sourcing-category-selected">
                    <div>
                      <strong>{draft.naverCategory.name}</strong>
                      <span>{draft.naverCategory.wholeCategoryName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft((current) => ({
                          ...current,
                          naverCategory: null,
                          relatedKeywords: current.relatedKeywords.map((item) => ({
                            ...item,
                            analysis: null,
                            ...(item.officialAttribute
                              ? { officialAttribute: null, placement: "unclassified" as const }
                              : {}),
                          })),
                        }));
                        setKeywordExposureResults({});
                        setKeywordTagDictionaryResults({});
                        setKeywordOfficialAttributeStatuses({});
                        setKeywordQualityFilter("all");
                        officialAttributeContextCacheRef.current.clear();
                      }}
                    >
                      선택 해제
                    </button>
                  </div>
                ) : (
                  <div className="sourcing-category-required">카테고리를 선택해야 자동 분류를 시작할 수 있습니다.</div>
                )}
                <label className="sourcing-category-search">
                  <span>카테고리 직접 검색</span>
                  <input
                    role="combobox"
                    aria-expanded={naverCategoryResults.length > 0}
                    aria-controls="sourcing-category-results"
                    value={naverCategorySearch}
                    onChange={(event) => {
                      const value = event.target.value;
                      setNaverCategorySearch(value);
                      if (!value.trim()) {
                        setNaverCategoryResults([]);
                        setNaverCategoryStatus("");
                      }
                    }}
                    placeholder="예: 야채탈수기"
                  />
                </label>
                {naverCategoryStatus ? <small>{naverCategoryStatus}</small> : null}
                {naverCategoryResults.length ? (
                  <div id="sourcing-category-results" className="sourcing-category-results" role="listbox">
                    {naverCategoryResults.map((category) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={draft.naverCategory?.id === category.id}
                        key={category.id}
                        onClick={() => {
                          selectSourcingNaverCategory(category);
                          setNaverCategoryStatus("카테고리를 선택했습니다.");
                        }}
                      >
                        <strong>{category.name}</strong>
                        <span>{category.wholeCategoryName}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {draft.relatedKeywords.length ? (
                <>
                  <div className="sourcing-keyword-flow" aria-label="키워드 운영 흐름">
                    <div>
                      <strong>1. 부적합 키워드 삭제</strong>
                      <span>상품에 없는 소재·기능·용도의 키워드를 먼저 제거합니다.</span>
                    </div>
                    <div>
                      <strong>2. 자동 분류</strong>
                      <span>상품명 {titleExposureThreshold}% 이상 → 공식 속성 → 공식 태그 → 카테고리 → 나머지 상품명 순입니다.</span>
                    </div>
                    <div>
                      <strong>3. 등록 재료 확인</strong>
                      <span>상품명 후보 중 8~10개를 조합하고, 상품명에 쓰지 않은 공식 태그를 최대 10개 사용합니다.</span>
                    </div>
                    <div className="sourcing-keyword-flow-status">
                      <span>상품명 조합 후보 <strong>{keywordWorkflowSummary.titleCandidates}/8~10</strong></span>
                      <span>공식 태그 <strong>{keywordWorkflowSummary.officialTags}/10</strong></span>
                      <span>공식 속성 <strong>{keywordWorkflowSummary.officialAttributes}</strong></span>
                      <span>미분류 <strong>{keywordCounts.unclassified}</strong></span>
                    </div>
                  </div>
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
                    {itemScoutKeywordCount > 0 ? (
                      <button type="button" onClick={clearItemScoutKeywords}>
                        엑셀 키워드 삭제 ({itemScoutKeywordCount})
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void exportKeywords()}
                      disabled={exportingKeywords}
                    >
                      {exportingKeywords ? "엑셀 만드는 중…" : "분류 결과 엑셀 다운로드"}
                    </button>
                  </div>
                  <div className="sourcing-keyword-exclusion">
                    <div>
                      <strong>1단계 · 부적합 포함어 일괄 삭제</strong>
                      <span>입력한 단어가 포함된 연관키워드를 출처와 분류에 관계없이 모두 삭제합니다.</span>
                    </div>
                    <input
                      value={keywordExclusionText}
                      onChange={(event) => setKeywordExclusionText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") removeKeywordsContainingText();
                      }}
                      placeholder="예: 메모리폼"
                      aria-label="삭제할 키워드 포함어"
                    />
                    <button
                      type="button"
                      onClick={removeKeywordsContainingText}
                      disabled={!excludedKeywordCount}
                    >
                      일치 키워드 삭제 ({excludedKeywordCount})
                    </button>
                  </div>
                  <div className="sourcing-keyword-exposure-tools">
                    <div>
                      <strong>2단계 · 네이버쇼핑 1페이지 자동 분류</strong>
                      <span>
                        광고·중복을 제외한 PC 가격비교 상품 최대 40개를 봅니다. 상품명 다수 기준이 공식 속성·태그보다 우선하며, 나머지는 상품명 후보가 됩니다.
                      </span>
                    </div>
                    <label>
                      상품명 다수 기준
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={titleExposureThreshold}
                        onChange={(event) =>
                          setTitleExposureThreshold(
                            Math.min(100, Math.max(1, Number(event.target.value) || 1)),
                          )
                        }
                        aria-label="상품명 노출 추천 기준"
                      />
                      %
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        void analyzeKeywordExposure(
                          visibleRelatedKeywords.filter(
                            (item) => item.placement === "unclassified",
                          ),
                        )
                      }
                      disabled={
                        keywordExposureRunning ||
                        !draft.naverCategory ||
                        !visibleRelatedKeywords.some(
                          (item) => item.placement === "unclassified",
                        )
                      }
                    >
                      {keywordExposureRunning
                        ? keywordExposureProgress || "분석 준비 중…"
                        : "미분류 최대 10개 자동 분류"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          !window.confirm(
                            `현재 연관키워드 ${draft.relatedKeywords.length}개를 모두 다시 검색하고 상품명 ${titleExposureThreshold}% 이상 → 공식 속성 → 공식 태그 → 카테고리 → 나머지 상품명 순으로 초안에 반영할까요? 키워드 수에 따라 오래 걸릴 수 있으며 언제든 중지할 수 있습니다.`,
                          )
                        ) return;
                        void analyzeKeywordExposure(draft.relatedKeywords, {
                          analyzeAll: true,
                          applyRecommendations: true,
                        });
                      }}
                      disabled={
                        keywordExposureRunning ||
                        !draft.naverCategory ||
                        draft.relatedKeywords.length === 0
                      }
                    >
                      전체 키워드 다시 자동 분류
                    </button>
                    {keywordExposureRunning ? (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          keywordExposureCancelRef.current = true;
                          setKeywordExposureProgress("현재 키워드 완료 후 중지…");
                        }}
                      >
                        분석 중지
                      </button>
                    ) : null}
                    <small>
                      {extensionAvailable === true
                        ? "Chrome 확장 프로그램 연결됨"
                        : extensionAvailable === false
                          ? "확장 프로그램 0.5.16 이상을 다시 로드해야 합니다."
                          : "확장 프로그램 연결 확인 중…"}
                    </small>
                  </div>
                  <div className="sourcing-keyword-volume-filters" aria-label="검색수 필터">
                    {(Object.entries(keywordVolumeFilterLabels) as Array<[KeywordVolumeFilter, string]>).map(([value, label]) => (
                      <button type="button" key={value} className={keywordVolumeFilter === value ? "active" : undefined} onClick={() => setKeywordVolumeFilter(value)}>{label}</button>
                    ))}
                    <button type="button" className="sort" onClick={() => setKeywordVolumeSort((current) => current === "desc" ? "asc" : "desc")}>
                      검색수 {keywordVolumeSort === "desc" ? "높은순 ↓" : "낮은순 ↑"}
                    </button>
                    <button
                      type="button"
                      className={keywordQualityFilter === "category_review" ? "active review" : "review"}
                      onClick={() => setKeywordQualityFilter((current) =>
                        current === "category_review" ? "all" : "category_review"
                      )}
                      disabled={
                        categoryReviewKeywordCount === 0 &&
                        keywordQualityFilter !== "category_review"
                      }
                    >
                      카테고리 삭제 검토 {categoryReviewKeywordCount}
                    </button>
                  </div>
                  <div className="sourcing-keyword-table-wrap">
                    <table className="sourcing-keyword-table">
                      <thead><tr><th>키워드</th><th>총 검색수</th><th>1페이지 분석</th><th>직접 분류</th><th><span className="sr-only">삭제</span></th></tr></thead>
                      <tbody>
                        {visibleRelatedKeywords.map((item) => {
                          const exposure = keywordExposureResults[item.id];
                          const tagDictionary =
                            keywordTagDictionaryResults[item.id];
                          const officialTag =
                            tagDictionary?.exactTag ?? item.officialTag;
                          const recommendation = exposure
                              ? recommendKeywordPlacement(
                                exposure,
                                titleExposureThreshold,
                                tagDictionary,
                                item.officialAttribute,
                              )
                            : null;
                          const contextAssessment = exposure
                            ? assessKeywordContext(exposure)
                            : null;
                          const categoryFit = categoryFitAssessment(exposure);
                          const titleThresholdCount = exposure
                            ? Math.max(
                                1,
                                Math.ceil(
                                  exposure.productCount * titleExposureThreshold / 100,
                                ),
                              )
                            : 0;
                          const titleIsMajority = Boolean(
                            exposure && exposure.titleMatchCount >= titleThresholdCount,
                          );
                          const officialAttributeStatus =
                            keywordOfficialAttributeStatuses[item.id];
                          const hasDualTitleTagEligibility = Boolean(
                            officialTag && recommendation?.placement === "product_name",
                          );
                          const requiresReview = Boolean(
                            exposure && contextAssessment?.mismatched,
                          );
                          const shouldReviewDeletion = shouldReviewKeywordDeletion(
                            item,
                            exposure,
                          );
                          const leadingOtherCategory = exposure
                            ? dominantOtherCategory(exposure)
                            : null;
                          return (
                          <tr
                            key={item.id}
                            className={shouldReviewDeletion ? "category-review" : undefined}
                          >
                            <td>{item.keyword}</td>
                            <td>{formatNumber(item.monthlySearchVolume)}</td>
                            <td>
                              {exposure ? (
                                <div className="keyword-exposure-result">
                                  {exposure.status === "completed" ? (
                                    <>
                                      <div className="keyword-signal-grid">
                                        <span className={`keyword-signal primary ${categoryFit.level}`}>
                                          <b>카테고리 적합</b>
                                          <strong>{categoryFit.count}/{exposure.productCount}</strong>
                                          <em>
                                            {categoryFit.percent}% · {categoryFit.level === "poor" && !shouldReviewDeletion
                                              ? "단독 검색 다른 상품군"
                                              : categoryFit.label}
                                          </em>
                                        </span>
                                        <span className={`keyword-signal ${titleIsMajority ? "title-strong" : "neutral"}`}>
                                          <b>상품명 노출</b>
                                          <strong>{exposure.titleMatchCount}/{exposure.productCount}</strong>
                                          <em>{titleIsMajority ? "다수 기준 충족" : `${titleExposureThreshold}% 기준 미달`}</em>
                                        </span>
                                        <span className={`keyword-signal ${officialTag ? "tag-registered" : tagDictionary?.status === "unregistered" ? "tag-unregistered" : "unavailable"}`}>
                                          <b>네이버 태그</b>
                                          <strong>{officialTag ? "등록" : tagDictionary?.status === "unregistered" ? "미등록" : "확인 실패"}</strong>
                                          <em>{officialTag ? `#${officialTag.code} ${officialTag.text}` : "태그로 자동 사용 안 함"}</em>
                                        </span>
                                        <span className={`keyword-signal ${officialAttributeStatus === "matched" ? "attribute-matched" : officialAttributeStatus === "unmatched" ? "neutral" : "unavailable"}`}>
                                          <b>공식 속성</b>
                                          <strong>{officialAttributeStatus === "matched" ? "연결" : officialAttributeStatus === "unmatched" ? "없음" : "확인 실패"}</strong>
                                          <em>{item.officialAttribute
                                            ? `${item.officialAttribute.attributeName} > ${item.officialAttribute.attributeValueName}`
                                            : officialAttributeStatus === "unmatched"
                                              ? "선택 카테고리에 일치값 없음"
                                              : "속성 확인 필요"}</em>
                                        </span>
                                      </div>
                                      {categoryFit.level === "poor" && leadingOtherCategory ? (
                                        <div className="keyword-category-dominant">
                                          <b>주로 노출되는 다른 카테고리</b>
                                          <strong>{leadingOtherCategory.category}</strong>
                                          <span>{leadingOtherCategory.count}/{exposure.productCount}건</span>
                                        </div>
                                      ) : null}
                                      <div className={`keyword-analysis-decision ${shouldReviewDeletion ? "poor" : hasDualTitleTagEligibility ? "title-tag" : recommendation?.placement ?? categoryFit.level}`}>
                                        <div>
                                          <strong>
                                            {shouldReviewDeletion
                                              ? "카테고리 불일치 · 삭제 검토"
                                              : hasDualTitleTagEligibility
                                                ? "추천 상품명 후보 · 태그 키워드 후보"
                                                : recommendation
                                                  ? `추천 ${keywordPlacementLabels[recommendation.placement]}`
                                                : requiresReview
                                                  ? "확인 필요"
                                                  : "분류 근거 확인"}
                                          </strong>
                                          <span>
                                            {shouldReviewDeletion
                                              ? `선택 카테고리 상품이 ${categoryFit.count}/${exposure.productCount}건뿐입니다.`
                                              : hasDualTitleTagEligibility
                                                ? `${recommendation?.reason ?? ""} 실제 상품명 조합에 선택되지 않으면 공식 태그 후보로 사용합니다.`
                                                : recommendation?.reason ?? contextAssessment?.reason}
                                          </span>
                                        </div>
                                        {shouldReviewDeletion ? (
                                          <button
                                            type="button"
                                            className="danger"
                                            onClick={() => {
                                              if (!window.confirm(`'${item.keyword}' 키워드를 삭제할까요?`)) return;
                                              removeRelatedKeyword(item.id);
                                              setMessage(`${item.keyword} 키워드를 초안에서 삭제했습니다.`);
                                            }}
                                          >
                                            키워드 삭제
                                          </button>
                                        ) : recommendation ? (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              updateKeywordPlacement(item.id, recommendation.placement);
                                              setMessage(
                                                `${item.keyword}을(를) ${keywordPlacementLabels[recommendation.placement]}로 반영했습니다. 임시저장하면 상세 분석 근거와 함께 보존됩니다.`,
                                              );
                                            }}
                                          >
                                            추천 적용
                                          </button>
                                        ) : item.placement !== "unclassified" ? (
                                          <button
                                            type="button"
                                            onClick={() => updateKeywordPlacement(item.id, "unclassified")}
                                          >
                                            미분류로 전환
                                          </button>
                                        ) : null}
                                      </div>
                                      <details className="keyword-analysis-raw">
                                        <summary>세부 판독 수치</summary>
                                        <p>
                                          상품명 {exposure.titleMatchCount}/{exposure.productCount} · 카드 부가정보 {exposure.attributeMatchCount} · 검색어 카테고리 문구 {exposure.categoryMatchCount} · 기준 상품명 관련 {exposure.contextMatchCount}/{exposure.productCount}
                                        </p>
                                      </details>
                                      <small className="keyword-analysis-reason">
                                        {recommendation?.reason ??
                                          (exposure
                                            ? keywordPlacementReviewReason(
                                                exposure,
                                                tagDictionary,
                                              )
                                            : null)}
                                      </small>
                                      {exposure.samples.length > 0 ? (
                                        <details>
                                          <summary>상품명 판독 표본 {exposure.samples.length}개</summary>
                                          <ul>
                                            {exposure.samples.map((sample, index) => (
                                              <li key={`${index}-${sample.title}`}>
                                                {sample.evidence || sample.title}
                                                {sample.category ? (
                                                  <small> · 카테고리 {sample.category}</small>
                                                ) : null}
                                              </li>
                                            ))}
                                          </ul>
                                        </details>
                                      ) : null}
                                    </>
                                  ) : (
                                    <small>{exposure.message ?? "분석 실패"}</small>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => void analyzeKeywordExposure([item])}
                                    disabled={keywordExposureRunning || !draft.naverCategory}
                                  >
                                    다시 분석
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="keyword-exposure-single"
                                  onClick={() => void analyzeKeywordExposure([item])}
                                  disabled={keywordExposureRunning || !draft.naverCategory}
                                >
                                  노출 분석
                                </button>
                              )}
                            </td>
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
                            <td>
                              <button
                                type="button"
                                className="sourcing-keyword-delete"
                                onClick={() => removeRelatedKeyword(item.id)}
                                aria-label={`${item.keyword} 키워드 삭제`}
                                title="키워드 삭제"
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="sourcing-keyword-empty">엑셀을 올리면 키워드와 총 검색수가 여기에 표시됩니다.</div>
              )}
            </ResearchSection>

            <ResearchSection number="03" title="품목 조사" description="진입 위험을 확인하고, 어떤 제품을 찾아야 하는지 기준을 세웁니다.">
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
                <div className="sourcing-smartstore-review-import">
                  <div>
                    <strong>스마트스토어 현재 화면 리뷰 가져오기</strong>
                    <span>상품 링크를 열고 리뷰 탭에서 확장 프로그램 버튼을 누르세요. 페이지를 넘겨 반복하면 중복 없이 누적됩니다.</span>
                  </div>
                  <div>
                    <input
                      type="url"
                      value={reviewProductUrl}
                      onChange={(event) => setReviewProductUrl(event.target.value)}
                      placeholder="https://smartstore.naver.com/스토어/products/상품번호"
                      aria-label="리뷰를 가져올 스마트스토어 상품 링크"
                    />
                    <button
                      type="button"
                      onClick={openSmartstoreReviewImporter}
                      disabled={!reviewProductUrl.trim()}
                    >
                      상품 열기
                    </button>
                  </div>
                  <small>확장 프로그램 0.5.16 이상 · 자동 페이지 넘김이나 차단 우회 없이 현재 공개된 리뷰만 가져옵니다.</small>
                </div>
                <div className="sourcing-review-analyzer-head">
                  <div>
                    <strong>가져온 리뷰 확인 및 직접 입력</strong>
                    <span>입력한 리뷰 원문은 이 소싱 아이템에 저장되며 분석 근거로 다시 사용할 수 있습니다.</span>
                  </div>
                  <div className="sourcing-review-head-actions">
                    <button type="button" onClick={() => setReviewListExpanded((current) => !current)} aria-expanded={reviewListExpanded}>
                      {reviewListExpanded ? "전체 리뷰 접기" : `전체 리뷰 펼치기 (${draft.reviewEntries.filter((entry) => entry.content.trim()).length}개)`}
                    </button>
                    <button type="button" className="sourcing-review-add" onClick={() => {
                      setDraft((current) => ({ ...current, reviewEntries: [...current.reviewEntries, storedReview()] }));
                      setReviewListExpanded(true);
                    }}>
                      + 리뷰 추가
                    </button>
                  </div>
                </div>
                {reviewListExpanded ? (
                  <div className="sourcing-review-rows">
                    {draft.reviewEntries.map((entry, index) => (
                      <div key={entry.id} className="sourcing-review-row">
                        <span>{index + 1}</span>
                        <input
                          value={entry.content}
                          onChange={(event) => {
                            const content = event.target.value;
                            setDraft((current) => ({
                              ...current,
                              reviewEntries: current.reviewEntries.map((item) => item.id === entry.id ? { ...item, content } : item),
                            }));
                            setReviewAnalysis(null);
                          }}
                          placeholder="리뷰 한 건을 붙여넣으세요. 예: 1점 접착력이 약해요"
                          aria-label={`리뷰 ${index + 1}`}
                        />
                        <small>{entry.rating ? `별점 ${entry.rating}` : ""}</small>
                        <button
                          type="button"
                          onClick={() => {
                            setDraft((current) => ({
                              ...current,
                              reviewEntries: current.reviewEntries.length === 1
                                ? [storedReview()]
                                : current.reviewEntries.filter((item) => item.id !== entry.id),
                            }));
                            setReviewAnalysis(null);
                          }}
                          aria-label={`리뷰 ${index + 1} 삭제`}
                          title="리뷰 입력란 삭제"
                        >
                          −
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <button type="button" className="sourcing-review-list-preview" onClick={() => setReviewListExpanded(true)}>
                    리뷰 {draft.reviewEntries.filter((entry) => entry.content.trim()).length}개가 접혀 있습니다. 눌러서 전체 펼치기
                  </button>
                )}
                <details className="sourcing-review-import-options">
                  <summary>여러 줄 붙여넣기 또는 파일 가져오기</summary>
                  <textarea
                    rows={6}
                    value={reviewRawText}
                    onChange={(event) => { setReviewRawText(event.target.value); setReviewAnalysis(null); }}
                    placeholder={"여러 리뷰를 한 줄에 하나씩 붙여넣으세요. 여러 줄로 된 리뷰는 빈 줄로 구분하세요."}
                    aria-label="분석할 리뷰 원문"
                  />
                  <div className="sourcing-review-import-actions">
                    <button type="button" onClick={addBulkReviews} disabled={!reviewRawText.trim()}>입력 목록에 추가</button>
                    <label className="sourcing-file-button">
                      <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importReviewFile} disabled={reviewImporting} />
                      {reviewImporting ? "리뷰 읽는 중…" : "리뷰 파일 선택"}
                    </label>
                  </div>
                </details>
                <div className="sourcing-review-actions">
                  <span>
                    저장 대상 리뷰 {draft.reviewEntries.filter((entry) => entry.content.trim()).length}개
                  </span>
                  <button type="button" onClick={runReviewAnalysis} disabled={!draft.reviewEntries.some((entry) => entry.content.trim())}>규칙 기반 리뷰 분석</button>
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
                      <ReviewTypeSummary title="확인된 장점 유형" types={reviewAnalysis.positiveTerms} />
                      <ReviewTypeSummary title="확인된 불편 유형" types={reviewAnalysis.negativeTerms} />
                    </div>
                    <details className="sourcing-review-evidence">
                      <summary>분류 근거 원문 보기</summary>
                      <div>
                        <ReviewEvidenceList title="장점으로 분류된 리뷰" examples={reviewAnalysis.positiveExamples} />
                        <ReviewEvidenceList title="단점으로 분류된 리뷰" examples={reviewAnalysis.negativeExamples} />
                      </div>
                    </details>
                    <p>유형별 2건 이상은 반복 확인, 1건은 개별 확인으로 표시합니다. 별점이 있으면 4~5점은 장점, 1~3점은 단점으로 우선 분류하며 유형에 맞지 않는 일반 단어는 표시하지 않습니다.</p>
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

            <div className="sourcing-final-note">
              <strong>최종 판단은 직접 하세요.</strong>
              <span>검색수·매출·체크리스트는 참고 자료이며 재고 소진, 노출 순위 또는 판매 성과를 보장하지 않습니다.</span>
            </div>
            <div className="sourcing-save-bar">
              <span>임시저장은 조사 목록에만 남고, 소싱 아이템 저장은 등록 초안을 만들어 상품등록관리로 보냅니다.</span>
              <div className="sourcing-save-actions">
                <button type="button" className="secondary" onClick={() => save(true)} disabled={busy}>{busy ? "저장 중…" : "임시저장"}</button>
                <button type="button" onClick={saveAndCreateRegistration} disabled={busy || !draft.sourcingKeyword.trim()}>{busy ? "등록 초안 생성 중…" : "소싱 아이템 저장"}</button>
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
  function updateKeywordPlacement(id: string, placement: SourcingKeywordPlacement) {
    setDraft((current) => ({
      ...current,
      relatedKeywords: current.relatedKeywords.map((item) =>
        item.id === id ? { ...item, placement } : item,
      ),
    }));
  }
  function resetEditorTransientState(research?: SourcingResearchInput) {
    setManualKeywordText("");
    setKeywordExclusionText("");
    setNaverCategorySearch("");
    setNaverCategoryResults([]);
    setNaverCategoryStatus("");
    setReviewRawText("");
    setReviewListExpanded(true);
    setReviewAnalysis(null);
    const relatedKeywords = research?.relatedKeywords ?? [];
    setKeywordExposureResults(keywordExposureResultsFrom(relatedKeywords));
    setKeywordTagDictionaryResults(keywordTagDictionaryResultsFrom(relatedKeywords));
    setKeywordOfficialAttributeStatuses(
      keywordOfficialAttributeStatusesFrom(relatedKeywords),
    );
    const savedThreshold = relatedKeywords.find(
      (item) => item.analysis,
    )?.analysis?.titleExposureThresholdPercent;
    setTitleExposureThreshold(
      savedThreshold ?? DEFAULT_TITLE_EXPOSURE_THRESHOLD_PERCENT,
    );
    officialAttributeContextCacheRef.current.clear();
    setKeywordExposureProgress("");
    setKeywordQualityFilter("all");
    keywordExposureCancelRef.current = true;
  }
}

function keywordExposureResultsFrom(
  keywords: SourcingRelatedKeyword[],
): Record<string, KeywordExposureResult> {
  return Object.fromEntries(
    keywords
      .filter((item) => item.analysis)
      .map((item) => [item.id, item.analysis!.exposure]),
  );
}

function keywordTagDictionaryResultsFrom(
  keywords: SourcingRelatedKeyword[],
): Record<string, NaverTagDictionaryResult> {
  return Object.fromEntries(
    keywords
      .filter((item) => item.analysis)
      .map((item) => [item.id, item.analysis!.tagDictionary]),
  );
}

function keywordOfficialAttributeStatusesFrom(
  keywords: SourcingRelatedKeyword[],
): Record<string, "matched" | "unmatched" | "unavailable"> {
  return Object.fromEntries(
    keywords
      .filter((item) => item.analysis)
      .map((item) => [item.id, item.analysis!.officialAttributeStatus]),
  );
}

function requestKeywordExposure(
  keyword: string,
  contextKeyword: string,
  contextCategory: SourcingNaverCategory,
) {
  return new Promise<KeywordExposureResult>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`${keyword} 키워드 분석 응답 시간이 초과되었습니다.`));
    }, 90_000);
    const handleResult = (event: Event) => {
      const detail = (
        event as CustomEvent<{ requestId?: string; result?: unknown }>
      ).detail;
      if (detail?.requestId !== requestId) return;
      cleanup();
      if (!isKeywordExposureResult(detail.result)) {
        reject(new Error("Chrome 확장 프로그램의 키워드 분석 결과가 올바르지 않습니다."));
        return;
      }
      resolve(detail.result);
    };
    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener(KEYWORD_EXPOSURE_RESULT_EVENT, handleResult);
    }
    window.addEventListener(KEYWORD_EXPOSURE_RESULT_EVENT, handleResult);
    window.dispatchEvent(
      new CustomEvent(KEYWORD_EXPOSURE_REQUEST_EVENT, {
        detail: {
          requestId,
          keyword,
          contextKeyword,
          contextCategoryId: contextCategory.id,
          contextCategoryName: contextCategory.name,
        },
      }),
    );
  });
}

function isKeywordExposureResult(value: unknown): value is KeywordExposureResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<KeywordExposureResult>;
  return (
    typeof result.keyword === "string" &&
    result.device === "pc" &&
    ["completed", "blocked", "failed"].includes(result.status ?? "") &&
    [
      result.productCount,
      result.titleMatchCount,
      result.attributeMatchCount,
      result.categoryMatchCount,
      result.contextMatchCount,
      result.contextCategoryMatchCount,
    ].every((count) => Number.isInteger(count) && (count ?? -1) >= 0) &&
    typeof result.observedAt === "string" &&
    typeof result.contextKeyword === "string" &&
    typeof result.contextCategoryId === "string" &&
    typeof result.contextCategoryName === "string" &&
    Array.isArray(result.categoryDistribution) &&
    result.categoryDistribution.every((entry) =>
      typeof entry?.category === "string" &&
      Number.isInteger(entry.count) &&
      entry.count >= 0
    ) &&
    Array.isArray(result.samples) &&
    (result.message === null || typeof result.message === "string")
  );
}

function isExtensionVersionSupported(version: string | null | undefined) {
  if (!version) return false;
  const parts = version.split(".").map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0)) return false;
  const [major = 0, minor = 0, patch = 0] = parts;
  return (
    major > 0 ||
    (major === 0 && minor > 5) ||
    (major === 0 && minor === 5 && patch >= 16)
  );
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function normalizeKeywordText(value: string) {
  return value.trim().replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

function storedReview(
  content = "",
  rating: number | null = null,
  source: SourcingReviewInput["source"] = "manual",
): SourcingReviewInput {
  return { id: crypto.randomUUID(), content, rating, source };
}

function appendReviewEntries(
  current: SourcingReviewInput[],
  additions: SourcingReviewInput[],
) {
  const additionByContent = new Map<string, SourcingReviewInput>();
  for (const entry of additions) {
    const key = entry.content.replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
    if (!key) continue;
    const existing = additionByContent.get(key);
    if (!existing || (existing.rating == null && entry.rating != null)) {
      additionByContent.set(key, entry);
    }
  }
  const mergedCurrent = current.map((entry) => {
    if (entry.rating != null) return entry;
    const key = entry.content.replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
    const addition = additionByContent.get(key);
    return addition?.rating != null ? { ...entry, rating: addition.rating } : entry;
  });
  const seen = new Set(
    mergedCurrent.map((entry) => entry.content.replace(/\s+/g, "").toLocaleLowerCase("ko-KR")),
  );
  return [...mergedCurrent, ...additions.filter((entry) => {
    const key = entry.content.replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  })].slice(0, 500);
}

function ResearchSection({ number, title, description, children }: { number: string; title: string; description: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <section className={`sourcing-section${expanded ? " expanded" : " collapsed"}`}><button type="button" className="sourcing-section-head" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div><b aria-hidden="true">{expanded ? "접기 −" : "펼치기 +"}</b></button>{expanded ? <div className="sourcing-section-content">{children}</div> : null}</section>;
}

function Field({ label, help, required, wide, children }: { label: string; help?: string; required?: boolean; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? "wide" : undefined}><span>{label}{required ? " *" : ""}</span>{children}{help && <small>{help}</small>}</label>;
}

function ReviewTypeSummary({ title, types }: { title: string; types: Array<{ term: string; count: number }> }) {
  return <div><strong>{title}</strong><div>{types.length ? types.map(({ term, count }) => <span key={term}>{term} <b>{count}건 · {count >= 2 ? "반복" : "개별"}</b></span>) : <small>분류된 유형이 없습니다. 원문을 직접 확인하세요.</small>}</div></div>;
}

function ReviewEvidenceList({ title, examples }: { title: string; examples: string[] }) {
  return <section><strong>{title}</strong>{examples.length ? <ul>{examples.map((example, index) => <li key={`${index}-${example}`}>{example}</li>)}</ul> : <small>해당 리뷰가 없습니다.</small>}</section>;
}

function FormattedNumberInput({ value, onChange, placeholder }: { value: number | null; onChange: (value: number | null) => void; placeholder?: string }) {
  return <input inputMode="numeric" value={value == null ? "" : formatNumber(value)} onChange={(event) => {
    const digits = event.target.value.replace(/\D/g, "");
    onChange(digits ? Number(digits) : null);
  }} placeholder={placeholder} />;
}
function NumberInput({ value, onChange, placeholder }: { value: number | null; onChange: (value: number | null) => void; placeholder?: string }) {
  return <FormattedNumberInput value={value} onChange={onChange} placeholder={placeholder} />;
}
function PreferenceBadge({ met, metText, pendingText }: { met: boolean; metText: string; pendingText: string }) {
  return <span className={`sourcing-preference ${met ? "met" : "pending"}`}>{met ? metText : pendingText}</span>;
}

function SignalQuestion({ label, description, preferred, value, onChange }: { label: string; description: string; preferred: "yes" | "no"; value: SourcingResearchSignal; onChange: (value: SourcingResearchSignal) => void }) {
  const favorable = value !== "unknown" && value === preferred;
  return <div className="sourcing-signal"><div className="sourcing-signal-copy"><strong>{label}</strong><p>{description}</p></div><div className="sourcing-signal-actions" role="group" aria-label={label}>{(["yes", "no", "unknown"] as const).map((option) => <button type="button" key={option} className={value === option ? "active" : undefined} onClick={() => onChange(option)}>{option === "yes" ? "예" : option === "no" ? "아니오" : "미확인"}</button>)}</div><span className={`sourcing-signal-result ${value === "unknown" ? "unknown" : favorable ? "favorable" : "caution"}`}>{value === "unknown" ? "확인 필요" : favorable ? "선호 조건" : "주의 조건"}</span></div>;
}

function emptyResearch(): SourcingResearchInput {
  return { status: "researching", sourcingKeyword: "", monthlySearchVolume: null, sixMonthRevenue: null, marketNotes: "", naverCategory: null, coupangAveragePrice: null, naverAveragePrice: null, expectedSellingPrice: null, signals: { ...defaultSourcingSignals }, finalSellingPoint: "", positiveReviews: "", negativeReviews: "", customerNeeds: "", productSpecs: "", primaryTarget: "", referenceNotes: "", reviewEntries: [storedReview()], relatedKeywords: [], samples: [] };
}
function recordToInput(record: SourcingResearchRecord): SourcingResearchInput {
  return {
    status: record.status,
    sourcingKeyword: record.sourcingKeyword,
    monthlySearchVolume: record.monthlySearchVolume,
    sixMonthRevenue: record.sixMonthRevenue,
    marketNotes: record.marketNotes,
    naverCategory: record.naverCategory,
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
    reviewEntries: record.reviewEntries.length ? record.reviewEntries : [storedReview()],
    relatedKeywords: record.relatedKeywords ?? [],
    samples: record.samples,
  };
}
function formatNumber(value: number | null) { return value == null ? "미입력" : new Intl.NumberFormat("ko-KR").format(value); }
function formatManwon(value: number | null) { return value == null ? "미입력" : `${(value / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만원`; }
function categoryFitAssessment(result: KeywordExposureResult | undefined) {
  if (!result || result.status !== "completed" || result.productCount < 1) {
    return {
      level: "unknown" as const,
      count: 0,
      percent: 0,
      label: "미분석",
    };
  }
  const percent = Math.round(
    result.contextCategoryMatchCount / result.productCount * 100,
  );
  if (percent < 20) {
    return {
      level: "poor" as const,
      count: result.contextCategoryMatchCount,
      percent,
      label: "삭제 검토",
    };
  }
  if (percent < 50) {
    return {
      level: "mixed" as const,
      count: result.contextCategoryMatchCount,
      percent,
      label: "카테고리 혼합",
    };
  }
  return {
    level: "good" as const,
    count: result.contextCategoryMatchCount,
    percent,
    label: "일치 다수",
  };
}
function shouldReviewKeywordDeletion(
  item: SourcingRelatedKeyword,
  result: KeywordExposureResult | undefined,
) {
  return categoryFitAssessment(result).level === "poor" &&
    !item.officialAttribute &&
    !item.officialTag;
}
function dominantOtherCategory(result: KeywordExposureResult) {
  const selected = normalizeKeywordText(result.contextCategoryName);
  return result.categoryDistribution.find((entry) => {
    const category = normalizeKeywordText(entry.category);
    return category && (!selected || !category.includes(selected));
  }) ?? null;
}
async function api<T, I = never>(url: string, init?: RequestInit): Promise<{ data?: T; items?: I }> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json() as { data?: T; items?: I; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "요청을 처리하지 못했습니다.");
  return body;
}

async function loadNaverOfficialAttributeContext(
  category: SourcingNaverCategory,
): Promise<OfficialAttributeContext | null> {
  const requirementsResponse = await fetch(
    `/api/integrations/naver/category-requirements?categoryId=${encodeURIComponent(category.id)}`,
    { cache: "no-store" },
  );
  const requirementsBody = (await requirementsResponse.json().catch(() => null)) as {
    requirements?: Pick<
      OfficialAttributeContext,
      "attributes" | "attributeValues"
    >;
    error?: { message?: string };
  } | null;
  if (!requirementsResponse.ok || !requirementsBody?.requirements) {
    throw new Error(
      requirementsBody?.error?.message ?? "선택 카테고리의 공식 속성을 확인하지 못했습니다.",
    );
  }
  return {
    category,
    attributes: requirementsBody.requirements.attributes,
    attributeValues: requirementsBody.requirements.attributeValues,
  };
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : "요청을 처리하지 못했습니다."; }

const generatedReviewMarker = "[규칙 기반 리뷰 분석]";
function replaceGeneratedReviewSection(current: string, generated: string) {
  const manual = current.split(generatedReviewMarker)[0]!.trim();
  const section = generated.trim() ? `${generatedReviewMarker}\n${generated.trim()}` : "";
  return [manual, section].filter(Boolean).join("\n\n");
}
