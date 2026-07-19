import "server-only";
import { createHash } from "node:crypto";
import type { KeywordGenerationClient } from "./keyword-generation-client";
import { KeywordManagementError } from "./keyword-errors";
import type { KeywordMetricsClient } from "./keyword-metrics-client";
import type { KeywordManagementRepository } from "./keyword-repository";
import {
  createManagedProductSchema,
  generateTitleSchema,
  keywordSelectionSchema,
  keywordReviewSchema,
  managedProductInputSchema,
  productAnalysisSchema,
  updateGeneratedTitleSchema,
  updateManagedProductSchema,
} from "./schemas";
import { extractSmartstoreProductNo, normalizeKeyword } from "./keyword-utils";
import type {
  KeywordMetrics,
  ManagedProductDetail,
  ManagedProductInput,
} from "./types";
import { createRuleKeywordCandidates } from "./rules-keyword-client";
import { canonicalKeyword, keywordLexicon, synonymGroups } from "./keyword-lexicon";
import {
  naverProductImportErrorMessage,
  type ImportedNaverProductData,
  type NaverManagedProductImporter,
} from "./naver-product-importer";

export class KeywordManagementService {
  constructor(
    private readonly repository: KeywordManagementRepository,
    private readonly generator: KeywordGenerationClient | null,
    private readonly metricsClient: KeywordMetricsClient | null,
    private readonly config: {
      candidateCount: number;
      cacheHours: number;
      titleMaximumLength: number;
      mockMode: boolean;
    },
    private readonly productImporter: NaverManagedProductImporter | null = null,
  ) {}

  list(ownerId: string) {
    return this.repository.list(ownerId);
  }

  async get(ownerId: string, id: string) {
    const detail = await this.repository.find(ownerId, id);
    if (!detail) {
      throw new KeywordManagementError(
        "not_found",
        "관리할 상품을 찾을 수 없습니다.",
        404,
      );
    }
    return detail;
  }

  async create(ownerId: string, raw: unknown) {
    const parsed = createManagedProductSchema.parse(raw);
    const channelProductNo = extractSmartstoreProductNo(parsed.smartstoreUrl);
    if (!channelProductNo) {
      throw new KeywordManagementError(
        "invalid_smartstore_url",
        "스마트스토어 또는 브랜드스토어 상품 링크를 확인해 주세요.",
        400,
      );
    }
    const local = await this.repository.findLocalPublication(ownerId, channelProductNo);
    let imported: ImportedNaverProductData | null = null;
    let commerceImport: ManagedProductInput["commerceImport"] = {
      status: "not_configured",
      fetchedAt: null,
      message: "네이버 커머스 API가 설정되지 않아 직접 입력한 정보로 진행했습니다.",
    };
    if (this.productImporter) {
      try {
        imported = await this.productImporter.import(channelProductNo);
        commerceImport = {
          status: "success",
          fetchedAt: new Date().toISOString(),
          message: null,
        };
      } catch (error) {
        commerceImport = {
          status: "failed",
          fetchedAt: null,
          message: naverProductImportErrorMessage(error),
        };
      }
    }
    const merged: ManagedProductInput = managedProductInputSchema.parse({
      ...parsed.productInput,
      supplierTitle: parsed.productInput.supplierTitle || local?.title || "",
      currentTitle:
        parsed.productInput.currentTitle || imported?.currentTitle || local?.title || "",
      description: parsed.productInput.description || local?.description || "",
      category:
        parsed.productInput.category ||
        imported?.category ||
        local?.naverCategoryId ||
        "",
      materials:
        parsed.productInput.materials.length > 0
          ? parsed.productInput.materials
          : imported?.materials ?? [],
      colors:
        parsed.productInput.colors.length > 0
          ? parsed.productInput.colors
          : imported?.colors ?? [],
      sizes:
        parsed.productInput.sizes.length > 0
          ? parsed.productInput.sizes
          : imported?.sizes ?? [],
      target: parsed.productInput.target || imported?.target || "",
      seasons:
        parsed.productInput.seasons.length > 0
          ? parsed.productInput.seasons
          : imported?.seasons ?? [],
      imageUrls:
        parsed.productInput.imageUrls.length > 0
          ? parsed.productInput.imageUrls
          : (local?.selectedImages ?? [])
              .filter((image) => image.enabled)
              .map((image) => image.storedUrl ?? image.sourceUrl),
      naverCategoryId: imported?.categoryId || local?.naverCategoryId || undefined,
      naverAttributes: imported?.attributes ?? [],
      searchTags:
        parsed.productInput.searchTags && parsed.productInput.searchTags.length > 0
          ? parsed.productInput.searchTags
          : imported?.searchTags ?? local?.searchTags ?? [],
      commerceImport,
    });
    try {
      const created = await this.repository.create(ownerId, {
        linkedProductId: local?.id ?? null,
        smartstoreUrl: parsed.smartstoreUrl,
        channelProductNo,
        productInput: merged,
      });
      return this.get(ownerId, created.id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new KeywordManagementError(
          "duplicate_product",
          "이미 성장 관리 목록에 추가된 상품입니다.",
          409,
        );
      }
      throw error;
    }
  }

  async update(ownerId: string, id: string, raw: unknown) {
    const input = updateManagedProductSchema.parse(raw);
    await this.get(ownerId, id);
    if (input.productInput) {
      await this.repository.updateProductInput(ownerId, id, input.productInput);
    }
    if (input.analysis) {
      const reviewedAnalysis = {
        ...input.analysis,
        productType: input.analysis.primaryProductType ?? "",
        productTypeStatus: input.analysis.primaryProductType
          ? ("user_confirmed" as const)
          : ("review_required" as const),
        userReviewedAt: new Date().toISOString(),
      };
      const updated = await this.repository.updateAnalysis(ownerId, id, reviewedAnalysis);
      if (!updated) {
        throw new KeywordManagementError(
          "analysis_required",
          "먼저 상품 분석을 실행해 주세요.",
          409,
        );
      }
      await this.repository.replaceKeywordCandidates(ownerId, id, []);
    }
    if (input.finalTitle) {
      await this.repository.saveFinalTitle(ownerId, id, input.finalTitle);
    }
    return this.get(ownerId, id);
  }

  async generateCandidates(ownerId: string, id: string) {
    const detail = await this.get(ownerId, id);
    if (!detail.analysis) {
      throw new KeywordManagementError(
        "analysis_required",
        "먼저 규칙 기반 상품 분석을 실행해 주세요.",
        409,
      );
    }
    if (detail.analysis.isStale) {
      throw new KeywordManagementError(
        "analysis_required",
        "상품 정보가 변경되어 기존 분석 결과가 오래되었습니다. 분석을 다시 실행해 주세요.",
        409,
      );
    }
    const analysis = productAnalysisSchema.parse(detail.analysis.analysis);
    if (!analysis.primaryProductType || analysis.productTypeStatus !== "user_confirmed") {
      throw new KeywordManagementError(
        "product_type_review_required",
        "키워드 후보를 만들기 전에 핵심 상품 유형을 확인해 주세요.",
        409,
      );
    }
    const candidates = createRuleKeywordCandidates(
      analysis,
      this.config.candidateCount,
    ).map((candidate, index) => ({
      ...candidate,
      origin: "rule_combination" as const,
      reviewStatus: "candidate" as const,
      filterReasons: [],
      relevanceScore: Math.max(1, 100 - index),
    }));
    await this.repository.replaceKeywordCandidates(ownerId, id, candidates);
    return this.get(ownerId, id);
  }

  async analyze(ownerId: string, id: string) {
    const detail = await this.get(ownerId, id);
    if (!this.generator) {
      throw new KeywordManagementError(
        "external_api_not_configured",
        "키워드 분석 방식을 사용할 수 없습니다.",
        503,
      );
    }
    try {
      const result = await this.generator.analyze(
        detail.product.productInput,
        this.config.candidateCount,
      );
      const inputHash = createHash("sha256")
        .update(JSON.stringify(detail.product.productInput))
        .digest("hex");
      await this.repository.saveAnalysis(ownerId, id, inputHash, result);
      return this.get(ownerId, id);
    } catch (error) {
      if (error instanceof KeywordManagementError) throw error;
      throw new KeywordManagementError(
        "external_api_error",
        safeExternalMessage(error, "상품 분석에 실패했습니다."),
        502,
      );
    }
  }

  async refreshMetrics(ownerId: string, id: string) {
    let detail = await this.get(ownerId, id);
    if (detail.analysis?.isStale) {
      throw new KeywordManagementError(
        "analysis_required",
        "상품 정보가 변경되어 키워드 결과를 다시 만들어야 합니다.",
        409,
      );
    }
    if (!detail.keywords.length) {
      throw new KeywordManagementError(
        "keywords_required",
        "먼저 분석 결과를 확인하고 키워드 후보를 만들어 주세요.",
        409,
      );
    }
    if (!this.metricsClient) {
      throw new KeywordManagementError(
        "external_api_not_configured",
        "네이버 검색광고 API가 설정되지 않았습니다. Mock 모드를 사용하거나 API 키를 입력해 주세요.",
        503,
      );
    }
    try {
      const hasRelatedCandidates = detail.keywords.some(
        (item) => item.origin === "naver_related",
      );
      const discovered = this.metricsClient.discoverKeywordMetrics && !hasRelatedCandidates
        ? await this.metricsClient.discoverKeywordMetrics(
            discoveryHints(detail).slice(0, 5),
            Math.min(this.config.candidateCount * 10, 300),
          )
        : [];
      const existing = new Set(
        detail.keywords.map((item) => normalizeSearchAdCandidate(item.keyword)),
      );
      const remaining = Math.max(
        0,
        this.config.candidateCount - detail.keywords.length,
      );
      const evaluated = discovered
        .filter(
          (item) =>
            item.status === "success" &&
            !existing.has(normalizeSearchAdCandidate(item.keyword)),
        )
        .map((item) => ({ item, evaluation: evaluateRelatedKeyword(item.keyword, detail) }));
      const accepted = evaluated
        .filter(({ evaluation }) => evaluation.result === "accepted")
        .slice(0, remaining);
      const rejected = evaluated
        .filter(({ evaluation }) => evaluation.result !== "accepted")
        .slice(0, 20);
      const relatedCandidates = [...accepted, ...rejected].map(({ item, evaluation }) => ({
          keyword: item.keyword,
          reason: "네이버 검색광고 키워드 도구가 반환한 연관 키워드입니다.",
          sourceConcepts: [],
          origin: "naver_related" as const,
          reviewStatus: evaluation.result,
          filterReasons: evaluation.reasons,
          relevanceScore: evaluation.score,
        }));
      if (relatedCandidates.length) {
        await this.repository.addKeywordCandidates(ownerId, id, relatedCandidates);
        detail = await this.get(ownerId, id);
      }
      const keywords = detail.keywords.map((item) => item.keyword);
      const cached = await this.repository.findCachedMetrics(keywords, new Date());
      const cachedByKeyword = new Map(
        cached.map((item) => [normalizeKeyword(item.keyword), item]),
      );
      const discoveredByKeyword = new Map(
        discovered.map((item) => [normalizeKeyword(item.keyword), item]),
      );
      const missing = keywords.filter(
        (keyword) =>
          !cachedByKeyword.has(normalizeKeyword(keyword)) &&
          !discoveredByKeyword.has(normalizeKeyword(keyword)),
      );
      const fresh = missing.length
        ? await this.metricsClient.fetchKeywordMetrics(missing)
        : [];
      const cacheable = [...discovered, ...fresh].filter(
        (item) => item.status !== "error",
      );
      if (cacheable.length) {
        const expiresAt = new Date(
          Date.now() + this.config.cacheHours * 60 * 60 * 1_000,
        );
        await this.repository.cacheMetrics(cacheable, expiresAt);
      }
      const freshByKeyword = new Map(
        fresh.map((item) => [normalizeKeyword(item.keyword), item]),
      );
      const combined = keywords.map(
        (keyword) =>
          cachedByKeyword.get(normalizeKeyword(keyword)) ??
          discoveredByKeyword.get(normalizeKeyword(keyword)) ??
          freshByKeyword.get(normalizeKeyword(keyword)) ??
          missingMetric(keyword, this.config.mockMode),
      );
      await this.repository.applyMetrics(ownerId, id, combined);
      return this.get(ownerId, id);
    } catch (error) {
      throw new KeywordManagementError(
        "external_api_error",
        safeExternalMessage(error, "키워드 검색량 조회에 실패했습니다."),
        502,
      );
    }
  }

  async updateKeywordReview(
    ownerId: string,
    productId: string,
    candidateId: string,
    raw: unknown,
  ) {
    await this.get(ownerId, productId);
    const { status } = keywordReviewSchema.parse(raw);
    const updated = await this.repository.updateKeywordReviewStatus(
      ownerId,
      productId,
      candidateId,
      status,
    );
    if (!updated) {
      throw new KeywordManagementError(
        "not_found",
        "키워드 후보를 찾을 수 없습니다.",
        404,
      );
    }
    return this.get(ownerId, productId);
  }

  async saveSelection(ownerId: string, id: string, raw: unknown) {
    await this.get(ownerId, id);
    const input = keywordSelectionSchema.parse(raw);
    const selectedKeywords = await this.repository.saveSelection(
      ownerId,
      id,
      input.selectedKeywordIds,
    );
    if (selectedKeywords.length !== input.selectedKeywordIds.length) {
      throw new KeywordManagementError(
        "invalid_selection",
        "선택한 키워드 중 이 상품에 속하지 않는 항목이 있습니다.",
        400,
      );
    }
    return { selectedKeywords };
  }

  async generateTitle(ownerId: string, id: string, raw: unknown) {
    const input = generateTitleSchema.parse(raw);
    const detail = await this.get(ownerId, id);
    if (!detail.analysis) {
      throw new KeywordManagementError(
        "analysis_required",
        "먼저 상품 분석을 실행해 주세요.",
        409,
      );
    }
    const selectedKeywords = await this.repository.saveSelection(
      ownerId,
      id,
      input.selectedKeywordIds,
    );
    if (!selectedKeywords.length || selectedKeywords.length !== input.selectedKeywordIds.length) {
      throw new KeywordManagementError(
        "invalid_selection",
        "상품명에 사용할 키워드를 하나 이상 선택해 주세요.",
        400,
      );
    }
    if (!this.generator) {
      throw new KeywordManagementError(
        "external_api_not_configured",
        "상품명 생성 방식을 사용할 수 없습니다.",
        503,
      );
    }
    try {
      const generated = await this.generator.generateTitle({
        productInput: detail.product.productInput,
        analysis: productAnalysisSchema.parse(detail.analysis.analysis),
        selectedKeywords,
        maximumLength: input.maximumLength ?? this.config.titleMaximumLength,
        bannedWords: input.bannedWords,
      });
      const title = await this.repository.createTitle(ownerId, id, {
        selectedKeywords,
        generatedTitle: generated.title,
        model: generated.model,
        source: generated.source,
      });
      const existingProducts = await this.repository.list(ownerId);
      const similarTitles = existingProducts
        .filter((item) => item.id !== id)
        .map((item) => item.finalTitle || item.editableTitle)
        .filter((title) => isSimilarProductTitle(generated.title, title))
        .slice(0, 5);
      return {
        ...title,
        generatedTitle: generated.title,
        selectedKeywords,
        similarTitles,
      };
    } catch (error) {
      throw new KeywordManagementError(
        "external_api_error",
        safeExternalMessage(error, "상품명 초안 생성에 실패했습니다."),
        502,
      );
    }
  }

  async updateTitle(
    ownerId: string,
    productId: string,
    titleId: string,
    raw: unknown,
  ) {
    await this.get(ownerId, productId);
    const input = updateGeneratedTitleSchema.parse(raw);
    const updated = await this.repository.updateTitle(
      ownerId,
      productId,
      titleId,
      input.editedTitle,
    );
    if (!updated) {
      throw new KeywordManagementError(
        "not_found",
        "상품명 초안을 찾을 수 없습니다.",
        404,
      );
    }
    await this.repository.saveFinalTitle(ownerId, productId, input.editedTitle);
    return this.get(ownerId, productId);
  }
}

export function isSimilarProductTitle(left: string, right: string) {
  const normalizedLeft = normalizeKeyword(left).replace(/[^\p{L}\p{N}]/gu, "");
  const normalizedRight = normalizeKeyword(right).replace(/[^\p{L}\p{N}]/gu, "");
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  const leftTokens = new Set(left.normalize("NFKC").split(/\s+/).map(normalizeKeyword).filter(Boolean));
  const rightTokens = new Set(right.normalize("NFKC").split(/\s+/).map(normalizeKeyword).filter(Boolean));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 && intersection / union >= 0.8;
}

function discoveryHints(detail: ManagedProductDetail) {
  const values = [
    detail.analysis?.analysis.productType ?? "",
    ...(detail.analysis?.analysis.searchConcepts ?? []),
    ...detail.keywords.map((item) => item.keyword),
    detail.product.productInput.supplierTitle,
  ];
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizeKeyword(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function normalizeSearchAdCandidate(value: string) {
  return normalizeKeyword(value).replace(/\s+/g, "");
}

export function isRelevantRelatedKeyword(
  keyword: string,
  detail: ManagedProductDetail,
) {
  return evaluateRelatedKeyword(keyword, detail).result === "accepted";
}

export function evaluateRelatedKeyword(
  keyword: string,
  detail: ManagedProductDetail,
): { result: "accepted" | "rejected" | "review"; reasons: string[]; score: number } {
  const analyzedType = detail.analysis?.analysis.productType ?? "";
  const fallbackType =
    detail.product.productInput.supplierTitle
      .split(/\s+/)
      .filter(Boolean)
      .at(-1) ?? "";
  const productType = normalizeSearchAdCandidate(analyzedType || fallbackType);
  const normalizedKeyword = normalizeSearchAdCandidate(keyword);
  const productTypeTerms = [analyzedType || fallbackType];
  const typeSynonymGroup = synonymGroups.find(
    (group) =>
      normalizeSearchAdCandidate(group.canonical) === productType &&
      (!group.categoryScope?.length ||
        group.categoryScope.some((scope) => detail.product.productInput.category.includes(scope))),
  );
  if (typeSynonymGroup) productTypeTerms.push(...typeSynonymGroup.aliases);
  if (
    !productType ||
    !productTypeTerms.some((term) => normalizedKeyword.includes(normalizeSearchAdCandidate(term)))
  ) {
    return { result: "rejected", reasons: ["상품 유형 불일치"], score: 0 };
  }
  const productMaterialText = normalizeSearchAdCandidate([
    detail.product.productInput.supplierTitle,
    ...detail.product.productInput.materials,
    ...(detail.analysis?.analysis.materials ?? []),
  ].join(" "));
  const productMaterials = keywordLexicon.materials.filter((term) =>
    productMaterialText.includes(normalizeSearchAdCandidate(term)),
  );
  const reasons: string[] = [];
  const candidateMaterials = keywordLexicon.materials.filter((term) =>
    normalizedKeyword.includes(normalizeSearchAdCandidate(term)),
  );
  if (
    productMaterials.length &&
    candidateMaterials.some((term) => {
      const canonical = canonicalKeyword(term, detail.product.productInput.category);
      return !productMaterials.some(
        (productTerm) =>
          canonicalKeyword(productTerm, detail.product.productInput.category) === canonical,
      );
    })
  ) {
    reasons.push("소재 충돌");
  }
  const conflictGroups: Array<[readonly string[], string[], string]> = [
    [keywordLexicon.targets, detail.analysis?.analysis.targetCustomers ?? [], "대상 불일치"],
    [keywordLexicon.colors, detail.analysis?.analysis.colors ?? [], "색상 불일치"],
    [keywordLexicon.seasons, detail.analysis?.analysis.seasons ?? [], "계절 불일치"],
    [keywordLexicon.forms, detail.analysis?.analysis.forms ?? [], "형태 불일치"],
    [keywordLexicon.purposes, detail.analysis?.analysis.purposes ?? [], "용도 불일치"],
  ];
  for (const [dictionary, confirmed, reason] of conflictGroups) {
    if (!confirmed.length) continue;
    const mentioned = dictionary.filter((term) =>
      normalizedKeyword.includes(normalizeSearchAdCandidate(term)),
    );
    if (
      mentioned.length &&
      !mentioned.some((term) =>
        confirmed.some(
          (value) => normalizeSearchAdCandidate(value) === normalizeSearchAdCandidate(term),
        ),
      )
    ) reasons.push(reason);
  }
  if (reasons.length) return { result: "rejected", reasons, score: 10 };
  const matchedAttributes = [
    ...(detail.analysis?.analysis.materials ?? []),
    ...(detail.analysis?.analysis.purposes ?? []),
    ...(detail.analysis?.analysis.targetCustomers ?? []),
    ...(detail.analysis?.analysis.features ?? []),
  ].filter((term) => normalizedKeyword.includes(normalizeSearchAdCandidate(term))).length;
  return {
    result: "accepted",
    reasons: ["상품 유형 일치", ...(matchedAttributes ? ["확인된 속성 일치"] : [])],
    score: 50 + matchedAttributes * 10,
  };
}

function missingMetric(keyword: string, mock: boolean): KeywordMetrics {
  return {
    keyword,
    monthlyPcSearchVolume: null,
    monthlyMobileSearchVolume: null,
    totalMonthlySearchVolume: null,
    rawMonthlyPcSearchVolume: null,
    rawMonthlyMobileSearchVolume: null,
    competition: "unknown",
    fetchedAt: new Date().toISOString(),
    source: mock ? "mock" : "naver-search-ad",
    status: "not-found",
  };
}

function safeExternalMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error && typeof error === "object" && "code" in error && error.code === "23505",
  );
}
