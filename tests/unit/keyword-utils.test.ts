import { describe, expect, it } from "vitest";
import { validateKeywordThresholds } from "@/modules/keywords/config";
import { filterAndSortKeywords } from "@/modules/keywords/keyword-filter";
import {
  classifyKeywordSize,
  deduplicateKeywordCandidates,
  extractSmartstoreProductNo,
  formatRawTotalSearchVolume,
  normalizeKeyword,
  normalizeSearchVolume,
  sumSearchVolumes,
} from "@/modules/keywords/keyword-utils";
import type {
  KeywordCandidateRecord,
  KeywordFilterState,
} from "@/modules/keywords/types";

describe("키워드 정규화와 검색량", () => {
  it("공백과 유니코드를 정규화하고 같은 키워드를 중복 제거한다", () => {
    expect(normalizeKeyword("  여성   Ｔ셔츠 ")).toBe("여성 t셔츠");
    expect(
      deduplicateKeywordCandidates([
        { keyword: " 여성  원피스 ", reason: "첫 후보", sourceConcepts: ["여성"] },
        { keyword: "여성 원피스", reason: "중복", sourceConcepts: ["원피스"] },
        { keyword: "상품을 설명하는 긴 문장입니다.", reason: "문장", sourceConcepts: [] },
      ]),
    ).toEqual([
      { keyword: "여성 원피스", reason: "첫 후보", sourceConcepts: ["여성"] },
    ]);
  });

  it("< 10 원문은 보존하고 내부 비교값만 9로 정규화한다", () => {
    expect(normalizeSearchVolume("< 10")).toEqual({
      raw: "< 10",
      normalized: 9,
      upperBound: 10,
      isRange: true,
    });
    const pc = normalizeSearchVolume("< 10");
    const mobile = normalizeSearchVolume(120);
    expect(sumSearchVolumes(pc, mobile)).toBe(129);
    expect(
      formatRawTotalSearchVolume({
        rawMonthlyPcSearchVolume: "< 10",
        rawMonthlyMobileSearchVolume: 120,
        totalMonthlySearchVolume: 129,
      }),
    ).toBe("< 130");
  });

  it("검색량 경계값을 빈틈없이 분류한다", () => {
    expect(classifyKeywordSize(null)).toBe("unclassified");
    expect(classifyKeywordSize(0)).toBe("unclassified");
    expect(classifyKeywordSize(1)).toBe("small");
    expect(classifyKeywordSize(999)).toBe("small");
    expect(classifyKeywordSize(1_000)).toBe("small");
    expect(classifyKeywordSize(1_001)).toBe("medium");
    expect(classifyKeywordSize(9_999)).toBe("medium");
    expect(classifyKeywordSize(10_000)).toBe("large");
    expect(
      validateKeywordThresholds({
        smallMin: 1,
        smallMax: 1_000,
        mediumMin: 1_002,
        mediumMax: 9_999,
        largeMin: 10_000,
      }),
    ).toBe(false);
  });

  it("공식 스마트스토어 상품 링크에서 상품번호만 추출한다", () => {
    expect(
      extractSmartstoreProductNo(
        "https://smartstore.naver.com/sample/products/1234567890",
      ),
    ).toBe("1234567890");
    expect(
      extractSmartstoreProductNo("https://brand.naver.com/sample/products/987654321"),
    ).toBe("987654321");
    expect(extractSmartstoreProductNo("https://example.com/products/123"))
      .toBeNull();
  });
});

describe("키워드 필터와 정렬", () => {
  const items = [
    keyword("small", "여성 원피스", 700, 2, true, "low"),
    keyword("medium", "여성 린넨 원피스", 5_000, 1, false, "medium"),
    keyword("large", "원피스", 20_000, 0, false, "high"),
    keyword("unclassified", "조회 실패 키워드", null, 3, false, "unknown"),
  ];

  it("그룹·검색량·경쟁도·텍스트 필터와 정렬을 일반 코드로 처리한다", () => {
    const filters: KeywordFilterState = {
      size: "medium",
      minimumVolume: 1_000,
      maximumVolume: 9_999,
      competition: "medium",
      search: "린넨",
      selectedOnly: false,
      sort: "total-desc",
    };
    expect(filterAndSortKeywords(items, filters).map((item) => item.keyword)).toEqual([
      "여성 린넨 원피스",
    ]);
  });

  it("필터 함수가 원본 선택 상태를 변경하지 않는다", () => {
    const originalSelection = items.map((item) => item.isSelected);
    const result = filterAndSortKeywords(items, {
      size: "all",
      minimumVolume: 0,
      maximumVolume: null,
      competition: "all",
      search: "",
      selectedOnly: false,
      sort: "total-desc",
    });
    expect(result.map((item) => item.keyword)).toEqual([
      "원피스",
      "여성 린넨 원피스",
      "여성 원피스",
      "조회 실패 키워드",
    ]);
    expect(items.map((item) => item.isSelected)).toEqual(originalSelection);
  });
});

function keyword(
  size: KeywordCandidateRecord["keywordSize"],
  value: string,
  total: number | null,
  recommendationOrder: number,
  selected: boolean,
  competition: KeywordCandidateRecord["competition"],
): KeywordCandidateRecord {
  return {
    id: value,
    keyword: value,
    normalizedKeyword: normalizeKeyword(value),
    recommendationReason: "",
    sourceConcepts: [],
    recommendationOrder,
    origin: "rule_combination",
    reviewStatus: "candidate",
    filterReasons: [],
    relevanceScore: null,
    monthlyPcSearchVolume: total == null ? null : Math.floor(total / 3),
    monthlyMobileSearchVolume: total == null ? null : total - Math.floor(total / 3),
    totalMonthlySearchVolume: total,
    rawMonthlyPcSearchVolume: total == null ? null : String(Math.floor(total / 3)),
    rawMonthlyMobileSearchVolume:
      total == null ? null : String(total - Math.floor(total / 3)),
    competition,
    keywordSize: size,
    metricsStatus: total == null ? "error" : "success",
    metricsSource: total == null ? null : "mock",
    metricsFetchedAt: total == null ? null : new Date("2026-01-01T00:00:00Z"),
    isSelected: selected,
  };
}
