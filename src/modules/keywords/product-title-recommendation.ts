import "server-only";

import { getServerEnv, type ServerEnv } from "@/lib/env/server";
import { NaverSearchAdClient } from "./naver-search-ad-client";
import { createRulesAnalysis, createRulesTitle } from "./rules-keyword-client";
import {
  genericProductTypePattern,
  promotionalTitleTerms,
} from "./title-quality";
import { normalizeKeyword, sanitizeKeyword } from "./keyword-utils";
import type { KeywordMetrics } from "./types";

const materialTerms = [
  "스테인리스",
  "스테인레스",
  "스텐",
  "철제",
  "금속",
  "고무",
  "실리콘",
  "가죽",
  "플라스틱",
  "아크릴",
  "원목",
  "나무",
  "유리",
  "면",
  "린넨",
  "폴리에스터",
] as const;

const useTerms = [
  "바느질",
  "재봉",
  "공예",
  "수납",
  "보관",
  "정리",
  "거치",
  "캠핑",
  "주방",
  "욕실",
  "차량",
  "사무",
  "작업",
  "청소",
  "운동",
  "낚시",
] as const;

const generalTerms = new Set([
  "남성",
  "여성",
  "아동",
  "유아",
  "성인",
  "휴대용",
  "미니",
  "대형",
  "소형",
  "다용도",
]);

export type ProductTitleRecommendationInput = {
  title: string;
  originalTitle?: string;
  categoryPath?: string;
  searchTags?: string[];
  maximumLength?: number;
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
    const analysis = createRulesAnalysis(productInput, 20).productAnalysis;
    const parsed = parseTitleParts(cleanTitle, analysis.productType);
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
              normalizeKeyword(item.keyword)
                .replace(/\s+/g, "")
                .includes(normalizeKeyword(analysis.productType).replace(/\s+/g, "")) &&
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
      source:
        keywordEvidence.length > 0
          ? "rules_naver_search_ad"
          : "rules",
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

function parseTitleParts(title: string, productType: string) {
  const productTypeNormalized = normalizeKeyword(productType);
  const removedTerms: string[] = [];
  const materials: string[] = [];
  const uses: string[] = [];
  const modifiers: string[] = [];

  for (const token of tokenize(title)) {
    const normalized = normalizeKeyword(token);
    if (normalized === productTypeNormalized) continue;
    if (
      promotionalTitleTerms.some((term) => normalized.includes(normalizeKeyword(term))) ||
      genericProductTypePattern.test(token)
    ) {
      removedTerms.push(token);
      continue;
    }
    const material = materialTerms.find((term) => normalized.includes(normalizeKeyword(term)));
    if (material) {
      materials.push(material);
      continue;
    }
    const use = useTerms.find((term) => normalized.includes(normalizeKeyword(term)));
    if (use) {
      uses.push(use);
      continue;
    }
    if (generalTerms.has(normalized) || token.length <= 8) modifiers.push(token);
  }

  return {
    materials: unique(materials),
    uses: unique(uses),
    modifiers: unique(modifiers),
    removedTerms: unique(removedTerms),
  };
}

function rankDescriptors(
  terms: string[],
  productType: string,
  metrics: KeywordMetrics[],
  parsed: ReturnType<typeof parseTitleParts>,
) {
  const volumeByTerm = new Map<string, number>();
  for (const term of terms) {
    const query = normalizeKeyword(`${term} ${productType}`).replace(/\s+/g, "");
    const metric = metrics.find(
      (item) => normalizeKeyword(item.keyword).replace(/\s+/g, "") === query,
    );
    volumeByTerm.set(normalizeKeyword(term), metric?.totalMonthlySearchVolume ?? -1);
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
  const mentioned = materialTerms.filter((term) =>
    normalizedKeyword.includes(normalizeKeyword(term).replace(/\s+/g, "")),
  );
  if (!mentioned.length) return false;
  return !mentioned.some((term) =>
    selectedMaterials.some(
      (selected) => normalizeKeyword(selected) === normalizeKeyword(term),
    ),
  );
}

function tokenize(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[>｜|/,[\](){}]+/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((token) => token.length > 1);
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
