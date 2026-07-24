import type {
  AnalysisResult,
  KeywordCompetition,
  KeywordMetrics,
  ManagedProductInput,
  ProductAnalysis,
} from "./types";
import { deduplicateKeywordCandidates, normalizeKeyword } from "./keyword-utils";
import { analyzeProductByRules } from "./rule-product-analyzer";

export type MockExternalApiScenario = "normal" | "partial-failure" | "full-failure";

const fixedVolumes = [
  [120, 680, "low"],
  [320, 1_240, "medium"],
  ["<10", 90, "low"],
  [1_200, 4_400, "medium"],
  [2_800, 9_200, "high"],
  [70, 310, "low"],
  [530, 2_100, "medium"],
  [4_300, 18_700, "high"],
  [210, 990, "low"],
  [890, 3_400, "medium"],
] as const;

export function createMockAnalysis(
  input: ManagedProductInput,
  candidateCount = 30,
): AnalysisResult {
  const titleTokens = input.supplierTitle.split(/\s+/).filter(Boolean);
  const productType = input.category || titleTokens.at(-1) || input.supplierTitle;
  const concepts = unique([
    input.supplierTitle,
    ...titleTokens,
    ...input.materials,
    ...input.features,
    ...input.colors,
    input.target,
    ...input.seasons,
    productType,
  ]).filter(Boolean);
  const analysis: ProductAnalysis = {
    ...analyzeProductByRules(input),
    searchConcepts: concepts.slice(0, 12),
  };
  const rawCandidates = [
    input.supplierTitle,
    ...concepts,
    ...pairConcepts(concepts),
    ...concepts.map((concept) => `${concept} ${productType}`),
    ...concepts.map((concept) => `${productType} ${concept}`),
    ...[
      "추천",
      "구매",
      "쇼핑",
      "가격",
      "후기",
      "비교",
      "온라인",
      "상품",
      "종류",
      "선택",
      "검색",
      "정보",
      "판매",
      "기획",
      "가이드",
    ].flatMap((modifier) => [
      `${input.supplierTitle} ${modifier}`,
      `${modifier} ${input.supplierTitle}`,
    ]),
  ].map((keyword) => ({
    keyword,
    reason: "Mock fixture: 입력된 상품 속성에서 조합한 후보입니다.",
    sourceConcepts: concepts.filter((concept) => keyword.includes(concept)).slice(0, 4),
  }));
  return {
    productAnalysis: analysis,
    keywordCandidates: deduplicateKeywordCandidates(rawCandidates, candidateCount),
    model: "mock-keyword-analyzer-v1",
    source: "mock",
  };
}

export function createMockMetrics(
  keywords: string[],
  scenario: MockExternalApiScenario = "normal",
): KeywordMetrics[] {
  return keywords.map((keyword, index) => {
    if (scenario === "full-failure" || (scenario === "partial-failure" && index % 4 === 3)) {
      return {
        keyword,
        monthlyPcSearchVolume: null,
        monthlyMobileSearchVolume: null,
        totalMonthlySearchVolume: null,
        rawMonthlyPcSearchVolume: null,
        rawMonthlyMobileSearchVolume: null,
        competition: "unknown",
        fetchedAt: new Date("2026-07-01T00:00:00.000Z").toISOString(),
        source: "mock",
        status: "error",
      };
    }
    const fixture = fixedVolumes[index % fixedVolumes.length]!;
    const pc = normalizeFixtureVolume(fixture[0]);
    const mobile = normalizeFixtureVolume(fixture[1]);
    return {
      keyword,
      monthlyPcSearchVolume: pc.normalized,
      monthlyMobileSearchVolume: mobile.normalized,
      totalMonthlySearchVolume: pc.normalized + mobile.normalized,
      rawMonthlyPcSearchVolume: fixture[0],
      rawMonthlyMobileSearchVolume: fixture[1],
      competition: fixture[2] as KeywordCompetition,
      fetchedAt: new Date("2026-07-01T00:00:00.000Z").toISOString(),
      source: "mock",
      status: "success",
    };
  });
}

export function createMockTitle(
  productTitle: string,
  selectedKeywords: string[],
  maximumLength: number,
) {
  const pieces = unique([...selectedKeywords, productTitle]);
  let result = "";
  for (const piece of pieces) {
    const candidate = result ? `${result} ${piece}` : piece;
    if (candidate.length > maximumLength) continue;
    result = candidate;
  }
  return result || productTitle.slice(0, maximumLength);
}

function pairConcepts(concepts: string[]) {
  const result: string[] = [];
  for (let left = 0; left < concepts.length; left += 1) {
    for (let right = left + 1; right < concepts.length; right += 1) {
      result.push(`${concepts[left]} ${concepts[right]}`);
      if (result.length >= 40) return result;
    }
  }
  return result;
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

function normalizeFixtureVolume(value: string | number) {
  if (typeof value === "number") return { normalized: value };
  const match = /^<\s*(\d+)$/.exec(value);
  return { normalized: match ? Number(match[1]) - 1 : Number(value) };
}
