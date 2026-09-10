import { describe, expect, it, vi } from "vitest";
import { analyzeBulkProductKeywords } from "@/modules/products/bulk-keyword-analysis";
import type { KeywordMetrics } from "@/modules/keywords/types";

function metric(keyword: string, volume: number): KeywordMetrics {
  return {
    keyword,
    monthlyPcSearchVolume: Math.floor(volume / 2),
    monthlyMobileSearchVolume: Math.ceil(volume / 2),
    totalMonthlySearchVolume: volume,
    rawMonthlyPcSearchVolume: Math.floor(volume / 2),
    rawMonthlyMobileSearchVolume: Math.ceil(volume / 2),
    competition: "medium",
    fetchedAt: "2026-09-10T00:00:00.000Z",
    source: "naver-search-ad",
    status: "success",
  };
}

const base = {
  naverCategoryId: "500001",
  naverCategoryName: "생활 > 수납용품 > 리빙박스",
  sourceTitleKeywords: [] as string[],
  searchTags: [] as string[],
  draftVersion: 1,
};

describe("analyzeBulkProductKeywords", () => {
  it("카테고리가 같은 상품은 연관 키워드를 한 번만 조회한다", async () => {
    const discoverKeywordMetrics = vi.fn().mockResolvedValue([
      metric("리빙박스정리함", 800),
      metric("리빙박스수납", 4_000),
      metric("무관한주방칼", 900),
    ]);
    const fetchRecommendTags = vi.fn().mockResolvedValue([
      { code: 1, text: "공간정리" },
      { code: 2, text: "뚜껑형리빙박스" },
    ]);
    const result = await analyzeBulkProductKeywords([
      { ...base, id: "a", title: "접이식 리빙박스", originalName: "대형 접이식 리빙박스" },
      { ...base, id: "b", title: "투명 리빙박스", originalName: "투명 수납 리빙박스" },
    ], { discoverKeywordMetrics }, { fetchRecommendTags }, new Date("2026-09-10T00:00:00.000Z"));

    expect(discoverKeywordMetrics).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
    expect(result[0]!.keywordDrafts.map((item) => item.keyword)).not.toContain("무관한주방칼");
    expect(result[0]!.proposedTitle).toContain("리빙박스정리함");
    expect(result[0]!.proposedTags).toContain("뚜껑형리빙박스");
    expect(result[0]!.keywordDrafts[0]!.source).toBe("naver-search-ad");
  });

  it("공식 추천 태그가 없으면 기존 태그를 유지한다", async () => {
    const [result] = await analyzeBulkProductKeywords([
      { ...base, id: "a", title: "접이식 리빙박스", originalName: "접이식 리빙박스", searchTags: ["기존태그"] },
    ], { discoverKeywordMetrics: async () => [metric("리빙박스", 500)] }, { fetchRecommendTags: async () => [] });

    expect(result!.proposedTags).toEqual(["기존태그"]);
    expect(result!.warning).toContain("기존 태그를 유지");
  });
});
