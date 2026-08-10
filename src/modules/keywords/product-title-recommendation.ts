import "server-only";

import { getServerEnv, type ServerEnv } from "@/lib/env/server";
import { NaverSearchAdClient } from "./naver-search-ad-client";
import { createRulesAnalysis, createRulesTitle } from "./rules-keyword-client";
import {
  detectProductTitleAnalysis,
  normalizeProductTitleAnalysis,
  productTitleMaterialTerms,
  type ProductTitleAnalysisCriteria,
} from "./product-title-analysis";
import { normalizeKeyword, sanitizeKeyword } from "./keyword-utils";
import type { KeywordMetrics } from "./types";

export type ProductTitleRecommendationInput = {
  title: string;
  originalTitle?: string;
  categoryPath?: string;
  searchTags?: string[];
  maximumLength?: number;
  analysisCriteria?: ProductTitleAnalysisCriteria;
};

export type ProductTitleRecommendation = {
  title: string;
  source: "rules" | "rules_naver_search_ad";
  analysis: {
    productType: string;
    materials: string[];
    uses: string[];
    modifiers: string[];
    removedTerms: string[];
  };
  keywordEvidence: KeywordMetrics[];
  relatedKeywords: KeywordMetrics[];
  notices: string[];
};

type MetricsProvider = Pick<
  NaverSearchAdClient,
  "fetchKeywordMetrics" | "discoverKeywordMetrics"
>;

export class ProductTitleRecommendationService {
  constructor(private readonly metrics: MetricsProvider | null) {}

  async recommend(
    input: ProductTitleRecommendationInput,
  ): Promise<ProductTitleRecommendation> {
    const cleanTitle = sanitizeKeyword(input.title);
    const categoryPath = sanitizeKeyword(input.categoryPath ?? "");
    const productInput = {
      supplierTitle: cleanTitle,
      description: sanitizeKeyword(input.originalTitle ?? ""),
      category: categoryPath,
      features: [],
      materials: [],
      colors: [],
      sizes: [],
      target: "",
      seasons: [],
      supplierUrl: "",
      imageUrls: [],
      memo: "",
    };
    const detectedCriteria = detectProductTitleAnalysis(input);
    const parsed = normalizeProductTitleAnalysis(
      input.analysisCriteria ?? detectedCriteria,
    );
    if (!parsed.productType) {
      throw new Error("상품 유형을 입력한 뒤 다시 추천해 주세요.");
    }
    const analysis = {
      ...createRulesAnalysis(productInput, 20).productAnalysis,
      productType: parsed.productType,
      productTypes: [parsed.productType],
      primaryProductType: parsed.productType,
      productTypeStatus: "user_confirmed" as const,
    };
    const descriptorTerms = unique([
      ...parsed.materials,
      ...parsed.uses,
      ...parsed.modifiers,
    ]).slice(0, 6);
    const metricQueries = unique([
      analysis.productType,
      ...descriptorTerms.map((term) => `${term} ${analysis.productType}`),
    ]);

    let keywordEvidence: KeywordMetrics[] = [];
    let relatedKeywords: KeywordMetrics[] = [];
    const notices: string[] = [];
    if (this.metrics) {
      try {
        [keywordEvidence, relatedKeywords] = await Promise.all([
          this.metrics.fetchKeywordMetrics(metricQueries),
          this.metrics.discoverKeywordMetrics(metricQueries.slice(0, 5), 40),
        ]);
        relatedKeywords = relatedKeywords
          .filter(
            (item) =>
              !parsed.removedTerms.some((term) =>
                normalizeKeyword(item.keyword).includes(normalizeKeyword(term)),
              ) &&
              normalizeKeyword(item.keyword)
                .replace(/\s+/g, "")
                .includes(
                  normalizeKeyword(analysis.productType).replace(/\s+/g, ""),
                ) &&
              !hasConflictingMaterial(item.keyword, parsed.materials),
          )
          .sort(
            (left, right) =>
              (right.totalMonthlySearchVolume ?? -1) -
              (left.totalMonthlySearchVolume ?? -1),
          )
          .slice(0, 5);
      } catch {
        notices.push(
          "네이버 키워드 도구 조회에 실패해 입력 상품명 기반 규칙만 사용했습니다.",
        );
      }
    } else {
      notices.push(
        "네이버 검색광고 키가 없어 입력 상품명 기반 규칙만 사용했습니다.",
      );
    }

    const rankedDescriptors = rankDescriptors(
      descriptorTerms,
      analysis.productType,
      keywordEvidence,
      parsed,
    );
    const selectedKeywords = [
      ...rankedDescriptors.map((term) => `${term} ${analysis.productType}`),
      analysis.productType,
    ];
    const title = createRulesTitle({
      productInput,
      analysis: {
        ...analysis,
        materials: parsed.materials,
        features: unique([...parsed.uses, ...parsed.modifiers]),
      },
      selectedKeywords,
      maximumLength: input.maximumLength ?? 60,
      bannedWords: [],
    });

    if (!descriptorTerms.length) {
      notices.push(
        "상품 유형 외의 구체 속성을 찾지 못했습니다. 소재나 용도를 상품명에 추가하면 추천이 더 정확해집니다.",
      );
    }

    return {
      title,
      source: keywordEvidence.length > 0 ? "rules_naver_search_ad" : "rules",
      analysis: {
        productType: analysis.productType,
        materials: parsed.materials,
        uses: parsed.uses,
        modifiers: parsed.modifiers,
        removedTerms: parsed.removedTerms,
      },
      keywordEvidence,
      relatedKeywords,
      notices,
    };
  }
}

export function createProductTitleRecommendationService(
  env: ServerEnv = getServerEnv(),
) {
  const metrics =
    env.NAVER_SEARCH_AD_API_KEY &&
    env.NAVER_SEARCH_AD_SECRET_KEY &&
    env.NAVER_SEARCH_AD_CUSTOMER_ID
      ? new NaverSearchAdClient({
          baseUrl: env.NAVER_SEARCH_AD_API_URL,
          apiKey: env.NAVER_SEARCH_AD_API_KEY,
          secretKey: env.NAVER_SEARCH_AD_SECRET_KEY,
          customerId: env.NAVER_SEARCH_AD_CUSTOMER_ID,
          timeoutMs: env.NAVER_SEARCH_AD_TIMEOUT_MS,
        })
      : null;
  return new ProductTitleRecommendationService(metrics);
}

function rankDescriptors(
  terms: string[],
  productType: string,
  metrics: KeywordMetrics[],
  parsed: ProductTitleAnalysisCriteria,
) {
  const volumeByTerm = new Map<string, number>();
  for (const term of terms) {
    const query = normalizeKeyword(`${term} ${productType}`).replace(
      /\s+/g,
      "",
    );
    const metric = metrics.find(
      (item) => normalizeKeyword(item.keyword).replace(/\s+/g, "") === query,
    );
    volumeByTerm.set(
      normalizeKeyword(term),
      metric?.totalMonthlySearchVolume ?? -1,
    );
  }
  const group = (term: string) =>
    parsed.materials.includes(term) ? 0 : parsed.uses.includes(term) ? 1 : 2;
  return [...terms]
    .sort(
      (left, right) =>
        group(left) - group(right) ||
        (volumeByTerm.get(normalizeKeyword(right)) ?? -1) -
          (volumeByTerm.get(normalizeKeyword(left)) ?? -1),
    )
    .slice(0, 5);
}

function hasConflictingMaterial(keyword: string, selectedMaterials: string[]) {
  if (!selectedMaterials.length) return false;
  const normalizedKeyword = normalizeKeyword(keyword).replace(/\s+/g, "");
  const mentioned = productTitleMaterialTerms.filter((term) =>
    normalizedKeyword.includes(normalizeKeyword(term).replace(/\s+/g, "")),
  );
  if (!mentioned.length) return false;
  return !mentioned.some((term) =>
    selectedMaterials.some(
      (selected) => normalizeKeyword(selected) === normalizeKeyword(term),
    ),
  );
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizeKeyword(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
