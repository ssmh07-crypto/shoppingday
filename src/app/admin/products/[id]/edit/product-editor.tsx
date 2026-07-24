"use client";
/* eslint-disable @next/next/no-img-element -- supplier URLs are intentionally loaded directly; no image storage/optimizer proxy */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NaverProductAttribute, SelectedImage } from "@/lib/db/schema";
import { OptionEditor } from "./option-editor";
import { MarginCalculator } from "./margin-calculator";
import { NaverAttributeEditor } from "./naver-attribute-editor";
import { NaverPublicationPolicyForm } from "@/app/admin/components/naver-publication-policy-form";
import { buildSourcingRegistrationDraft } from "@/modules/sourcing/registration-draft";
import type {
  NaverCategoryOption,
  ProductEditorInitial,
  SourcingRegistrationContext,
} from "./product-editor-types";

type EditorTab = "basic" | "content" | "market";
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
  }>;
  notices: string[];
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
  const [activeTab, setActiveTab] = useState<EditorTab>("basic");
  const [status, setStatus] = useState(initial.product.status);
  const [saving, setSaving] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [publishingNaver, setPublishingNaver] = useState(false);
  const [recommendingTitle, setRecommendingTitle] = useState(false);
  const [titleRecommendation, setTitleRecommendation] =
    useState<TitleRecommendation | null>(null);
  const [titleRecommendationStatus, setTitleRecommendationStatus] =
    useState("");
  const [preferredSourcingTitleKeyword, setPreferredSourcingTitleKeyword] =
    useState("");
  const [tagSelectionStatus, setTagSelectionStatus] = useState("");
  const [message, setMessage] = useState("저장됨");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [detailImageUrls, setDetailImageUrls] = useState("");
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
  const [publicationInspection, setPublicationInspection] =
    useState<PublicationInspection | null>(null);
  const [publicationInspectionStatus, setPublicationInspectionStatus] =
    useState("");
  const [publicationRefreshKey, setPublicationRefreshKey] = useState(0);
  const autoRecommendationStarted = useRef(false);
  const titleBeforeCategoryQuery = useRef(initial.product.title);
  const dirty = JSON.stringify(form) !== baseline;
  const margin = useMemo(
    () =>
      form.sellingPrice && initial.supplier.supplierPrice
        ? form.sellingPrice - Number(initial.supplier.supplierPrice)
        : null,
    [form.sellingPrice, initial.supplier.supplierPrice],
  );
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
    if (activeTab !== "market" || !form.naverCategoryId) return;
    const controller = new AbortController();
    async function loadRequirements(categoryId: string) {
      setCategoryRequirements(null);
      setCategoryRequirementsStatus("카테고리 필수정보를 확인하는 중입니다.");
      try {
        const response = await fetch(
          `/api/integrations/naver/category-requirements?categoryId=${encodeURIComponent(categoryId)}`,
          { signal: controller.signal },
        );
        const body = await response.json();
        if (!response.ok) {
          throw new Error(
            body.error?.message ?? "카테고리 필수정보를 조회하지 못했습니다.",
          );
        }
        setCategoryRequirements(body.requirements);
        setCategoryRequirementsStatus("");
      } catch (error) {
        if (controller.signal.aborted) return;
        setCategoryRequirementsStatus(
          error instanceof Error
            ? error.message
            : "카테고리 필수정보를 조회하지 못했습니다.",
        );
      }
    }
    void loadRequirements(form.naverCategoryId);
    return () => controller.abort();
  }, [activeTab, form.naverCategoryId]);

  useEffect(() => {
    if (activeTab !== "market") return;
    const controller = new AbortController();
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
        setPublicationInspection(body.inspection);
        setPublicationInspectionStatus("");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setPublicationInspection(null);
        setPublicationInspectionStatus(
          error instanceof Error
            ? error.message
            : "발행 준비 상태를 확인하지 못했습니다.",
        );
      });
    return () => controller.abort();
  }, [activeTab, initial.product.id, publicationRefreshKey]);

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
      setCategoryRecommendationStatus("상품명으로 카테고리를 찾는 중입니다.");
      try {
        const response = await fetch(
          `/api/integrations/naver/categories/recommend?productName=${encodeURIComponent(name)}`,
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
        setCategoryRecommendationStatus(
          error instanceof Error
            ? error.message
            : "카테고리를 추천하지 못했습니다.",
        );
      }
    },
    [applyCategoryQueryToTitle],
  );

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

  async function recommendProductTitle() {
    const title = form.title.trim();
    if (registrationContext && sourcingRegistrationDraft) {
      setRecommendingTitle(true);
      setTitleRecommendation(null);
      setTitleRecommendationStatus("소싱 키워드 분류와 검색 품질 규칙을 적용하는 중입니다.");
      const draft = buildSourcingRegistrationDraft(
        registrationContext.sourcingKeyword,
        registrationContext.relatedKeywords,
        { preferredTitleKeyword: preferredSourcingTitleKeyword },
      );
      if (!draft.title) {
        setTitleRecommendationStatus(
          "검색수 1,000 이하로 분류된 상품명 키워드를 먼저 선택해 주세요.",
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
            status: source?.monthlySearchVolume == null
              ? "not-found" as const
              : "success" as const,
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
    setRecommendingTitle(true);
    setTitleRecommendation(null);
    setTitleRecommendationStatus(
      "상품 구조를 분석하고 네이버 키워드 검색량을 확인하는 중입니다.",
    );
    try {
      const categoryPath =
        selectedNaverCategory?.id === form.naverCategoryId
          ? selectedNaverCategory.wholeCategoryName
          : initial.naverCategory?.id === form.naverCategoryId
            ? initial.naverCategory.wholeCategoryName
            : "";
      const response = await fetch(
        `/api/products/${initial.product.id}/title-recommendation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            originalTitle: initial.supplier.originalName ?? "",
            categoryPath,
            searchTags: form.searchTags
              .map((tag) => tag.trim())
              .filter(Boolean),
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

  function toggleSourcingTag(tag: string) {
    setForm((current) => {
      const normalized = tag.trim();
      const selected = current.searchTags.includes(normalized);
      if (selected) {
        setTagSelectionStatus("");
        return {
          ...current,
          searchTags: current.searchTags.filter((item) => item !== normalized),
        };
      }
      if (current.searchTags.filter((item) => item.trim()).length >= 20) {
        setTagSelectionStatus("검색 태그는 최대 20개까지 선택할 수 있습니다.");
        return current;
      }
      setTagSelectionStatus("");
      return {
        ...current,
        searchTags: [...current.searchTags.filter((item) => item.trim()), normalized],
      };
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
        body.data.uploadedCount
          ? `네이버 이미지 ${body.data.uploadedCount}개를 업로드했습니다.`
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
      const inspectionResponse = await fetch(
        `/api/products/${initial.product.id}/naver-publication`,
        { cache: "no-store" },
      );
      const inspectionBody = await inspectionResponse.json().catch(() => null);
      if (!inspectionResponse.ok) {
        throw new Error(
          inspectionBody?.error?.message ??
            "발행 준비 상태를 확인하지 못했습니다.",
        );
      }
      const inspection = inspectionBody.inspection as PublicationInspection;
      setPublicationInspection(inspection);
      if (!inspection.ready || !inspection.payloadHash) {
        throw new Error("필수 상품 정보와 판매 정책을 먼저 입력해 주세요.");
      }
      if (
        !inspection.action ||
        !["create", "retry_create"].includes(inspection.action)
      ) {
        throw new Error(
          inspection.action === "unchanged"
            ? "이미 최신 상태로 등록된 상품입니다."
            : inspection.action === "update"
              ? "등록된 상품의 수정 연동은 아직 지원하지 않습니다."
              : "이전 등록 요청의 결과를 먼저 확인해 주세요.",
        );
      }
      const actionLabel =
        inspection.action === "retry_create" ? "등록을 다시 시도" : "신규 등록";
      const confirmed = window.confirm(
        `[스마트스토어 실제 등록]\n\n상품명: ${form.title}\n판매가: ${Number(form.sellingPrice ?? 0).toLocaleString("ko-KR")}원\n작업: ${actionLabel}\n\n확인하면 네이버에 상품이 실제 등록되며 전시 정책에 따라 노출될 수 있습니다. 계속할까요?`,
      );
      if (!confirmed) return;

      setMessage("스마트스토어에 상품을 등록하는 중…");
      const response = await fetch(
        `/api/products/${initial.product.id}/naver-publication`,
        {
          method: "POST",
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
        published?.channelProductNo
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
      return { ...old, selectedImages };
    });
  }

  function addThumbnailUrl() {
    const url = normalizeHttpUrl(thumbnailUrl);
    if (!url) {
      setMessage("http 또는 https로 시작하는 이미지 URL을 입력해 주세요.");
      return;
    }
    if (form.selectedImages.length >= 30) {
      setMessage("썸네일 이미지는 최대 30개까지 추가할 수 있습니다.");
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
            attribute.attributeSeq,
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
          <strong>{initial.supplier.externalProductId}</strong>
        </div>
        <div>
          <span>공급가</span>
          <strong>{formatWon(initial.supplier.supplierPrice)}</strong>
        </div>
        <div>
          <span>공급 상태</span>
          <strong>
            {initial.supplier.availability === "sold_out"
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
          label="이미지·상세"
        />
        <TabButton
          active={activeTab === "market"}
          disabled={saving}
          onClick={() => void changeTab("market")}
          number="3"
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
                  <label className="registration-title-basis">
                    기준 상품명 검색어
                    <select
                      value={preferredSourcingTitleKeyword}
                      onChange={(event) => {
                        setPreferredSourcingTitleKeyword(event.target.value);
                        setTitleRecommendation(null);
                        setTitleRecommendationStatus("");
                      }}
                    >
                      <option value="">검색수 높은 순으로 자동 조합</option>
                      {sourcingRegistrationDraft.titleCandidates.map((keyword) => {
                        const source = registrationContext?.relatedKeywords.find(
                          (item) =>
                            item.placement === "product_name" &&
                            item.keyword === keyword,
                        );
                        return (
                          <option value={keyword} key={keyword}>
                            {keyword}
                            {source?.monthlySearchVolume == null
                              ? ""
                              : ` · 월 ${source.monthlySearchVolume.toLocaleString("ko-KR")}`}
                          </option>
                        );
                      })}
                    </select>
                    <small>
                      검색수 1,000 이하 상품명 후보가 여러 개면 하나를 골라
                      해당 표현을 우선한 추천을 만들 수 있습니다.
                    </small>
                  </label>
                )}
                <div className="drawer-product-title-heading">
                  <label htmlFor="product-selling-title">판매용 상품명</label>
                  <button
                    type="button"
                    disabled={
                      recommendingTitle ||
                      (sourcingRegistrationDraft
                        ? !sourcingRegistrationDraft.titleCandidates.length
                        : form.title.trim().length < 2)
                    }
                    onClick={() => void recommendProductTitle()}
                  >
                    {recommendingTitle ? "추천 분석 중…" : "상품명 추천"}
                  </button>
                </div>
                <input
                  id="product-selling-title"
                  value={form.title}
                  maxLength={registrationContext ? 50 : 200}
                  onChange={(event) => {
                    setForm({ ...form, title: event.target.value });
                    setTitleRecommendation(null);
                    setTitleRecommendationStatus("");
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
                  <strong>{initial.supplier.originalName ?? "-"}</strong>
                </span>
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
                          <dt>우선 기준 검색어</dt>
                          <dd>
                            {preferredSourcingTitleKeyword ||
                              "검색수 높은 순 자동 조합"}
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
                            {titleRecommendation.analysis.materials.join(", ") ||
                              "감지 안 됨"}
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
                    {form.searchTags.filter((tag) => tag.trim()).length}/20)
                  </strong>
                  <p>
                    소싱 조사에서 태그로 분류한 후보입니다. 검색수와 관계없이
                    실제 등록할 태그를 직접 선택하세요.
                  </p>
                  {sourcingRegistrationDraft.tagCandidates.length ? (
                    <div>
                      {sourcingRegistrationDraft.tagCandidates.map((tag) => {
                        const tooLong = tag.length > 30;
                        const selected = form.searchTags.includes(tag);
                        return (
                          <label
                            key={tag}
                            className={selected ? "selected" : undefined}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={tooLong}
                              onChange={() => toggleSourcingTag(tag)}
                            />
                            <span>{tag}</span>
                            <small>{tooLong ? "30자 초과" : "태그 후보"}</small>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <small>소싱 조사에서 태그로 분류한 키워드가 없습니다.</small>
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
                  <small>최대 20개까지 입력할 수 있습니다.</small>
                </label>
              )}
              <div className="drawer-price-grid">
                <label>
                  공급가
                  <input
                    value={formatWon(initial.supplier.supplierPrice)}
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
                supplierCost={Number(initial.supplier.supplierPrice ?? 0)}
                onApply={(sellingPrice) =>
                  setForm((current) => ({ ...current, sellingPrice }))
                }
              />
            </section>

            <details className="drawer-options">
              <summary>
                옵션 정보 편집{" "}
                <span>{form.editedOptions.groups.length}개 그룹</span>
              </summary>
              <OptionEditor
                value={form.editedOptions}
                onChange={(editedOptions) =>
                  setForm({ ...form, editedOptions })
                }
              />
            </details>
          </div>
        )}

        {activeTab === "content" && (
          <div className="drawer-section-stack">
            <section className="drawer-form-section">
              <div className="drawer-section-title with-action">
                <span>02</span>
                <div>
                  <h3>썸네일 이미지</h3>
                  <p>
                    사용할 이미지와 대표 이미지를 선택하고 순서를 조정하세요.
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
                전체 {form.selectedImages.length}개 중 {enabledImageCount}개
                사용
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
                  외부 이미지 주소를 추가한 뒤 네이버 이미지 업로드를
                  실행하세요.
                </small>
              </div>
              <div className="drawer-images">
                {form.selectedImages.map((image, index) => (
                  <article
                    key={image.id}
                    className={!image.enabled ? "disabled" : ""}
                  >
                    <div className="drawer-image-preview">
                      <img
                        src={image.storedUrl ?? image.sourceUrl}
                        alt={image.altText}
                      />
                      {image.isPrimary && image.enabled && <span>대표</span>}
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
              <textarea
                rows={13}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
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
              <div className="drawer-description-preview">
                <span>미리보기</span>
                <iframe
                  sandbox=""
                  srcDoc={form.description}
                  title="판매 상세페이지 미리보기"
                />
              </div>
            </section>
          </div>
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
              <strong>네이버 카테고리별 공식 속성</strong>
              <p>
                최종 카테고리를 기준으로 네이버 커머스 API에서 필수 속성,
                선택값, 단위와 표준 옵션을 불러옵니다.
              </p>
              {categoryRequirementsStatus && (
                <p role="status">{categoryRequirementsStatus}</p>
              )}
              {categoryRequirements && (
                <>
                  <div>
                    <span>카테고리 상품 속성</span>
                    <strong>
                      전체 {categoryRequirements.attributes.length}개 · 필수{" "}
                      {categoryRequirements.requiredAttributes.length}개
                    </strong>
                  </div>
                  <ul>
                    {categoryRequirements.requiredAttributes.map(
                      (attribute) => (
                        <li key={attribute.attributeSeq}>
                          {attribute.attributeName}
                          <small>
                            {attributeTypeLabel(
                              attribute.attributeClassificationType,
                            )}
                          </small>
                        </li>
                      ),
                    )}
                    {!categoryRequirements.requiredAttributes.length && (
                      <li>필수 상품 속성 없음</li>
                    )}
                  </ul>
                  {categoryRequirements.attributes.length > 0 && (
                    <NaverAttributeEditor
                      attributes={categoryRequirements.attributes}
                      candidates={categoryRequirements.attributeValues}
                      units={categoryRequirements.units}
                      value={form.naverAttributes}
                      onChange={(naverAttributes) =>
                        setForm({ ...form, naverAttributes })
                      }
                    />
                  )}
                  <div>
                    <span>필수 표준 옵션</span>
                    <strong>
                      {categoryRequirements.requiredOptionGroups.length}개
                    </strong>
                  </div>
                  <ul>
                    {categoryRequirements.requiredOptionGroups.map((group) => (
                      <li
                        key={`${group.groupName ?? ""}-${group.attributeName}`}
                      >
                        {group.groupName || group.attributeName}
                        {group.groupName && (
                          <small>{group.attributeName}</small>
                        )}
                      </li>
                    ))}
                    {!categoryRequirements.requiredOptionGroups.length && (
                      <li>
                        {categoryRequirements.standardOptions.useStandardOption
                          ? "필수 표준 옵션 없음"
                          : "표준 옵션을 사용하지 않는 카테고리"}
                      </li>
                    )}
                  </ul>
                  {categoryRequirements.stale && (
                    <p>릴레이 연결 문제로 마지막 조회 결과를 표시합니다.</p>
                  )}
                </>
              )}
            </div>
            <div className="drawer-category-requirements">
              <strong>스마트스토어 발행 상태</strong>
              {publicationInspectionStatus && (
                <p role="status">{publicationInspectionStatus}</p>
              )}
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
                  {!publicationInspection.ready && (
                    <ul>
                      {(publicationInspection.issues ?? []).map((issue) => (
                        <li key={`${issue.path}-${issue.message}`}>
                          {issue.message}
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
            </div>
            <div className="drawer-category-requirements">
              <strong>상품별 판매 정책</strong>
              <NaverPublicationPolicyForm
                mode="product"
                endpoint={`/api/products/${initial.product.id}/naver-publication-policy`}
                initialDefaults={initial.naverPublicationPolicy.defaults}
                initialOverrides={initial.naverPublicationPolicy.overrides}
                categoryId={form.naverCategoryId}
                onSaved={() =>
                  setPublicationRefreshKey((current) => current + 1)
                }
              />
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
                !publicationInspection?.ready ||
                !["create", "retry_create"].includes(
                  publicationInspection.action ?? "",
                )
              }
              onClick={() => void publishToNaver()}
            >
              {publishingNaver ? "등록 확인 중…" : "스마트스토어 실제 등록"}
              {!publishingNaver && <small>최종 확인 필요</small>}
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
          className="secondary"
          disabled={!dirty || saving}
          onClick={() => setForm(JSON.parse(baseline))}
        >
          변경 취소
        </button>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => submit("draft")}
        >
          {saving ? "저장 중…" : "임시저장"}
        </button>
        <button type="button" disabled={saving} onClick={() => submit("ready")}>
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

function isNaverAttributeComplete(
  attributeSeq: number,
  candidates: CategoryRequirements["attributeValues"],
  selected: NaverProductAttribute[],
) {
  const attributeCandidates = candidates.filter(
    (candidate) => candidate.attributeSeq === attributeSeq,
  );
  const attributeSelections = selected.filter(
    (value) => value.attributeSeq === attributeSeq,
  );
  return attributeCandidates.length
    ? attributeSelections.some((value) =>
        attributeCandidates.some(
          (candidate) =>
            candidate.attributeValueSeq === value.attributeValueSeq,
        ),
      )
    : attributeSelections.some((value) => value.minValue || value.maxValue);
}

function attributeTypeLabel(
  type: CategoryRequirements["requiredAttributes"][number]["attributeClassificationType"],
) {
  if (!type) return "입력";
  return {
    SINGLE_SELECT: "단일 선택",
    MULTI_SELECT: "복수 선택",
    RANGE: "범위 입력",
  }[type];
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

function fromInitial(initial: ProductEditorInitial) {
  const product = initial.product;
  return {
    draftVersion: product.draftVersion,
    title: product.title,
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
