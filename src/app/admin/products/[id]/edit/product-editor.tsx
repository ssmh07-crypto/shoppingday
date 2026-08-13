"use client";
/* eslint-disable @next/next/no-img-element -- supplier URLs are intentionally loaded directly; no image storage/optimizer proxy */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { NaverProductAttribute, SelectedImage } from "@/lib/db/schema";
import { buildSourcingRegistrationDraft } from "@/modules/sourcing/registration-draft";
import {
  assessSearchTag,
  isBlockingSearchTagIssue,
} from "@/modules/keywords/search-tag-quality";
import {
  detectProductTitleAnalysis,
  type ProductTitleAnalysisCriteria,
} from "@/modules/keywords/product-title-analysis";
import type {
  NaverCategoryOption,
  ProductEditorInitial,
  ProductEditorMarketData,
  SourcingRegistrationContext,
} from "./product-editor-types";

const OptionEditor = dynamic(
  () => import("./option-editor").then((module) => module.OptionEditor),
  { loading: () => <PanelLoading label="옵션 편집기" /> },
);
const MarginCalculator = dynamic(
  () => import("./margin-calculator").then((module) => module.MarginCalculator),
  { loading: () => <PanelLoading label="마진 계산기" /> },
);
const NaverAttributeEditor = dynamic(
  () =>
    import("./naver-attribute-editor").then(
      (module) => module.NaverAttributeEditor,
    ),
  { loading: () => <PanelLoading label="네이버 속성 편집기" /> },
);
const NaverPublicationPolicyForm = dynamic(
  () =>
    import("@/app/admin/components/naver-publication-policy-form").then(
      (module) => module.NaverPublicationPolicyForm,
    ),
  { loading: () => <PanelLoading label="판매 정책 편집기" /> },
);

type EditorTab = "basic" | "content" | "attributes" | "market";
type CategoryRequirements = {
  categoryId: string;
  attributes: Array<{
    attributeSeq: number;
    attributeName: string;
    attributeClassificationType?: "SINGLE_SELECT" | "MULTI_SELECT" | "RANGE";
    unitUsable?: boolean;
    representativeUnitCode?: string;
    attributeValueMaxMatchingCount?: number;
  }>;
  requiredAttributes: Array<{
    attributeSeq: number;
    attributeName: string;
    attributeClassificationType?: "SINGLE_SELECT" | "MULTI_SELECT" | "RANGE";
    unitUsable?: boolean;
    representativeUnitCode?: string;
    attributeValueMaxMatchingCount?: number;
  }>;
  attributeValues: Array<{
    attributeSeq: number;
    attributeValueSeq: number;
    minAttributeValue?: string;
    minAttributeValueUnitCode?: string;
    maxAttributeValue?: string;
    maxAttributeValueUnitCode?: string;
    exposureOrder?: number;
  }>;
  units: Array<{ id: string; unitCodeName: string }>;
  standardOptions: {
    useStandardOption: boolean;
    standardOptionCategoryGroups: Array<{
      attributeName: string;
      groupName?: string;
      optionSetRequired: boolean;
    }>;
  };
  requiredOptionGroups: Array<{
    attributeName: string;
    groupName?: string;
    optionSetRequired: boolean;
  }>;
  stale: boolean;
};

type PublicationInspection = {
  ready: boolean;
  issues?: Array<{ path: string; message: string }>;
  payloadHash?: string;
  action?: "create" | "retry_create" | "update" | "unchanged" | "blocked";
  publication: {
    status: "publishing" | "published" | "failed" | "deleting" | "deleted";
    originProductNo: string | null;
    channelProductNo: string | null;
    remoteStatusType: "SALE" | "OUTOFSTOCK" | "SUSPENSION" | "DELETE" | null;
    attemptCount: number;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    lastErrorHttpStatus: number | null;
    lastAttemptedAt: string;
    publishedAt: string | null;
    lastSyncedAt: string | null;
  } | null;
};

type TitleRecommendation = {
  title: string;
  source: "rules" | "rules_naver_search_ad" | "sourcing_rules";
  analysis: {
    productType: string;
    materials: string[];
    uses: string[];
    modifiers: string[];
    removedTerms: string[];
  };
  keywordEvidence: Array<{
    keyword: string;
    totalMonthlySearchVolume: number | null;
    competition: "low" | "medium" | "high" | "unknown";
    status: "success" | "not-found" | "error";
  }>;
  relatedKeywords: Array<{
    keyword: string;
    totalMonthlySearchVolume: number | null;
    competition?: "low" | "medium" | "high" | "unknown";
    status?: "success" | "not-found" | "error";
  }>;
  notices: string[];
};

type ProductTitleAnalysisDraft = {
  productType: string;
  materials: string;
  uses: string;
  modifiers: string;
  removedTerms: string;
};

type SupplierSourceCandidate = {
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

export function ProductEditor({
  initial,
  onMutated,
  onDirtyChange,
  registrationContext,
}: {
  initial: ProductEditorInitial;
  onMutated?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  registrationContext?: SourcingRegistrationContext;
}) {
  const [form, setForm] = useState(() => fromInitial(initial));
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify(fromInitial(initial)),
  );
  const [activeSupplier, setActiveSupplier] = useState(initial.supplier);
  const [activeTab, setActiveTab] = useState<EditorTab>("basic");
  const [status, setStatus] = useState(initial.product.status);
  const [saving, setSaving] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [publishingNaver, setPublishingNaver] = useState(false);
  const [syncingNaver, setSyncingNaver] = useState(false);
  const [marketData, setMarketData] = useState<ProductEditorMarketData | null>(
    () =>
      initial.naverPublicationPolicy &&
      initial.naverStoreConnections &&
      initial.naverDeliveryPolicies
        ? {
            naverPublicationPolicy: initial.naverPublicationPolicy,
            naverStoreConnections: initial.naverStoreConnections,
            naverDeliveryPolicies: initial.naverDeliveryPolicies,
            naverStoreConnectionId: initial.naverStoreConnectionId ?? null,
          }
        : null,
  );
  const [marketDataStatus, setMarketDataStatus] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState(
    initial.naverStoreConnectionId ?? "",
  );
  const [savingStoreTarget, setSavingStoreTarget] = useState(false);
  const [selectedDeliveryPolicyId, setSelectedDeliveryPolicyId] = useState(
    initial.naverPublicationPolicy?.deliveryPolicy?.id ?? "",
  );
  const [savingDeliveryPolicy, setSavingDeliveryPolicy] = useState(false);
  const [recommendingTitle, setRecommendingTitle] = useState(false);
  const [titleRecommendation, setTitleRecommendation] =
    useState<TitleRecommendation | null>(null);
  const [titleRecommendationStatus, setTitleRecommendationStatus] =
    useState("");
  const [titleAnalysisCriteria, setTitleAnalysisCriteria] =
    useState<ProductTitleAnalysisDraft>(() =>
      toProductTitleAnalysisDraft(
        detectProductTitleAnalysis({
          title: initial.product.title,
          originalTitle: activeSupplier.originalName ?? "",
          categoryPath: initial.naverCategory?.wholeCategoryName ?? "",
        }),
      ),
    );
  const [titleAnalysisStatus, setTitleAnalysisStatus] = useState(
    "판매용 상품명과 카테고리에서 자동 감지했습니다. 추천 전에 수정할 수 있습니다.",
  );
  const [selectedSourcingTitleKeywords, setSelectedSourcingTitleKeywords] =
    useState<string[]>(() =>
      registrationContext
        ? buildSourcingRegistrationDraft(
            registrationContext.sourcingKeyword,
            registrationContext.relatedKeywords,
          ).usedTitleKeywords
        : [],
    );
  const [sourcingTitleKeywordQuery, setSourcingTitleKeywordQuery] =
    useState("");
  const [showAllSourcingTitleKeywords, setShowAllSourcingTitleKeywords] =
    useState(false);
  const [tagSelectionStatus, setTagSelectionStatus] = useState("");
  const [message, setMessage] = useState("저장됨");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [detailImageUrls, setDetailImageUrls] = useState("");
  const [supplierSourceQuery, setSupplierSourceQuery] = useState("");
  const [supplierSourceCandidates, setSupplierSourceCandidates] = useState<
    SupplierSourceCandidate[]
  >([]);
  const [searchingSupplierSource, setSearchingSupplierSource] =
    useState(false);
  const [applyingSupplierSourceId, setApplyingSupplierSourceId] = useState<
    string | null
  >(null);
  const [supplierSourceStatus, setSupplierSourceStatus] = useState("");
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [imageDropTargetId, setImageDropTargetId] = useState<string | null>(
    null,
  );
  const [naverCategorySearch, setNaverCategorySearch] = useState("");
  const [naverCategoryResults, setNaverCategoryResults] = useState<
    NaverCategoryOption[]
  >([]);
  const [selectedNaverCategory, setSelectedNaverCategory] =
    useState<NaverCategoryOption | null>(
      initial.naverCategory ? { ...initial.naverCategory, last: true } : null,
    );
  const [categorySearchStatus, setCategorySearchStatus] = useState("");
  const [categoryRecommendationStatus, setCategoryRecommendationStatus] =
    useState("");
  const [applyCategoryQueryToTitle, setApplyCategoryQueryToTitle] = useState(
    initial.settings.applyCategoryQueryToTitleByDefault,
  );
  const [categorySearchQuery, setCategorySearchQuery] = useState("");
  const [categoryRequirements, setCategoryRequirements] =
    useState<CategoryRequirements | null>(null);
  const [categoryRequirementsStatus, setCategoryRequirementsStatus] =
    useState("");
  const [categoryRequirementsFailed, setCategoryRequirementsFailed] =
    useState(false);
  const [categoryRequirementsRefreshKey, setCategoryRequirementsRefreshKey] =
    useState(0);
  const [optionEditorOpen, setOptionEditorOpen] = useState(
    initial.product.editedOptions.groups.length > 0,
  );
  const [publicationInspection, setPublicationInspection] =
    useState<PublicationInspection | null>(null);
  const [publicationInspectionStatus, setPublicationInspectionStatus] =
    useState("");
  const [publicationRefreshKey, setPublicationRefreshKey] = useState(0);
  const autoRecommendationStarted = useRef(false);
  const publicationLoadedKey = useRef(-1);
  const categoryRecommendationController = useRef<AbortController | null>(null);
  const titleBeforeCategoryQuery = useRef(initial.product.title);
  const dirty = JSON.stringify(form) !== baseline;
  const margin = useMemo(
    () =>
      form.sellingPrice && activeSupplier.supplierPrice
        ? form.sellingPrice - Number(activeSupplier.supplierPrice)
        : null,
    [form.sellingPrice, activeSupplier.supplierPrice],
  );

  async function selectStoreTarget(storeConnectionId: string) {
    setSelectedStoreId(storeConnectionId);
    setSavingStoreTarget(true);
    setMessage("발행 대상 스토어를 변경하는 중입니다.");
    try {
      const response = await fetch(
        `/api/products/${initial.product.id}/naver-store-target`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ storeConnectionId }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "발행 대상 스토어를 변경하지 못했습니다.",
        );
      }
      window.location.reload();
    } catch (error) {
      setSelectedStoreId(initial.naverStoreConnectionId ?? "");
      setMessage(
        error instanceof Error
          ? error.message
          : "발행 대상 스토어를 변경하지 못했습니다.",
      );
      setSavingStoreTarget(false);
    }
  }

  async function selectDeliveryPolicy(deliveryPolicyId: string) {
    const previousDeliveryPolicyId = selectedDeliveryPolicyId;
    setSelectedDeliveryPolicyId(deliveryPolicyId);
    setSavingDeliveryPolicy(true);
    setMessage("배송정책을 변경하는 중입니다.");
    try {
      const response = await fetch(
        `/api/products/${initial.product.id}/naver-delivery-policy`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deliveryPolicyId }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "배송정책을 변경하지 못했습니다.",
        );
      }
      setMessage(
        `배송정책 ${body.policy.policyCode} · ${body.policy.name}을 선택했습니다.`,
      );
      setPublicationRefreshKey((current) => current + 1);
    } catch (error) {
      setSelectedDeliveryPolicyId(previousDeliveryPolicyId);
      setMessage(
        error instanceof Error
          ? error.message
          : "배송정책을 변경하지 못했습니다.",
      );
    } finally {
      setSavingDeliveryPolicy(false);
    }
  }
  const sourcingRegistrationDraft = useMemo(
    () =>
      registrationContext
        ? buildSourcingRegistrationDraft(
            registrationContext.sourcingKeyword,
            registrationContext.relatedKeywords,
          )
        : null,
    [registrationContext],
  );
  const sourcingTitleCandidateGroups = useMemo(() => {
    if (!sourcingRegistrationDraft) {
      return { automatic: [], confirmationRequired: [] };
    }
    const query = normalizeCandidateSearch(sourcingTitleKeywordQuery);
    const filtered = sourcingRegistrationDraft.titleCandidateDetails.filter(
      (candidate) =>
        !query || normalizeCandidateSearch(candidate.keyword).includes(query),
    );
    return {
      automatic: filtered.filter(
        (candidate) => candidate.connection === "automatic",
      ),
      confirmationRequired: filtered.filter(
        (candidate) => candidate.connection === "confirmation_required",
      ),
    };
  }, [sourcingRegistrationDraft, sourcingTitleKeywordQuery]);

  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    addEventListener("beforeunload", listener);
    return () => removeEventListener("beforeunload", listener);
  }, [dirty]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (
      !["attributes", "market"].includes(activeTab) ||
      !form.naverCategoryId
    ) {
      return;
    }
    if (categoryRequirements?.categoryId === form.naverCategoryId) {
      return;
    }
    const controller = new AbortController();
    async function loadRequirements(categoryId: string) {
      setCategoryRequirements(null);
      setCategoryRequirementsFailed(false);
      setCategoryRequirementsStatus("카테고리 필수정보를 확인하는 중입니다.");
      try {
        const url = `/api/integrations/naver/category-requirements?categoryId=${encodeURIComponent(categoryId)}`;
        let response = await fetch(url, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok && response.status >= 500) {
          response = await fetch(url, {
            signal: controller.signal,
            cache: "no-store",
          });
        }
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            body?.error?.message ?? "카테고리 필수정보를 조회하지 못했습니다.",
          );
        }
        setCategoryRequirements(body.requirements);
        setCategoryRequirementsStatus("");
      } catch (error) {
        if (controller.signal.aborted) return;
        setCategoryRequirementsFailed(true);
        setCategoryRequirementsStatus(
          error instanceof Error
            ? error.message
            : "카테고리 필수정보를 조회하지 못했습니다.",
        );
      }
    }
    void loadRequirements(form.naverCategoryId);
    return () => controller.abort();
  }, [
    activeTab,
    categoryRequirements?.categoryId,
    form.naverCategoryId,
    categoryRequirementsRefreshKey,
  ]);

  useEffect(() => {
    if (activeTab !== "market") return;
    if (marketData) return;
    const controller = new AbortController();
    async function loadMarketData() {
      setMarketDataStatus("스토어와 판매 정책을 불러오는 중입니다.");
      try {
        const response = await fetch(
          `/api/products/${initial.product.id}/market-settings`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            body?.error?.message ?? "스토어와 판매 정책을 불러오지 못했습니다.",
          );
        }
        const data = body.data as ProductEditorMarketData;
        setMarketData(data);
        setSelectedStoreId(data.naverStoreConnectionId ?? "");
        setSelectedDeliveryPolicyId(
          data.naverPublicationPolicy.deliveryPolicy?.id ?? "",
        );
        setMarketDataStatus("");
      } catch (error) {
        if (controller.signal.aborted) return;
        setMarketDataStatus(
          error instanceof Error
            ? error.message
            : "스토어와 판매 정책을 불러오지 못했습니다.",
        );
      }
    }
    void loadMarketData();
    return () => controller.abort();
  }, [activeTab, initial.product.id, marketData]);

  useEffect(() => {
    if (activeTab !== "market") return;
    if (
      publicationInspection &&
      publicationLoadedKey.current === publicationRefreshKey
    ) {
      return;
    }
    const controller = new AbortController();
    setPublicationInspectionStatus("발행 준비 상태를 확인하는 중입니다.");
    void fetch(`/api/products/${initial.product.id}/naver-publication`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            body?.error?.message ?? "발행 준비 상태를 확인하지 못했습니다.",
          );
        }
        publicationLoadedKey.current = publicationRefreshKey;
        setPublicationInspection(body.inspection);
        setPublicationInspectionStatus("");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        publicationLoadedKey.current = -1;
        setPublicationInspection(null);
        setPublicationInspectionStatus(
          error instanceof Error
            ? error.message
            : "발행 준비 상태를 확인하지 못했습니다.",
        );
      });
    return () => controller.abort();
  }, [
    activeTab,
    initial.product.id,
    publicationInspection,
    publicationRefreshKey,
  ]);

  useEffect(() => {
    const search = naverCategorySearch.trim();
    if (search.length < 1) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setCategorySearchStatus("검색 중");
      try {
        const response = await fetch(
          `/api/integrations/naver/categories?search=${encodeURIComponent(search)}&leafOnly=true&limit=20`,
          { signal: controller.signal },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error?.message ?? "카테고리를 검색하지 못했습니다.",
          );
        setNaverCategoryResults(body.categories ?? []);
        setCategorySearchStatus(
          body.categories?.length ? "" : "검색 결과가 없습니다.",
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setNaverCategoryResults([]);
        setCategorySearchStatus(
          error instanceof Error
            ? error.message
            : "카테고리를 검색하지 못했습니다.",
        );
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [naverCategorySearch]);

  const recommendNaverCategory = useCallback(
    async (productName: string, applyQueryOverride?: boolean) => {
      const name = productName.trim();
      if (name.length < 2) {
        setCategoryRecommendationStatus("상품명을 두 글자 이상 입력해 주세요.");
        return;
      }
      categoryRecommendationController.current?.abort();
      const controller = new AbortController();
      categoryRecommendationController.current = controller;
      setCategoryRecommendationStatus("상품명으로 카테고리를 찾는 중입니다.");
      try {
        const response = await fetch(
          `/api/integrations/naver/categories/recommend?productName=${encodeURIComponent(name)}`,
          { signal: controller.signal },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error?.message ?? "카테고리를 추천하지 못했습니다.",
          );
        const recommendation = body.recommendation as {
          category: NaverCategoryOption;
          source: string;
          evidence?: { votes: number; sampleSize: number; query?: string };
        } | null;
        if (!recommendation) {
          setCategoryRecommendationStatus(
            "자동 추천 결과가 없습니다. 직접 검색해 주세요.",
          );
          return;
        }
        setSelectedNaverCategory(recommendation.category);
        const relaxedQuery = recommendation.evidence?.query?.trim() ?? "";
        const shouldApplyQuery =
          applyQueryOverride ?? applyCategoryQueryToTitle;
        setCategorySearchQuery(relaxedQuery);
        setForm((current) => {
          if (shouldApplyQuery && relaxedQuery) {
            titleBeforeCategoryQuery.current = current.title;
          }
          return {
            ...current,
            ...(shouldApplyQuery && relaxedQuery
              ? { title: relaxedQuery }
              : {}),
            naverCategoryId: recommendation.category.id,
            naverAttributes:
              current.naverCategoryId === recommendation.category.id
                ? current.naverAttributes
                : [],
          };
        });
        setCategoryRecommendationStatus(
          recommendation.source === "naver_catalog"
            ? recommendation.evidence
              ? `네이버 카탈로그 ${recommendation.evidence.sampleSize}개 중 ${recommendation.evidence.votes}개의 다수 카테고리를 적용했습니다.${recommendation.evidence.query && recommendation.evidence.query !== name ? ` 검색어: ${recommendation.evidence.query}` : ""}`
              : "네이버 카탈로그를 기준으로 자동 적용했습니다."
            : recommendation.source === "title_rule"
              ? "상품의 보관·거치 용도를 기준으로 자동 적용했습니다."
              : "동기화된 카테고리를 기준으로 자동 적용했습니다.",
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setCategoryRecommendationStatus(
          error instanceof Error
            ? error.message
            : "카테고리를 추천하지 못했습니다.",
        );
      } finally {
        if (categoryRecommendationController.current === controller) {
          categoryRecommendationController.current = null;
        }
      }
    },
    [applyCategoryQueryToTitle],
  );

  useEffect(() => () => categoryRecommendationController.current?.abort(), []);

  useEffect(() => {
    if (
      autoRecommendationStarted.current ||
      initial.product.naverCategoryId ||
      initial.product.title.trim().length < 2
    )
      return;
    autoRecommendationStarted.current = true;
    void recommendNaverCategory(initial.product.title);
  }, [
    initial.product.naverCategoryId,
    initial.product.title,
    recommendNaverCategory,
  ]);

  async function submit(action: "draft" | "ready" | "revert-to-draft") {
    if (registrationContext && form.title.trim().length > 50) {
      setErrors({
        title: "상품명은 50자를 넘길 수 없습니다.",
      });
      setMessage("상품명을 50자 이하로 줄여 주세요.");
      return null;
    }
    setSaving(true);
    setErrors({});
    setMessage("저장 중…");
    try {
      const response = await fetch(
        `/api/products/${initial.product.id}/${action}`,
        {
          method: action === "draft" ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        setErrors(body.error?.errors ?? {});
        throw new Error(body.error?.message ?? "저장에 실패했습니다.");
      }
      const product = body.data.product;
      const next = { ...form, draftVersion: product.draftVersion };
      setForm(next);
      setBaseline(JSON.stringify(next));
      setStatus(product.status);
      setMessage(`저장 완료 ${new Date().toLocaleTimeString("ko-KR")}`);
      onMutated?.();
      return product;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function changeTab(nextTab: EditorTab) {
    if (nextTab === activeTab || saving) return;
    if (dirty && !(await submit("draft"))) return;
    setActiveTab(nextTab);
  }

  async function searchSupplierSource() {
    const query = supplierSourceQuery.trim();
    if (!query) {
      setSupplierSourceStatus("직감 상품명, 상품번호 또는 상세페이지 URL을 입력해 주세요.");
      return;
    }
    setSearchingSupplierSource(true);
    setSupplierSourceStatus("직감 상품을 찾는 중…");
    try {
      const response = await fetch(
        `/api/products/${initial.product.id}/supplier-source?q=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "직감 상품을 검색하지 못했습니다.",
        );
      }
      const candidates = (body.items ?? []) as SupplierSourceCandidate[];
      setSupplierSourceCandidates(candidates);
      setSupplierSourceStatus(
        candidates.length
          ? `직감 상품 ${candidates.length}개를 찾았습니다.`
          : "수집된 직감 상품에서 일치하는 항목을 찾지 못했습니다. 직감 상품을 먼저 가져온 뒤 다시 검색해 주세요.",
      );
    } catch (error) {
      setSupplierSourceCandidates([]);
      setSupplierSourceStatus(
        error instanceof Error
          ? error.message
          : "직감 상품을 검색하지 못했습니다.",
      );
    } finally {
      setSearchingSupplierSource(false);
    }
  }

  async function applySupplierSource(candidate: SupplierSourceCandidate) {
    if (
      !confirm(
        `'${candidate.originalName}'의 이미지, 상세페이지와 옵션을 가져올까요?\n\n현재 이미지·상세설명·옵션 편집 내용은 덮어쓰지만 상품명·검색태그·판매가·카테고리는 유지합니다.`,
      )
    ) {
      return;
    }
    if (dirty && !(await submit("draft"))) return;
    setApplyingSupplierSourceId(candidate.supplierProductId);
    setSupplierSourceStatus("직감 상품 데이터를 가져오는 중…");
    try {
      const response = await fetch(
        `/api/products/${initial.product.id}/supplier-source`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            supplierProductId: candidate.supplierProductId,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data?.product) {
        throw new Error(
          body?.error?.message ?? "직감 상품 데이터를 가져오지 못했습니다.",
        );
      }
      const imported = body.data.product;
      const next = {
        ...form,
        draftVersion: imported.draftVersion,
        description: imported.description,
        selectedImages: imported.selectedImages,
        editedOptions: imported.editedOptions,
      };
      setForm(next);
      setBaseline(JSON.stringify(next));
      setStatus(imported.status);
      setActiveSupplier((current) => ({
        ...current,
        externalProductId: body.data.source.externalProductId,
        originalName: body.data.source.originalName,
        supplierPrice:
          body.data.source.supplierPrice == null
            ? null
            : String(body.data.source.supplierPrice),
        currency: body.data.source.currency,
        availability: body.data.source.availability,
      }));
      setOptionEditorOpen(imported.editedOptions.groups.length > 0);
      setSupplierSourceStatus(
        `${candidate.originalName}에서 이미지 ${body.data.source.imageCount}개, 상세페이지${body.data.source.hasDescription ? " 있음" : " 없음"}, 옵션 ${body.data.source.optionCount}개를 가져왔습니다.`,
      );
      setMessage("직감 상품 데이터를 등록 초안에 저장했습니다.");
      onMutated?.();
    } catch (error) {
      setSupplierSourceStatus(
        error instanceof Error
          ? error.message
          : "직감 상품 데이터를 가져오지 못했습니다.",
      );
    } finally {
      setApplyingSupplierSourceId(null);
    }
  }

  async function resetImages() {
    if (
      !confirm(
        "공급처 원본 이미지로 초기화할까요? 현재 이미지 편집 내용이 덮어써집니다.",
      )
    )
      return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/products/${initial.product.id}/reset-images`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ draftVersion: form.draftVersion }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? "초기화에 실패했습니다.");
      const next = {
        ...form,
        draftVersion: body.data.product.draftVersion,
        selectedImages: body.data.product.selectedImages,
      };
      setForm(next);
      setBaseline(JSON.stringify(next));
      setStatus(body.data.product.status);
      setMessage("원본 이미지로 초기화했습니다.");
      onMutated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "초기화 실패");
    } finally {
      setSaving(false);
    }
  }

  function currentTitleCategoryPath() {
    return selectedNaverCategory?.id === form.naverCategoryId
      ? selectedNaverCategory.wholeCategoryName
      : initial.naverCategory?.id === form.naverCategoryId
        ? initial.naverCategory.wholeCategoryName
        : "";
  }

  function redetectTitleAnalysis() {
    const detected = detectProductTitleAnalysis({
      title: form.title,
      originalTitle: activeSupplier.originalName ?? "",
      categoryPath: currentTitleCategoryPath(),
    });
    setTitleAnalysisCriteria(toProductTitleAnalysisDraft(detected));
    setTitleRecommendation(null);
    setTitleRecommendationStatus("");
    setTitleAnalysisStatus(
      detected.productType
        ? "현재 상품명과 카테고리 기준으로 다시 감지했습니다."
        : "상품 유형을 자동으로 확정하지 못했습니다. 실제 상품 유형을 직접 입력해 주세요.",
    );
  }

  function updateTitleAnalysisCriteria(next: ProductTitleAnalysisDraft) {
    setTitleAnalysisCriteria(next);
    setTitleRecommendation(null);
    setTitleRecommendationStatus("");
    setTitleAnalysisStatus(
      "수정한 분석 기준을 다음 상품명·검색 키워드 추천에 사용합니다.",
    );
  }

  function toggleSourcingTitleKeyword(keyword: string) {
    setSelectedSourcingTitleKeywords((current) =>
      current.includes(keyword)
        ? current.filter((item) => item !== keyword)
        : [...current, keyword],
    );
    setTitleRecommendation(null);
    setTitleRecommendationStatus("");
  }

  function resetSourcingTitleKeywordsToRecommended() {
    setSelectedSourcingTitleKeywords(
      sourcingRegistrationDraft?.usedTitleKeywords ?? [],
    );
    setTitleRecommendation(null);
    setTitleRecommendationStatus("");
  }

  async function recommendProductTitle() {
    const title = form.title.trim();
    if (registrationContext && sourcingRegistrationDraft) {
      setRecommendingTitle(true);
      setTitleRecommendation(null);
      setTitleRecommendationStatus(
        "소싱 키워드 분류와 검색 품질 규칙을 적용하는 중입니다.",
      );
      const draft = buildSourcingRegistrationDraft(
        registrationContext.sourcingKeyword,
        registrationContext.relatedKeywords,
        { selectedTitleKeywords: selectedSourcingTitleKeywords },
      );
      if (!draft.title) {
        setTitleRecommendationStatus(
          "추천에 사용할 상품명 키워드를 하나 이상 선택해 주세요.",
        );
        setRecommendingTitle(false);
        return;
      }
      setTitleRecommendation({
        title: draft.title,
        source: "sourcing_rules",
        analysis: {
          productType: registrationContext.sourcingKeyword,
          materials: [],
          uses: [],
          modifiers: [],
          removedTerms: [],
        },
        keywordEvidence: draft.usedTitleKeywords.map((keyword) => {
          const source = registrationContext.relatedKeywords.find(
            (item) =>
              item.placement === "product_name" && item.keyword === keyword,
          );
          return {
            keyword,
            totalMonthlySearchVolume: source?.monthlySearchVolume ?? null,
            competition: "unknown" as const,
            status:
              source?.monthlySearchVolume == null
                ? ("not-found" as const)
                : ("success" as const),
          };
        }),
        relatedKeywords: [],
        notices: draft.warnings,
      });
      setTitleRecommendationStatus("");
      setRecommendingTitle(false);
      return;
    }
    if (title.length < 2) {
      setTitleRecommendationStatus(
        "판매용 상품명을 두 글자 이상 입력해 주세요.",
      );
      return;
    }
    if (!titleAnalysisCriteria.productType.trim()) {
      setTitleRecommendationStatus(
        "상품 분석 기준에서 상품 유형을 입력해 주세요.",
      );
      return;
    }
    setRecommendingTitle(true);
    setTitleRecommendation(null);
    setTitleRecommendationStatus(
      "상품 구조를 분석하고 네이버 키워드 검색량을 확인하는 중입니다.",
    );
    try {
      const categoryPath = currentTitleCategoryPath();
      const response = await fetch(
        `/api/products/${initial.product.id}/title-recommendation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            originalTitle: activeSupplier.originalName ?? "",
            categoryPath,
            searchTags: form.searchTags
              .map((tag) => tag.trim())
              .filter(Boolean),
            analysisCriteria: fromProductTitleAnalysisDraft(
              titleAnalysisCriteria,
            ),
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "상품명을 추천하지 못했습니다.",
        );
      }
      setTitleRecommendation(body.recommendation);
      setTitleRecommendationStatus("");
    } catch (error) {
      setTitleRecommendationStatus(
        error instanceof Error
          ? error.message
          : "상품명을 추천하지 못했습니다.",
      );
    } finally {
      setRecommendingTitle(false);
    }
  }

  function toggleSearchTag(tag: string) {
    setForm((current) => {
      const normalized = tag.trim();
      const selected = current.searchTags.some(
        (item) => item.trim() === normalized,
      );
      if (selected) {
        setTagSelectionStatus("");
        return {
          ...current,
          searchTags: current.searchTags.filter(
            (item) => item.trim() !== normalized,
          ),
        };
      }
      if (current.searchTags.filter((item) => item.trim()).length >= 10) {
        setTagSelectionStatus("검색 태그는 최대 10개까지 선택할 수 있습니다.");
        return current;
      }
      setTagSelectionStatus("");
      return {
        ...current,
        searchTags: [
          ...current.searchTags.filter((item) => item.trim()),
          normalized,
        ],
      };
    });
  }

  function applyRecommendedSearchTags() {
    if (!titleRecommendation?.relatedKeywords.length) return;
    setForm((current) => {
      const existing = current.searchTags
        .map((item) => item.trim())
        .filter(Boolean);
      const candidates = titleRecommendation.relatedKeywords
        .map((item) => item.keyword.trim())
        .filter(
          (keyword) =>
            keyword &&
            !existing.includes(keyword) &&
            assessSearchTag(keyword, { title: current.title }).length === 0,
        );
      const added = candidates.slice(0, Math.max(0, 10 - existing.length));
      if (!added.length) {
        setTagSelectionStatus(
          existing.length >= 10
            ? "검색 태그는 최대 10개까지 선택할 수 있습니다."
            : "추가할 수 있는 새 추천 키워드가 없습니다.",
        );
        return current;
      }
      setTagSelectionStatus(
        `추천 키워드 ${added.length}개를 검색 태그에 적용했습니다.`,
      );
      return { ...current, searchTags: [...existing, ...added] };
    });
  }

  async function uploadNaverImages() {
    let draftVersion = form.draftVersion;
    if (dirty) {
      const saved = await submit("draft");
      if (!saved) return;
      draftVersion = saved.draftVersion;
    }
    setUploadingImages(true);
    setMessage("네이버에 이미지를 업로드하는 중…");
    try {
      const response = await fetch(
        `/api/products/${initial.product.id}/naver-images/upload`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ draftVersion }),
        },
      );
      const body = await response.json().catch(() => null);
      const uploadedProduct = body?.data?.product;
      if (uploadedProduct) {
        const next = {
          ...form,
          draftVersion: uploadedProduct.draftVersion,
          selectedImages: uploadedProduct.selectedImages,
        };
        setForm(next);
        setBaseline(JSON.stringify(next));
        setStatus(uploadedProduct.status);
        onMutated?.();
      }
      if (!response.ok) {
        setErrors(body?.error?.errors ?? {});
        throw new Error(
          body?.error?.message ?? "이미지 업로드에 실패했습니다.",
        );
      }
      const product = body.data.product;
      const next = {
        ...form,
        draftVersion: product.draftVersion,
        selectedImages: product.selectedImages,
      };
      setForm(next);
      setBaseline(JSON.stringify(next));
      setStatus(product.status);
      setMessage(
        body.data.uploadedCount || body.data.reusedCount
          ? [
              body.data.uploadedCount
                ? `네이버 이미지 ${body.data.uploadedCount}개 업로드`
                : "",
              body.data.reusedCount
                ? `기존 이미지 ${body.data.reusedCount}개 재사용`
                : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : "모든 이미지가 이미 업로드되어 있습니다.",
      );
      onMutated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "이미지 업로드 실패");
    } finally {
      setUploadingImages(false);
    }
  }

  async function publishToNaver() {
    if (dirty) {
      setMessage("변경사항을 먼저 저장한 뒤 등록해 주세요.");
      return;
    }
    setPublishingNaver(true);
    setErrors({});
    try {
      const inspection = publicationInspection;
      if (!inspection) {
        throw new Error("발행 준비 상태를 먼저 확인해 주세요.");
      }
      if (!inspection.ready || !inspection.payloadHash) {
        throw new Error("필수 상품 정보와 판매 정책을 먼저 입력해 주세요.");
      }
      if (
        !inspection.action ||
        !["create", "retry_create", "update"].includes(inspection.action)
      ) {
        throw new Error(
          inspection.action === "unchanged"
            ? "이미 최신 상태로 등록된 상품입니다."
            : "이전 등록 요청의 결과를 먼저 확인해 주세요.",
        );
      }
      const actionLabel =
        inspection.action === "update"
          ? "등록 상품 정보 수정"
          : inspection.action === "retry_create"
            ? "등록을 다시 시도"
            : "신규 등록";
      const confirmed = window.confirm(
        `[스마트스토어 실제 등록]\n\n상품명: ${form.title}\n판매가: ${Number(form.sellingPrice ?? 0).toLocaleString("ko-KR")}원\n작업: ${actionLabel}\n\n확인하면 네이버에 상품이 실제 등록되며 전시 정책에 따라 노출될 수 있습니다. 계속할까요?`,
      );
      if (!confirmed) return;

      setMessage("스마트스토어에 상품을 등록하는 중…");
      const response = await fetch(
        `/api/products/${initial.product.id}/naver-publication`,
        {
          method: inspection.action === "update" ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            confirmed: true,
            payloadHash: inspection.payloadHash,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setErrors(body?.error?.errors ?? {});
        throw new Error(
          body?.error?.message ?? "스마트스토어 등록에 실패했습니다.",
        );
      }
      const published = body.result?.publication;
      setMessage(
        inspection.action === "update"
          ? "스마트스토어 상품 변경사항을 반영했습니다."
          : published?.channelProductNo
            ? `스마트스토어 등록 완료 · 채널상품번호 ${published.channelProductNo}`
            : "스마트스토어 등록을 완료했습니다.",
      );
      onMutated?.();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "스마트스토어 등록 실패",
      );
    } finally {
      setPublishingNaver(false);
      setPublicationRefreshKey((current) => current + 1);
    }
  }

  async function syncFromNaver() {
    if (dirty) {
      setMessage("저장되지 않은 변경사항을 먼저 저장해 주세요.");
      return;
    }
    if (
      !window.confirm(
        "[스마트스토어 정보 불러오기]\n\n스마트스토어센터에서 직접 수정한 상품명, 판매가, 할인율, 카테고리, 검색 태그, 상품 속성을 현재 편집 정보에 반영합니다.\n\n배송 정책, 상세설명, 이미지, 옵션은 변경하지 않습니다. 계속할까요?",
      )
    ) {
      return;
    }
    setSyncingNaver(true);
    setErrors({});
    setMessage("스마트스토어의 최신 상품 정보를 불러오는 중…");
    try {
      const response = await fetch(
        `/api/products/${initial.product.id}/naver-sync`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            confirmed: true,
            draftVersion: form.draftVersion,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setErrors(body?.error?.errors ?? {});
        throw new Error(
          body?.error?.message ??
            "스마트스토어 상품 정보를 불러오지 못했습니다.",
        );
      }
      const product = body.result?.product;
      if (!product)
        throw new Error("동기화된 상품 정보를 확인하지 못했습니다.");
      const next = {
        ...form,
        draftVersion: product.draftVersion,
        title: product.title,
        searchTags: product.searchTags,
        sellingPrice: product.sellingPrice,
        naverCategoryId: product.naverCategoryId,
        naverAttributes: product.naverAttributes,
      };
      setForm(next);
      setBaseline(JSON.stringify(next));
      setStatus(product.status);
      if (body.remote?.category) {
        setSelectedNaverCategory(body.remote.category);
      }
      if (body.policy) {
        setMarketData((current) =>
          current
            ? {
                ...current,
                naverPublicationPolicy: body.policy,
              }
            : current,
        );
      }
      setCategoryRequirementsRefreshKey((current) => current + 1);
      setPublicationRefreshKey((current) => current + 1);
      setMessage(
        `스마트스토어 최신 정보를 반영했습니다.${
          body.remote?.stockQuantity == null
            ? ""
            : ` 현재 재고 ${Number(body.remote.stockQuantity).toLocaleString("ko-KR")}개`
        }`,
      );
      onMutated?.();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "스마트스토어 상품 정보를 불러오지 못했습니다.",
      );
    } finally {
      setSyncingNaver(false);
    }
  }

  async function changeNaverSaleStatus(
    statusType: "SALE" | "OUTOFSTOCK" | "SUSPENSION",
  ) {
    const labels = {
      SALE: "판매 재개",
      OUTOFSTOCK: "품절 처리",
      SUSPENSION: "판매 중지",
    } as const;
    if (
      !window.confirm(
        `[스마트스토어 ${labels[statusType]}]\n\n상품명: ${form.title}\n\n네이버 상품 상태를 실제로 변경할까요?`,
      )
    ) {
      return;
    }
    setPublishingNaver(true);
    setMessage(`스마트스토어 상품을 ${labels[statusType]}하는 중…`);
    try {
      const response = await fetch(
        `/api/products/${initial.product.id}/naver-publication`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmed: true, statusType }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ??
            "스마트스토어 판매 상태를 변경하지 못했습니다.",
        );
      }
      setMessage(`스마트스토어 상품을 ${labels[statusType]}했습니다.`);
      onMutated?.();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "스마트스토어 판매 상태를 변경하지 못했습니다.",
      );
    } finally {
      setPublishingNaver(false);
      setPublicationRefreshKey((current) => current + 1);
    }
  }

  async function deleteNaverProduct() {
    const confirmation = window.prompt(
      `[네이버 상품 완전 삭제]\n\n상품명: ${form.title}\n\n채널 상품과 원상품이 차례로 삭제되며 되돌릴 수 없습니다. 계속하려면 '삭제'를 입력하세요.`,
    );
    if (confirmation !== "삭제") return;
    setPublishingNaver(true);
    setMessage("스마트스토어 상품을 삭제하는 중…");
    try {
      const response = await fetch(
        `/api/products/${initial.product.id}/naver-publication`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmed: true }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "스마트스토어 상품을 삭제하지 못했습니다.",
        );
      }
      setMessage("스마트스토어 채널 상품과 원상품을 삭제했습니다.");
      onMutated?.();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "스마트스토어 상품을 삭제하지 못했습니다.",
      );
    } finally {
      setPublishingNaver(false);
      setPublicationRefreshKey((current) => current + 1);
    }
  }

  function imageChange(index: number, patch: Partial<SelectedImage>) {
    setForm((old) => ({
      ...old,
      selectedImages: old.selectedImages.map((image, imageIndex) =>
        imageIndex === index
          ? { ...image, ...patch }
          : patch.isPrimary
            ? { ...image, isPrimary: false }
            : image,
      ),
    }));
  }

  function moveImage(index: number, delta: number) {
    setForm((old) => {
      const selectedImages = [...old.selectedImages];
      const target = index + delta;
      if (target < 0 || target >= selectedImages.length) return old;
      [selectedImages[index], selectedImages[target]] = [
        selectedImages[target]!,
        selectedImages[index]!,
      ];
      return {
        ...old,
        selectedImages: selectedImages.map((image, sortOrder) => ({
          ...image,
          sortOrder,
        })),
      };
    });
  }

  function reorderImage(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    setForm((old) => {
      const selectedImages = [...old.selectedImages];
      const sourceIndex = selectedImages.findIndex(
        (image) => image.id === draggedId,
      );
      const targetIndex = selectedImages.findIndex(
        (image) => image.id === targetId,
      );
      if (sourceIndex < 0 || targetIndex < 0) return old;
      const [moved] = selectedImages.splice(sourceIndex, 1);
      selectedImages.splice(targetIndex, 0, moved!);
      return {
        ...old,
        selectedImages: selectedImages.map((image, sortOrder) => ({
          ...image,
          sortOrder,
        })),
      };
    });
  }

  function addThumbnailUrl() {
    const url = normalizeHttpUrl(thumbnailUrl);
    if (!url) {
      setMessage("http 또는 https로 시작하는 이미지 URL을 입력해 주세요.");
      return;
    }
    if (form.selectedImages.length >= 10) {
      setMessage(
        "상품 이미지는 대표 이미지 1개와 추가 이미지 9개, 총 10개까지 등록할 수 있습니다.",
      );
      return;
    }
    if (form.selectedImages.some((image) => image.sourceUrl === url)) {
      setMessage("이미 추가된 이미지 URL입니다.");
      return;
    }
    setForm((old) => ({
      ...old,
      selectedImages: [
        ...old.selectedImages,
        {
          id: crypto.randomUUID(),
          source: "url",
          sourceUrl: url,
          storedUrl: null,
          altText: old.title,
          sortOrder: old.selectedImages.length,
          isPrimary: !old.selectedImages.some(
            (image) => image.enabled && image.isPrimary,
          ),
          enabled: true,
        },
      ],
    }));
    setThumbnailUrl("");
    setMessage(
      "이미지 URL을 추가했습니다. 저장 후 네이버 이미지 업로드를 진행하세요.",
    );
  }

  function removeImage(index: number) {
    setForm((old) => {
      const removed = old.selectedImages[index];
      const selectedImages = old.selectedImages
        .filter((_, imageIndex) => imageIndex !== index)
        .map((image, sortOrder) => ({ ...image, sortOrder }));
      if (removed?.isPrimary) {
        const firstEnabled = selectedImages.find((image) => image.enabled);
        if (firstEnabled) firstEnabled.isPrimary = true;
      }
      return { ...old, selectedImages };
    });
  }

  function addDetailImageUrls() {
    const urls = detailImageUrls
      .split(/\r?\n/)
      .map(normalizeHttpUrl)
      .filter((url): url is string => Boolean(url));
    if (!urls.length) {
      setMessage("한 줄에 하나씩 상세 이미지 URL을 입력해 주세요.");
      return;
    }
    const imageHtml = [...new Set(urls)]
      .map((url) => `<p><img src="${url}" alt="" /></p>`)
      .join("\n");
    setForm((old) => ({
      ...old,
      description: [old.description.trim(), imageHtml]
        .filter(Boolean)
        .join("\n"),
    }));
    setDetailImageUrls("");
    setMessage(`${urls.length}개의 상세 이미지 URL을 추가했습니다.`);
  }

  const enabledImageCount = form.selectedImages.filter(
    (image) => image.enabled,
  ).length;
  const marketChecks = [
    {
      label: "네이버 최종 카테고리 지정",
      done: Boolean(form.naverCategoryId),
    },
    {
      label: "카테고리 필수 속성 입력",
      done: Boolean(
        categoryRequirements &&
        categoryRequirements.requiredAttributes.every((attribute) =>
          isNaverAttributeComplete(
            attribute,
            categoryRequirements.attributeValues,
            form.naverAttributes,
          ),
        ),
      ),
    },
    { label: "상품명 입력", done: Boolean(form.title.trim()) },
    { label: "판매가 입력", done: Boolean(form.sellingPrice) },
    {
      label: "네이버 대표 이미지 업로드",
      done: form.selectedImages.some(
        (image) => image.enabled && image.isPrimary && image.storedUrl,
      ),
    },
    { label: "상세페이지 입력", done: Boolean(form.description.trim()) },
  ];
  const readyForMarket = marketChecks.every((check) => check.done);

  return (
    <div className="drawer-editor">
      <div className="drawer-source-summary">
        <div>
          <span>상품번호</span>
          <strong>
            {activeSupplier.productNumberPrefix ?? ""}
            {activeSupplier.externalProductId}
          </strong>
        </div>
        <div>
          <span>공급가</span>
          <strong>{formatWon(activeSupplier.supplierPrice)}</strong>
        </div>
        <div>
          <span>공급 상태</span>
          <strong>
            {activeSupplier.availability === "sold_out"
              ? "품절"
              : "판매 가능"}
          </strong>
        </div>
      </div>

      <nav className="drawer-tabs" aria-label="상품 편집 단계">
        <TabButton
          active={activeTab === "basic"}
          disabled={saving}
          onClick={() => void changeTab("basic")}
          number="1"
          label="기본정보"
        />
        <TabButton
          active={activeTab === "content"}
          disabled={saving}
          onClick={() => void changeTab("content")}
          number="2"
          label="이미지"
        />
        <TabButton
          active={activeTab === "attributes"}
          disabled={saving}
          onClick={() => void changeTab("attributes")}
          number="3"
          label="속성"
        />
        <TabButton
          active={activeTab === "market"}
          disabled={saving}
          onClick={() => void changeTab("market")}
          number="4"
          label="스마트스토어"
        />
      </nav>

      {Object.keys(errors).length > 0 && (
        <div className="drawer-alert error" role="alert">
          <strong>입력 내용을 확인해 주세요.</strong>
          {Object.values(errors).map((error) => (
            <span key={error}>{error}</span>
          ))}
        </div>
      )}

      <div className="drawer-editor-body">
        {activeTab === "basic" && (
          <div className="drawer-section-stack">
            <section className="drawer-form-section">
              <div className="drawer-section-title">
                <span>01</span>
                <div>
                  <h3>카테고리와 상품 정보</h3>
                  <p>마켓에 노출될 기본 판매 정보를 입력합니다.</p>
                </div>
              </div>
              <div className="drawer-naver-category">
                <div className="drawer-naver-category-heading">
                  <label htmlFor="naver-category-search">네이버 카테고리</label>
                  <button
                    type="button"
                    disabled={form.title.trim().length < 2}
                    onClick={() => {
                      setApplyCategoryQueryToTitle(true);
                      void recommendNaverCategory(form.title, true);
                    }}
                  >
                    상품명으로 자동 추천
                  </button>
                </div>
                {form.naverCategoryId &&
                (selectedNaverCategory?.id === form.naverCategoryId ||
                  initial.naverCategory?.id === form.naverCategoryId) ? (
                  <div className="drawer-naver-category-selected">
                    <div>
                      <strong>
                        {selectedNaverCategory?.id === form.naverCategoryId
                          ? selectedNaverCategory.name
                          : initial.naverCategory?.name}
                      </strong>
                      <span>
                        {selectedNaverCategory?.id === form.naverCategoryId
                          ? selectedNaverCategory.wholeCategoryName
                          : initial.naverCategory?.wholeCategoryName}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label="네이버 카테고리 선택 해제"
                      title="선택 해제"
                      onClick={() => {
                        setForm({
                          ...form,
                          naverCategoryId: null,
                          naverAttributes: [],
                        });
                        setSelectedNaverCategory(null);
                        setCategoryRecommendationStatus("");
                      }}
                    >
                      ×
                    </button>
                  </div>
                ) : null}
                <input
                  id="naver-category-search"
                  type="search"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={naverCategoryResults.length > 0}
                  aria-controls="naver-category-results"
                  value={naverCategorySearch}
                  placeholder="카테고리명 직접 검색"
                  autoComplete="off"
                  onChange={(event) => {
                    const value = event.target.value;
                    setNaverCategorySearch(value);
                    if (value.trim().length < 1) {
                      setNaverCategoryResults([]);
                      setCategorySearchStatus("");
                    }
                  }}
                />
                {categoryRecommendationStatus && (
                  <small>{categoryRecommendationStatus}</small>
                )}
                <label className="drawer-category-title-option">
                  <input
                    type="checkbox"
                    checked={applyCategoryQueryToTitle}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setApplyCategoryQueryToTitle(checked);
                      if (checked && categorySearchQuery) {
                        setForm((current) => {
                          titleBeforeCategoryQuery.current = current.title;
                          return { ...current, title: categorySearchQuery };
                        });
                      } else if (!checked && categorySearchQuery) {
                        setForm((current) =>
                          current.title === categorySearchQuery
                            ? {
                                ...current,
                                title: titleBeforeCategoryQuery.current,
                              }
                            : current,
                        );
                      }
                    }}
                  />
                  정리된 검색어를 상품명에도 적용
                </label>
                {categorySearchStatus && <small>{categorySearchStatus}</small>}
                {naverCategoryResults.length > 0 && (
                  <div
                    id="naver-category-results"
                    className="drawer-naver-category-results"
                    role="listbox"
                  >
                    {naverCategoryResults.map((category) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={form.naverCategoryId === category.id}
                        key={category.id}
                        onClick={() => {
                          setForm({
                            ...form,
                            naverCategoryId: category.id,
                            naverAttributes:
                              form.naverCategoryId === category.id
                                ? form.naverAttributes
                                : [],
                          });
                          setSelectedNaverCategory(category);
                          setNaverCategorySearch("");
                          setNaverCategoryResults([]);
                          setCategoryRecommendationStatus(
                            "직접 선택한 카테고리를 적용했습니다.",
                          );
                        }}
                      >
                        <strong>{category.name}</strong>
                        <span>{category.wholeCategoryName}</span>
                      </button>
                    ))}
                  </div>
                )}
                {errors.naverCategoryId && (
                  <small className="field-error">
                    {errors.naverCategoryId}
                  </small>
                )}
              </div>
              <div className="drawer-product-title-field">
                {sourcingRegistrationDraft && (
                  <div className="registration-title-keywords">
                    <div className="registration-title-keywords-head">
                      <div>
                        <strong>
                          추천에 사용할 상품명 키워드 ({selectedSourcingTitleKeywords.length}개 선택)
                        </strong>
                        <span>
                          키워드를 클릭해 추천 재료를 고르세요. 서로 다른 상품 유형 표현은 50자 안에서 함께 반영합니다.
                        </span>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={resetSourcingTitleKeywordsToRecommended}
                        >
                          자동 추천 선택
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSourcingTitleKeywords([]);
                            setTitleRecommendation(null);
                            setTitleRecommendationStatus("");
                          }}
                        >
                          선택 초기화
                        </button>
                      </div>
                    </div>
                    <input
                      type="search"
                      value={sourcingTitleKeywordQuery}
                      onChange={(event) =>
                        setSourcingTitleKeywordQuery(event.target.value)
                      }
                      placeholder="상품명 키워드 검색"
                      aria-label="추천 상품명 키워드 검색"
                    />
                    {selectedSourcingTitleKeywords.length ? (
                      <div
                        className="registration-title-selected-keywords"
                        aria-label="선택한 상품명 키워드"
                      >
                        {selectedSourcingTitleKeywords.map((keyword) => (
                          <button
                            type="button"
                            key={keyword}
                            onClick={() => toggleSourcingTitleKeyword(keyword)}
                            aria-label={`${keyword} 선택 해제`}
                          >
                            {keyword} <span aria-hidden="true">×</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="registration-title-keyword-groups">
                      {([
                        {
                          key: "automatic",
                          title: "자동 연결 후보",
                          description: `‘${registrationContext?.sourcingKeyword}’ 또는 확인된 동의 상품형과 연결된 키워드입니다.`,
                          candidates: sourcingTitleCandidateGroups.automatic,
                        },
                        {
                          key: "confirmation",
                          title: "자동 연결 확인 필요",
                          description: `‘${registrationContext?.sourcingKeyword}’ 문자열이 없지만 실제 같은 상품이면 직접 선택할 수 있습니다.`,
                          candidates:
                            sourcingTitleCandidateGroups.confirmationRequired,
                        },
                      ] as const).map((group) => {
                        const visibleCandidates =
                          showAllSourcingTitleKeywords ||
                          sourcingTitleKeywordQuery.trim()
                            ? group.candidates
                            : group.candidates.slice(0, 8);
                        return (
                          <section key={group.key}>
                            <div>
                              <strong>
                                {group.title} ({group.candidates.length})
                              </strong>
                              <span>{group.description}</span>
                            </div>
                            {visibleCandidates.length ? (
                              <div>
                                {visibleCandidates.map((candidate) => {
                                  const selected =
                                    selectedSourcingTitleKeywords.includes(
                                      candidate.keyword,
                                    );
                                  return (
                                    <label
                                      key={candidate.keyword}
                                      className={selected ? "selected" : undefined}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={() =>
                                          toggleSourcingTitleKeyword(
                                            candidate.keyword,
                                          )
                                        }
                                        aria-label={`${candidate.keyword} 추천 상품명 키워드 선택`}
                                      />
                                      <span>{candidate.keyword}</span>
                                      <small>
                                        월 검색수 {candidate.monthlySearchVolume.toLocaleString("ko-KR")}
                                        {candidate.connection ===
                                        "confirmation_required"
                                          ? " · 자동 연결 실패, 직접 선택 가능"
                                          : " · 자동 연결"}
                                      </small>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : (
                              <small>표시할 후보가 없습니다.</small>
                            )}
                          </section>
                        );
                      })}
                    </div>
                    {(sourcingTitleCandidateGroups.automatic.length > 8 ||
                      sourcingTitleCandidateGroups.confirmationRequired.length >
                        8) && !sourcingTitleKeywordQuery.trim() ? (
                      <button
                        type="button"
                        className="registration-title-keywords-more"
                        onClick={() =>
                          setShowAllSourcingTitleKeywords((current) => !current)
                        }
                      >
                        {showAllSourcingTitleKeywords
                          ? "후보 간단히 보기"
                          : `전체 후보 ${sourcingRegistrationDraft.titleCandidateDetails.length}개 보기`}
                      </button>
                    ) : null}
                  </div>
                )}
                <div className="drawer-product-title-heading">
                  <label htmlFor="product-selling-title">판매용 상품명</label>
                  {sourcingRegistrationDraft && (
                    <button
                      type="button"
                      disabled={
                        recommendingTitle ||
                        !selectedSourcingTitleKeywords.length
                      }
                      onClick={() => void recommendProductTitle()}
                    >
                      {recommendingTitle ? "추천 분석 중…" : "상품명 추천"}
                    </button>
                  )}
                </div>
                <input
                  id="product-selling-title"
                  value={form.title}
                  maxLength={registrationContext ? 50 : 200}
                  onChange={(event) => {
                    setForm({ ...form, title: event.target.value });
                    setTitleRecommendation(null);
                    setTitleRecommendationStatus("");
                    setTitleAnalysisStatus(
                      "상품명이 변경되었습니다. 분석 기준을 확인하거나 다시 감지해 주세요.",
                    );
                  }}
                  onBlur={() => {
                    if (!form.naverCategoryId)
                      void recommendNaverCategory(form.title);
                  }}
                />
                <small>
                  {form.title.length}/{registrationContext ? 50 : 200}자
                </small>
                {registrationContext && form.title.length > 40 && (
                  <small className="registration-title-length-warning">
                    40자를 넘었습니다. 핵심 상품과 수식어가 바로 이해되는지
                    검토해 주세요. 최대 50자까지 입력할 수 있습니다.
                  </small>
                )}
                {errors.title && (
                  <small className="field-error">{errors.title}</small>
                )}
                <span className="drawer-original-title">
                  <small>원본 상품명</small>
                  <strong>{activeSupplier.originalName ?? "-"}</strong>
                </span>
                {!sourcingRegistrationDraft && (
                  <section className="drawer-title-analysis-criteria">
                    <div className="drawer-title-analysis-heading">
                      <div>
                        <strong>상품 분석 기준</strong>
                        <p>
                          자동 감지값을 실제 상품에 맞게 수정하면 상품명과 검색
                          키워드 추천에 함께 반영됩니다.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="drawer-button-secondary"
                        onClick={redetectTitleAnalysis}
                      >
                        현재 상품명으로 다시 감지
                      </button>
                    </div>
                    <div className="drawer-title-analysis-grid">
                      <label>
                        <span>
                          상품 유형 <strong>필수</strong>
                        </span>
                        <input
                          value={titleAnalysisCriteria.productType}
                          placeholder="예: 공구함, 골무, 욕실화"
                          onChange={(event) =>
                            updateTitleAnalysisCriteria({
                              ...titleAnalysisCriteria,
                              productType: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        소재·재질
                        <input
                          value={titleAnalysisCriteria.materials}
                          placeholder="쉼표로 구분"
                          onChange={(event) =>
                            updateTitleAnalysisCriteria({
                              ...titleAnalysisCriteria,
                              materials: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        용도
                        <input
                          value={titleAnalysisCriteria.uses}
                          placeholder="예: 수납, 캠핑"
                          onChange={(event) =>
                            updateTitleAnalysisCriteria({
                              ...titleAnalysisCriteria,
                              uses: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        핵심 특징
                        <input
                          value={titleAnalysisCriteria.modifiers}
                          placeholder="예: 휴대용, 미니"
                          onChange={(event) =>
                            updateTitleAnalysisCriteria({
                              ...titleAnalysisCriteria,
                              modifiers: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="wide">
                        추천에서 제외할 표현
                        <input
                          value={titleAnalysisCriteria.removedTerms}
                          placeholder="예: 무료배송, 부자재"
                          onChange={(event) =>
                            updateTitleAnalysisCriteria({
                              ...titleAnalysisCriteria,
                              removedTerms: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="drawer-title-analysis-actions">
                      <small
                        className={
                          titleAnalysisCriteria.productType
                            ? "drawer-title-analysis-status"
                            : "field-error"
                        }
                      >
                        {titleAnalysisStatus}
                      </small>
                      <button
                        type="button"
                        className="drawer-button-primary"
                        disabled={
                          recommendingTitle ||
                          form.title.trim().length < 2 ||
                          !titleAnalysisCriteria.productType.trim()
                        }
                        onClick={() => void recommendProductTitle()}
                      >
                        {recommendingTitle
                          ? "추천 분석 중…"
                          : "이 기준으로 상품명·키워드 추천"}
                      </button>
                    </div>
                  </section>
                )}
                {titleRecommendationStatus && (
                  <small className="drawer-title-recommendation-status">
                    {titleRecommendationStatus}
                  </small>
                )}
                {titleRecommendation && (
                  <div
                    className="drawer-title-recommendation"
                    aria-live="polite"
                  >
                    <div className="drawer-title-recommendation-head">
                      <div>
                        <small>
                          {titleRecommendation.source === "sourcing_rules"
                            ? "소싱 분류 + 검색 품질 규칙"
                            : titleRecommendation.source ===
                                "rules_naver_search_ad"
                              ? "규칙 분석 + 네이버 검색광고 실제 데이터"
                              : "규칙 기반 기본 모드"}
                        </small>
                        <strong>{titleRecommendation.title}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setForm((current) => ({
                            ...current,
                            title: titleRecommendation.title,
                            sourceTitleKeywords:
                              titleRecommendation.source === "sourcing_rules"
                                ? titleRecommendation.keywordEvidence.map(
                                    (item) => item.keyword,
                                  )
                                : current.sourceTitleKeywords,
                          }));
                          setTitleRecommendationStatus(
                            "추천 상품명을 적용했습니다. 저장 전까지 네이버에는 반영되지 않습니다.",
                          );
                        }}
                      >
                        이 상품명 적용
                      </button>
                    </div>
                    {titleRecommendation.source === "sourcing_rules" ? (
                      <dl>
                        <div>
                          <dt>기본 상품 유형</dt>
                          <dd>{titleRecommendation.analysis.productType}</dd>
                        </div>
                        <div>
                          <dt>선택한 추천 키워드</dt>
                          <dd>
                            {selectedSourcingTitleKeywords.join(", ") ||
                              "선택 없음"}
                          </dd>
                        </div>
                      </dl>
                    ) : (
                      <dl>
                        <div>
                          <dt>상품 유형</dt>
                          <dd>{titleRecommendation.analysis.productType}</dd>
                        </div>
                        <div>
                          <dt>소재·재질</dt>
                          <dd>
                            {titleRecommendation.analysis.materials.join(
                              ", ",
                            ) || "감지 안 됨"}
                          </dd>
                        </div>
                        <div>
                          <dt>용도</dt>
                          <dd>
                            {titleRecommendation.analysis.uses.join(", ") ||
                              "감지 안 됨"}
                          </dd>
                        </div>
                        <div>
                          <dt>정리한 표현</dt>
                          <dd>
                            {titleRecommendation.analysis.removedTerms.join(
                              ", ",
                            ) || "없음"}
                          </dd>
                        </div>
                      </dl>
                    )}
                    {titleRecommendation.keywordEvidence.length > 0 && (
                      <div className="drawer-title-keyword-evidence">
                        <small>
                          {titleRecommendation.source === "sourcing_rules"
                            ? `추천에 사용한 상품명 키워드 (${titleRecommendation.keywordEvidence.length}개)`
                            : "네이버 키워드 근거"}
                        </small>
                        <div>
                          {titleRecommendation.keywordEvidence.map((item) => (
                            <span key={item.keyword}>
                              {item.keyword} ·{" "}
                              {item.totalMonthlySearchVolume == null
                                ? "조회 안 됨"
                                : `월 ${item.totalMonthlySearchVolume.toLocaleString("ko-KR")}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {titleRecommendation.source !== "sourcing_rules" &&
                      titleRecommendation.relatedKeywords.length > 0 && (
                        <div className="drawer-related-keywords">
                          <div className="drawer-related-keywords-heading">
                            <div>
                              <strong>검색 키워드 추천</strong>
                              <small>
                                상품과 관련 있는 연관 검색어를 검색량순으로
                                정리했습니다.
                              </small>
                            </div>
                            <div>
                              <span>
                                {
                                  form.searchTags.filter((tag) => tag.trim())
                                    .length
                                }
                                /10 선택
                              </span>
                              <button
                                type="button"
                                className="drawer-button-secondary"
                                onClick={applyRecommendedSearchTags}
                              >
                                추천 키워드 채우기
                              </button>
                            </div>
                          </div>
                          <div className="drawer-related-keyword-list">
                            {titleRecommendation.relatedKeywords.map((item) => {
                              const keyword = item.keyword.trim();
                              const qualityIssues = assessSearchTag(keyword, {
                                title: form.title,
                              });
                              const blockingIssues = qualityIssues.filter(
                                isBlockingSearchTagIssue,
                              );
                              const selected = form.searchTags.some(
                                (tag) => tag.trim() === keyword,
                              );
                              const selectionLimitReached =
                                !selected &&
                                form.searchTags.filter((tag) => tag.trim())
                                  .length >= 10;
                              return (
                                <label
                                  key={item.keyword}
                                  className={selected ? "selected" : undefined}
                                  title={qualityIssues[0]?.message}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    disabled={
                                      selectionLimitReached ||
                                      blockingIssues.length > 0
                                    }
                                    onChange={() => toggleSearchTag(keyword)}
                                  />
                                  <span>{item.keyword}</span>
                                  <small>
                                    {item.totalMonthlySearchVolume == null
                                      ? "검색량 조회 안 됨"
                                      : `월 ${item.totalMonthlySearchVolume.toLocaleString("ko-KR")}회`}
                                    {qualityIssues.some(
                                      (issue) =>
                                        issue.code === "duplicate-product-info",
                                    )
                                      ? " · 상품명과 중복 · 직접 선택 가능"
                                      : blockingIssues[0]
                                        ? ` · ${blockingIssues[0].message}`
                                        : ""}
                                  </small>
                                </label>
                              );
                            })}
                          </div>
                          {tagSelectionStatus && (
                            <small
                              className={
                                tagSelectionStatus.includes("최대")
                                  ? "field-error"
                                  : "drawer-tag-selection-status"
                              }
                            >
                              {tagSelectionStatus}
                            </small>
                          )}
                        </div>
                      )}
                    {titleRecommendation.notices.map((notice) => (
                      <p key={notice}>{notice}</p>
                    ))}
                    <small className="drawer-title-recommendation-disclaimer">
                      {titleRecommendation.source === "sourcing_rules"
                        ? "검색수는 아이템스카우트에서 가져오거나 사용자가 입력한 값입니다. 추천 상품명은 검색 노출이나 매출을 보장하지 않습니다."
                        : "검색량은 네이버 검색광고 API 값이며 추천 상품명이 검색 노출이나 매출을 보장하지 않습니다."}
                    </small>
                  </div>
                )}
              </div>
              {sourcingRegistrationDraft ? (
                <div className="registration-tag-selector">
                  <strong>
                    검색 태그 선택 (
                    {form.searchTags.filter((tag) => tag.trim()).length}/10)
                  </strong>
                  <p>
                    소싱 조사에서 태그로 분류한 후보입니다. 월 검색수 1,000은
                    상품명 후보 기준이며 검색 태그의 선택 제한이 아닙니다. 후보가
                    부족하면 1,000을 초과한 키워드도 포함해 최대 10개까지 직접
                    선택하세요.
                  </p>
                  {sourcingRegistrationDraft.tagCandidates.length ? (
                    <div>
                      {sourcingRegistrationDraft.tagCandidates.map((tag) => {
                        const tooLong = tag.length > 30;
                        const qualityIssues = assessSearchTag(tag, {
                          title: form.title,
                        });
                        const blockingIssues = qualityIssues.filter(
                          isBlockingSearchTagIssue,
                        );
                        const selected = form.searchTags.includes(tag);
                        const source =
                          registrationContext?.relatedKeywords.find(
                            (item) =>
                              item.placement === "tag" && item.keyword === tag,
                          );
                        return (
                          <label
                            key={tag}
                            className={selected ? "selected" : undefined}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={tooLong || blockingIssues.length > 0}
                              onChange={() => toggleSearchTag(tag)}
                            />
                            <span>{tag}</span>
                            <small>
                              {source?.monthlySearchVolume == null
                                ? "월 검색수 미입력"
                                : `월 검색수 ${source.monthlySearchVolume.toLocaleString("ko-KR")}`}
                              {(source?.monthlySearchVolume ?? 0) > 1_000
                                ? " · 1,000 초과도 선택 가능"
                                : ""}
                              {tooLong ? " · 30자 초과" : ""}
                              {qualityIssues.some(
                                (issue) =>
                                  issue.code === "duplicate-product-info",
                              )
                                ? " · 상품명과 중복 · 직접 선택 가능"
                                : blockingIssues.length
                                  ? ` · ${blockingIssues[0]?.message}`
                                : ""}
                            </small>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <small>
                      소싱 조사에서 태그로 분류한 키워드가 없습니다.
                    </small>
                  )}
                  {tagSelectionStatus && (
                    <small className="field-error">{tagSelectionStatus}</small>
                  )}
                </div>
              ) : (
                <label>
                  검색 키워드
                  <input
                    value={form.searchTags.join(", ")}
                    placeholder="쉼표로 구분해 입력"
                    onChange={(event) =>
                      setForm({
                        ...form,
                        searchTags: event.target.value.split(","),
                      })
                    }
                  />
                  <small>
                    최대 10개까지 입력할 수 있습니다. 상품명과 중복되는 태그는
                    경고 후 직접 선택할 수 있지만 배송·할인 등 홍보성 태그는
                    저장할 수 없습니다.
                  </small>
                  {form.searchTags.flatMap((tag) =>
                    assessSearchTag(tag, { title: form.title }).map((issue) => (
                      <small
                        className={
                          isBlockingSearchTagIssue(issue)
                            ? "field-error"
                            : "registration-title-length-warning"
                        }
                        key={`${tag}-${issue.code}`}
                      >
                        {tag.trim()}: {issue.message}
                      </small>
                    )),
                  )}
                </label>
              )}
              <div className="drawer-price-grid">
                <label>
                  공급가
                  <input
                    value={formatWon(activeSupplier.supplierPrice)}
                    disabled
                  />
                </label>
                <label>
                  판매가
                  <input
                    inputMode="numeric"
                    value={form.sellingPrice ?? ""}
                    placeholder="판매가 입력"
                    onChange={(event) =>
                      setForm({
                        ...form,
                        sellingPrice: event.target.value
                          ? Number(event.target.value.replace(/\D/g, ""))
                          : null,
                      })
                    }
                  />
                </label>
              </div>
              {margin !== null && (
                <p className="drawer-margin">
                  예상 단순 차액{" "}
                  <strong>{margin.toLocaleString("ko-KR")}원</strong>
                  <small>수수료·배송비·세금 미반영</small>
                </p>
              )}
              <MarginCalculator
                supplierCost={Number(activeSupplier.supplierPrice ?? 0)}
                onApply={(sellingPrice) =>
                  setForm((current) => ({ ...current, sellingPrice }))
                }
              />
            </section>

            <details
              className="drawer-options"
              open={optionEditorOpen}
              onToggle={(event) =>
                setOptionEditorOpen(event.currentTarget.open)
              }
            >
              <summary>
                옵션 정보 편집{" "}
                <span
                  className={
                    form.editedOptions.groups.length > 0 &&
                    !form.editedOptions.combinations.some(
                      (combination) => combination.enabled,
                    )
                      ? "needs-attention"
                      : undefined
                  }
                >
                  {form.editedOptions.groups.length > 0 &&
                  !form.editedOptions.combinations.some(
                    (combination) => combination.enabled,
                  )
                    ? "활성 조합 입력 필요"
                    : `${form.editedOptions.groups.length}개 그룹`}
                </span>
              </summary>
              {optionEditorOpen && (
                <OptionEditor
                  value={form.editedOptions}
                  onChange={(editedOptions) =>
                    setForm({ ...form, editedOptions })
                  }
                />
              )}
            </details>
          </div>
        )}

        {activeTab === "content" && (
          <div className="drawer-section-stack">
            {registrationContext && (
              <section className="drawer-form-section sourcing-supplier-source">
                <div className="drawer-section-title">
                  <span>직감</span>
                  <div>
                    <h3>타겟 직감 상품 데이터 가져오기</h3>
                    <p>
                      직감에 수집된 상품의 이미지·상세페이지·옵션·공급가를 이
                      소싱 등록 초안에 연결합니다. 상품명·검색태그·판매가·카테고리는
                      유지합니다.
                    </p>
                  </div>
                </div>
                <div className="sourcing-supplier-source-search">
                  <input
                    type="search"
                    value={supplierSourceQuery}
                    onChange={(event) =>
                      setSupplierSourceQuery(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void searchSupplierSource();
                      }
                    }}
                    placeholder="직감 상품명, 상품번호 또는 상세페이지 URL"
                    aria-label="가져올 직감 상품 검색"
                  />
                  <button
                    type="button"
                    onClick={() => void searchSupplierSource()}
                    disabled={searchingSupplierSource}
                  >
                    {searchingSupplierSource ? "검색 중…" : "직감 상품 찾기"}
                  </button>
                </div>
                {supplierSourceStatus && (
                  <p className="sourcing-supplier-source-status" role="status">
                    {supplierSourceStatus}
                  </p>
                )}
                {supplierSourceCandidates.length > 0 && (
                  <div
                    className="sourcing-supplier-source-results"
                    aria-label="직감 상품 검색 결과"
                  >
                    {supplierSourceCandidates.map((candidate) => (
                      <article key={candidate.supplierProductId}>
                        <div className="sourcing-supplier-source-thumbnail">
                          {candidate.thumbnailUrl ? (
                            <img
                              src={candidate.thumbnailUrl}
                              alt=""
                              loading="lazy"
                            />
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
                            {candidate.hasDescription ? "있음" : "없음"} · 옵션{" "}
                            {candidate.optionCount}개
                          </small>
                          {candidate.url && (
                            <a
                              href={candidate.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              직감 상품 확인
                            </a>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => void applySupplierSource(candidate)}
                          disabled={
                            applyingSupplierSourceId !== null ||
                            searchingSupplierSource
                          }
                        >
                          {applyingSupplierSourceId ===
                          candidate.supplierProductId
                            ? "가져오는 중…"
                            : "이 상품 데이터 사용"}
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
            <section className="drawer-form-section">
              <div className="drawer-section-title with-action">
                <span>02</span>
                <div>
                  <h3>썸네일 이미지</h3>
                  <p>
                    대표 이미지 1개와 추가 이미지 9개까지 등록할 수 있습니다.
                    이미지를 끌어 놓아 노출 순서를 바꾸세요. 대표 이미지에는
                    텍스트·워터마크·허위 이벤트 문구나 여러 상품 나열을 넣지
                    마세요.
                  </p>
                </div>
                <div className="drawer-section-actions">
                  <button
                    type="button"
                    onClick={() => void uploadNaverImages()}
                    disabled={
                      saving ||
                      uploadingImages ||
                      !form.selectedImages.some(
                        (image) => image.enabled && !image.storedUrl,
                      )
                    }
                  >
                    {uploadingImages ? "업로드 중…" : "네이버 이미지 업로드"}
                  </button>
                  <button
                    type="button"
                    onClick={resetImages}
                    disabled={saving || uploadingImages}
                  >
                    원본으로 초기화
                  </button>
                </div>
              </div>
              <p className="drawer-image-count">
                사용 이미지 {enabledImageCount}/10 · 대표 1개 + 추가 최대 9개
              </p>
              <div className="drawer-url-import">
                <label htmlFor="thumbnail-url">썸네일 이미지 URL</label>
                <div>
                  <input
                    id="thumbnail-url"
                    type="url"
                    value={thumbnailUrl}
                    onChange={(event) => setThumbnailUrl(event.target.value)}
                    placeholder="https://example.com/product.jpg"
                  />
                  <button
                    type="button"
                    onClick={addThumbnailUrl}
                    disabled={saving}
                  >
                    URL 추가
                  </button>
                </div>
                <small>
                  외부 이미지 주소를 최대 10개까지 추가한 뒤 네이버 이미지
                  업로드를 실행하세요.
                </small>
              </div>
              <div
                className="drawer-images"
                role="list"
                aria-label="상품 이미지 순서"
              >
                {form.selectedImages.map((image, index) => (
                  <article
                    key={image.id}
                    role="listitem"
                    aria-label={`${image.isPrimary ? "대표 이미지" : "추가 이미지"} ${index + 1}`}
                    draggable={!saving && !uploadingImages}
                    className={[
                      !image.enabled ? "disabled" : "",
                      draggedImageId === image.id ? "dragging" : "",
                      imageDropTargetId === image.id ? "drop-target" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onDragStart={(event) => {
                      setDraggedImageId(image.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", image.id);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setImageDropTargetId(image.id);
                    }}
                    onDragLeave={() =>
                      setImageDropTargetId((current) =>
                        current === image.id ? null : current,
                      )
                    }
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceId =
                        event.dataTransfer.getData("text/plain") ||
                        draggedImageId;
                      if (sourceId) reorderImage(sourceId, image.id);
                      setDraggedImageId(null);
                      setImageDropTargetId(null);
                    }}
                    onDragEnd={() => {
                      setDraggedImageId(null);
                      setImageDropTargetId(null);
                    }}
                  >
                    <div className="drawer-image-preview">
                      <img
                        src={image.storedUrl ?? image.sourceUrl}
                        alt={image.altText}
                      />
                      {image.enabled && (
                        <span>
                          {image.isPrimary
                            ? "대표 이미지"
                            : `추가 이미지 ${
                                form.selectedImages
                                  .slice(0, index + 1)
                                  .filter(
                                    (candidate) =>
                                      candidate.enabled && !candidate.isPrimary,
                                  ).length
                              }`}
                        </span>
                      )}
                      {image.storedUrl && <small>네이버 업로드 완료</small>}
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={image.enabled}
                        onChange={(event) =>
                          imageChange(index, { enabled: event.target.checked })
                        }
                      />{" "}
                      사용
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="drawer-primary"
                        checked={image.isPrimary}
                        onChange={() =>
                          imageChange(index, { isPrimary: true, enabled: true })
                        }
                      />{" "}
                      대표
                    </label>
                    <div className="drawer-image-actions">
                      <button
                        type="button"
                        onClick={() => moveImage(index, -1)}
                        disabled={index === 0}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => moveImage(index, 1)}
                        disabled={index === form.selectedImages.length - 1}
                      >
                        →
                      </button>
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        aria-label={`${index + 1}번 이미지 삭제`}
                      >
                        삭제
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="drawer-form-section">
              <div className="drawer-section-title">
                <span>03</span>
                <div>
                  <h3>상세페이지</h3>
                  <p>판매 페이지에 표시할 HTML을 편집하고 미리 확인하세요.</p>
                </div>
              </div>
              <div className="drawer-description-preview">
                <span>미리보기</span>
                <iframe
                  sandbox=""
                  srcDoc={form.description}
                  title="판매 상세페이지 미리보기"
                />
              </div>
              <div className="drawer-url-import detail">
                <label htmlFor="detail-image-urls">상세 이미지 URL</label>
                <textarea
                  id="detail-image-urls"
                  rows={4}
                  value={detailImageUrls}
                  onChange={(event) => setDetailImageUrls(event.target.value)}
                  placeholder={
                    "https://example.com/detail-01.jpg\nhttps://example.com/detail-02.jpg"
                  }
                />
                <button
                  type="button"
                  onClick={addDetailImageUrls}
                  disabled={saving}
                >
                  상세페이지에 URL 이미지 추가
                </button>
                <small>
                  외부 웹페이지 전체가 아닌 공개된 http/https 이미지 URL을 상세
                  HTML에 추가합니다.
                </small>
              </div>
              <label className="drawer-description-html">
                <span>HTML 편집</span>
                <textarea
                  rows={13}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </label>
            </section>
          </div>
        )}

        {activeTab === "attributes" && (
          <section className="drawer-attributes">
            <div className="drawer-section-title">
              <span>03</span>
              <div>
                <h3>네이버 카테고리 속성</h3>
                <p>
                  주요 소재, 사이즈 특징 등 카테고리 속성을 항목별 한 행에서
                  선택하세요.
                </p>
              </div>
            </div>
            {!form.naverCategoryId ? (
              <div className="drawer-attributes-empty">
                <strong>네이버 카테고리를 먼저 선택해 주세요.</strong>
                <p>
                  기본정보에서 최종 카테고리를 선택하면 해당 카테고리의 공식
                  속성을 불러옵니다.
                </p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void changeTab("basic")}
                >
                  기본정보로 이동
                </button>
              </div>
            ) : (
              <NaverAttributesPanel
                requirements={categoryRequirements}
                status={categoryRequirementsStatus}
                failed={categoryRequirementsFailed}
                value={form.naverAttributes}
                onRetry={() =>
                  setCategoryRequirementsRefreshKey((current) => current + 1)
                }
                onChange={(naverAttributes) =>
                  setForm({ ...form, naverAttributes })
                }
              />
            )}
          </section>
        )}

        {activeTab === "market" && (
          <section className="drawer-market">
            <div className="drawer-market-brand">N</div>
            <span>스마트스토어 등록</span>
            <h3>상품 등록 준비 상태를 확인하세요.</h3>
            <p>
              필수 정보를 모두 작성하면 스마트스토어 등록 준비를 완료할 수
              있습니다.
            </p>
            <div className="drawer-market-checks">
              {marketChecks.map((check) => (
                <div key={check.label} className={check.done ? "done" : ""}>
                  <span>{check.done ? "✓" : "!"}</span>
                  {check.label}
                  <strong>{check.done ? "완료" : "필요"}</strong>
                </div>
              ))}
            </div>
            <div className="drawer-category-requirements">
              <strong>스마트스토어 발행 상태</strong>
              <div className="naver-store-target-field">
                <strong>발행 대상 스마트스토어</strong>
                {marketData?.naverStoreConnections.length ? (
                  <>
                    <select
                      aria-label="발행 대상 스마트스토어"
                      value={selectedStoreId}
                      disabled={savingStoreTarget || publishingNaver}
                      onChange={(event) =>
                        void selectStoreTarget(event.target.value)
                      }
                    >
                      {marketData.naverStoreConnections.map((connection) => (
                        <option key={connection.id} value={connection.id}>
                          {connection.storeName}
                          {connection.authType === "SELLER"
                            ? " · 다른 판매자"
                            : " · 내 스토어"}
                          {connection.isDefault ? " · 기본" : ""}
                        </option>
                      ))}
                    </select>
                    <small>
                      배송정책, 발행 이력과 실제 등록 계정은 선택한 스토어별로
                      분리됩니다.
                    </small>
                  </>
                ) : (
                  <p>
                    스마트스토어 설정에서 발행 대상 스토어를 먼저 연결해 주세요.
                  </p>
                )}
              </div>
              <div className="naver-store-target-field">
                <strong>배송정책 관리번호</strong>
                {marketData?.naverDeliveryPolicies.length ? (
                  <>
                    <select
                      aria-label="배송정책 관리번호"
                      value={selectedDeliveryPolicyId}
                      disabled={
                        savingDeliveryPolicy ||
                        savingStoreTarget ||
                        publishingNaver
                      }
                      onChange={(event) =>
                        void selectDeliveryPolicy(event.target.value)
                      }
                    >
                      <option value="">배송정책을 선택해 주세요</option>
                      {marketData.naverDeliveryPolicies.map((policy) => (
                        <option key={policy.id} value={policy.id}>
                          {policy.policyCode} · {policy.name}
                        </option>
                      ))}
                    </select>
                    <small>
                      선택한 관리번호에 저장된 출고지·반품지·택배사·배송비
                      정보가 실제 등록에 사용됩니다.
                    </small>
                  </>
                ) : (
                  <p>
                    선택한 스토어에 저장된 배송정책이 없습니다.{" "}
                    <a href="/admin/channels/naver">
                      스마트스토어 설정에서 배송정책 만들기
                    </a>
                  </p>
                )}
              </div>
              {publicationInspectionStatus && (
                <p role="status">{publicationInspectionStatus}</p>
              )}
              {marketDataStatus && <p role="status">{marketDataStatus}</p>}
              {publicationInspection && (
                <div className="drawer-publication-status">
                  <div>
                    <span>현재 상태</span>
                    <strong>
                      {publicationStatusLabel(publicationInspection)}
                    </strong>
                  </div>
                  {publicationInspection.publication?.originProductNo && (
                    <div>
                      <span>네이버 원상품 번호</span>
                      <strong>
                        {publicationInspection.publication.originProductNo}
                      </strong>
                    </div>
                  )}
                  {publicationInspection.publication?.channelProductNo && (
                    <div>
                      <span>채널 상품 번호</span>
                      <strong>
                        {publicationInspection.publication.channelProductNo}
                      </strong>
                    </div>
                  )}
                  {publicationInspection.publication?.remoteStatusType &&
                    publicationInspection.publication.remoteStatusType !==
                      "DELETE" && (
                      <div>
                        <span>네이버 판매 상태</span>
                        <strong>
                          {naverRemoteStatusLabel(
                            publicationInspection.publication.remoteStatusType,
                          )}
                        </strong>
                      </div>
                    )}
                  {!publicationInspection.ready && (
                    <ul>
                      {(publicationInspection.issues ?? []).map((issue) => (
                        <li key={`${issue.path}-${issue.message}`}>
                          <span>{issue.message}</span>
                          {issue.path.includes("optionInfo") && (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                setOptionEditorOpen(true);
                                void changeTab("basic");
                              }}
                            >
                              옵션 입력으로 이동
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {publicationInspection.publication?.lastErrorMessage && (
                    <p className="drawer-publication-error">
                      최근 오류:{" "}
                      {publicationInspection.publication.lastErrorMessage}
                    </p>
                  )}
                </div>
              )}
              {publicationInspection?.publication?.originProductNo &&
                publicationInspection.publication.channelProductNo &&
                publicationInspection.publication.status !== "deleted" && (
                  <div className="drawer-publication-actions">
                    <strong>네이버 상품 운영</strong>
                    <p>
                      판매 상태는 즉시 반영됩니다. 가격·상품명·이미지 등 편집
                      내용은 저장 후 아래 변경사항 반영 버튼을 사용하세요.
                    </p>
                    <div>
                      <button
                        type="button"
                        className="secondary"
                        disabled={publishingNaver || syncingNaver || dirty}
                        onClick={() => void syncFromNaver()}
                      >
                        {syncingNaver
                          ? "최신 정보 불러오는 중…"
                          : "스마트스토어 정보 불러오기"}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={publishingNaver || syncingNaver}
                        onClick={() => void changeNaverSaleStatus("SALE")}
                      >
                        판매 재개
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={publishingNaver}
                        onClick={() => void changeNaverSaleStatus("OUTOFSTOCK")}
                      >
                        품절 처리
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={publishingNaver}
                        onClick={() => void changeNaverSaleStatus("SUSPENSION")}
                      >
                        판매 중지
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={publishingNaver}
                        onClick={() => void deleteNaverProduct()}
                      >
                        네이버 상품 삭제
                      </button>
                    </div>
                  </div>
                )}
            </div>
            <div className="drawer-category-requirements">
              <strong>상품별 판매 정책</strong>
              {marketData ? (
                <NaverPublicationPolicyForm
                  key={`${selectedStoreId}:${JSON.stringify(
                    marketData.naverPublicationPolicy.overrides,
                  )}`}
                  mode="product"
                  endpoint={`/api/products/${initial.product.id}/naver-publication-policy`}
                  initialDefaults={marketData.naverPublicationPolicy.defaults}
                  initialOverrides={marketData.naverPublicationPolicy.overrides}
                  categoryId={form.naverCategoryId}
                  salePrice={form.sellingPrice}
                  onSaved={() =>
                    setPublicationRefreshKey((current) => current + 1)
                  }
                />
              ) : (
                <PanelLoading label="판매 정책" />
              )}
            </div>
            <div className="drawer-market-notice">
              <strong>실제 상품 등록 전 확인</strong>
              <p>
                버튼을 누르면 최신 payload를 다시 검증하고 최종 확인창을
                표시합니다. 확인 전에는 네이버로 상품을 전송하지 않습니다.
              </p>
            </div>
            <button
              type="button"
              className="drawer-market-button"
              disabled={
                dirty ||
                saving ||
                publishingNaver ||
                !selectedStoreId ||
                !publicationInspection?.ready ||
                !["create", "retry_create", "update"].includes(
                  publicationInspection.action ?? "",
                )
              }
              onClick={() => void publishToNaver()}
            >
              {publishingNaver
                ? "네이버 처리 중…"
                : publicationInspection?.action === "update"
                  ? "변경사항 스마트스토어 반영"
                  : "스마트스토어 실제 등록"}
              {!publishingNaver && (
                <small>
                  {publicationInspection?.action === "update"
                    ? "가격·이미지·상품정보 수정"
                    : "최종 확인 필요"}
                </small>
              )}
            </button>
            {dirty && (
              <small className="drawer-market-help">
                저장되지 않은 변경사항을 먼저 저장해 주세요.
              </small>
            )}
            {!readyForMarket && (
              <small className="drawer-market-help">
                미완료 항목을 앞선 탭에서 입력해 주세요.
              </small>
            )}
          </section>
        )}
      </div>

      <footer className="drawer-savebar">
        <div>
          <span className={`inventory-badge status-${status}`}>
            {statusLabel(status)}
          </span>
          <strong>{dirty ? "저장되지 않은 변경사항" : message}</strong>
        </div>
        <button
          type="button"
          className="drawer-button-secondary"
          disabled={!dirty || saving}
          onClick={() => setForm(JSON.parse(baseline))}
        >
          변경 취소
        </button>
        <button
          type="button"
          className="drawer-button-draft"
          disabled={!dirty || saving}
          onClick={() => submit("draft")}
        >
          {saving ? "저장 중…" : "임시저장"}
        </button>
        <button
          type="button"
          className="drawer-button-primary"
          disabled={saving}
          onClick={() => submit("ready")}
        >
          등록 준비 완료
        </button>
      </footer>
    </div>
  );
}

function TabButton({
  active,
  disabled,
  onClick,
  number,
  label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  number: string;
  label: string;
}) {
  return (
    <button
      type="button"
      className={active ? "active" : ""}
      disabled={disabled}
      onClick={onClick}
    >
      <span>{number}</span>
      {label}
    </button>
  );
}

function PanelLoading({ label }: { label: string }) {
  return <p role="status">{label} 불러오는 중…</p>;
}

function NaverAttributesPanel({
  requirements,
  status,
  failed,
  value,
  onRetry,
  onChange,
}: {
  requirements: CategoryRequirements | null;
  status: string;
  failed: boolean;
  value: NaverProductAttribute[];
  onRetry: () => void;
  onChange: (value: NaverProductAttribute[]) => void;
}) {
  return (
    <div className="drawer-category-requirements drawer-attributes-panel">
      <strong>네이버 카테고리별 공식 속성</strong>
      <p>
        최종 카테고리를 기준으로 네이버 커머스 API에서 필수 속성, 선택값, 단위와
        표준 옵션을 불러옵니다.
      </p>
      {status && <p role="status">{status}</p>}
      {failed && (
        <button type="button" className="secondary" onClick={onRetry}>
          카테고리 필수속성 다시 불러오기
        </button>
      )}
      {requirements && (
        <>
          <div>
            <span>카테고리 상품 속성</span>
            <strong>
              전체 {requirements.attributes.length}개 · 필수{" "}
              {requirements.requiredAttributes.length}개
            </strong>
          </div>
          {requirements.attributes.length > 0 ? (
            <NaverAttributeEditor
              attributes={requirements.attributes}
              candidates={requirements.attributeValues}
              units={requirements.units}
              value={value}
              onChange={onChange}
            />
          ) : (
            <p>입력할 카테고리 상품 속성이 없습니다.</p>
          )}
          <div>
            <span>필수 표준 옵션</span>
            <strong>{requirements.requiredOptionGroups.length}개</strong>
          </div>
          <ul>
            {requirements.requiredOptionGroups.map((group) => (
              <li key={`${group.groupName ?? ""}-${group.attributeName}`}>
                {group.groupName || group.attributeName}
                {group.groupName && <small>{group.attributeName}</small>}
              </li>
            ))}
            {!requirements.requiredOptionGroups.length && (
              <li>
                {requirements.standardOptions.useStandardOption
                  ? "필수 표준 옵션 없음"
                  : "표준 옵션을 사용하지 않는 카테고리"}
              </li>
            )}
          </ul>
          {requirements.stale && (
            <p>릴레이 연결 문제로 마지막 조회 결과를 표시합니다.</p>
          )}
        </>
      )}
    </div>
  );
}

function isNaverAttributeComplete(
  attribute: CategoryRequirements["requiredAttributes"][number],
  candidates: CategoryRequirements["attributeValues"],
  selected: NaverProductAttribute[],
) {
  const attributeCandidates = candidates.filter(
    (candidate) => candidate.attributeSeq === attribute.attributeSeq,
  );
  const attributeSelections = selected.filter(
    (value) => value.attributeSeq === attribute.attributeSeq,
  );
  return attributeCandidates.length
    ? attributeSelections.some(
        (value) =>
          attributeCandidates.some(
            (candidate) =>
              candidate.attributeValueSeq === value.attributeValueSeq,
          ) &&
          (attribute.attributeClassificationType !== "RANGE" ||
            Boolean(value.minValue.trim() || value.maxValue.trim())),
      )
    : attributeSelections.some((value) => value.minValue || value.maxValue);
}

function publicationStatusLabel(inspection: PublicationInspection) {
  if (!inspection.ready) return "필수 정보 확인 필요";
  const actionLabels = {
    create: "신규 등록 가능",
    retry_create: "등록 재시도 가능",
    update: "네이버 반영 필요",
    unchanged: "최신 상태",
    blocked:
      inspection.publication?.status === "failed"
        ? "중복 등록 확인 필요"
        : "처리 중",
  } as const;
  if (inspection.action) return actionLabels[inspection.action];
  return inspection.publication
    ? {
        publishing: "등록 처리 중",
        published: "등록 완료",
        failed: "등록 실패",
        deleting: "삭제 처리 중",
        deleted: "삭제됨",
      }[inspection.publication.status]
    : "미등록";
}

function naverRemoteStatusLabel(
  status: NonNullable<PublicationInspection["publication"]>["remoteStatusType"],
) {
  return (
    {
      SALE: "판매 중",
      OUTOFSTOCK: "품절",
      SUSPENSION: "판매 중지",
      DELETE: "삭제됨",
    }[status ?? "SALE"] ?? status
  );
}

function fromInitial(initial: ProductEditorInitial) {
  const product = initial.product;
  return {
    draftVersion: product.draftVersion,
    title: product.title,
    sourceTitleKeywords: product.sourceTitleKeywords ?? [],
    searchTags: product.searchTags,
    sellingPrice: product.sellingPrice,
    currency: "KRW" as const,
    description: product.description,
    categoryId: product.categoryId,
    naverCategoryId: product.naverCategoryId,
    selectedImages: product.selectedImages,
    editedOptions: product.editedOptions,
    naverAttributes: product.naverAttributes ?? [],
  };
}

function splitKeywordList(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeCandidateSearch(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .toLocaleLowerCase("ko-KR");
}

function toProductTitleAnalysisDraft(
  criteria: ProductTitleAnalysisCriteria,
): ProductTitleAnalysisDraft {
  return {
    productType: criteria.productType,
    materials: criteria.materials.join(", "),
    uses: criteria.uses.join(", "),
    modifiers: criteria.modifiers.join(", "),
    removedTerms: criteria.removedTerms.join(", "),
  };
}

function fromProductTitleAnalysisDraft(
  draft: ProductTitleAnalysisDraft,
): ProductTitleAnalysisCriteria {
  return {
    productType: draft.productType.trim(),
    materials: splitKeywordList(draft.materials),
    uses: splitKeywordList(draft.uses),
    modifiers: splitKeywordList(draft.modifiers),
    removedTerms: splitKeywordList(draft.removedTerms),
  };
}

function normalizeHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function formatWon(value: string | null) {
  if (value == null) return "-";
  const number = Number(value);
  return Number.isFinite(number)
    ? `${Math.round(number).toLocaleString("ko-KR")}원`
    : "-";
}

function statusLabel(status: string) {
  return (
    (
      {
        draft: "초안",
        editing: "편집 중",
        ready: "준비 완료",
        archived: "보관",
      } as Record<string, string>
    )[status] ?? status
  );
}
