import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ProductTitleRecommendationService } from "@/modules/keywords/product-title-recommendation";
import type { KeywordMetrics } from "@/modules/keywords/types";

describe("판매용 상품명 추천", () => {
  it("상품 유형·소재·용도를 분리하고 네이버 검색량을 근거로 간결한 제목을 만든다", async () => {
    const metrics = {
      fetchKeywordMetrics: vi.fn(async (keywords: string[]) =>
        keywords.map((keyword, index) =>
          metric(keyword, [3290, 18, 220][index] ?? 0),
        ),
      ),
      discoverKeywordMetrics: vi.fn(async () => [
        metric("바느질골무", 220),
        metric("고무골무", 800),
        metric("코바늘", 9000),
      ]),
    };
    const service = new ProductTitleRecommendationService(metrics);

    const result = await service.recommend({
      title: "철제 바느질 골무 바느질부자재 무료배송",
      originalTitle: "철제 바느질 골무",
      categoryPath: "생활/건강 > 수예 > 골무",
    });

    expect(result).toMatchObject({
      title: "철제 바느질 골무",
      source: "rules_naver_search_ad",
      analysis: {
        productType: "골무",
        materials: ["철제"],
        uses: ["바느질"],
        removedTerms: ["바느질부자재", "무료배송"],
      },
    });
    expect(result.relatedKeywords.map((item) => item.keyword)).toEqual([
      "바느질골무",
    ]);
    expect(metrics.fetchKeywordMetrics).toHaveBeenCalledWith([
      "골무",
      "철제 골무",
      "바느질 골무",
    ]);
  });

  it("검색광고 키가 없어도 규칙 추천을 반환하고 한계를 알린다", async () => {
    const result = await new ProductTitleRecommendationService(null).recommend({
      title: "철제 바느질 골무 바느질부자재",
      categoryPath: "생활/건강 > 수예 > 골무",
    });

    expect(result.title).toBe("철제 바느질 골무");
    expect(result.source).toBe("rules");
    expect(result.notices).toContain(
      "네이버 검색광고 키가 없어 입력 상품명 기반 규칙만 사용했습니다.",
    );
  });

  it("사용자가 수정한 상품 분석 기준을 자동 감지값보다 우선한다", async () => {
    const metrics = {
      fetchKeywordMetrics: vi.fn(async (keywords: string[]) =>
        keywords.map((keyword) => metric(keyword, 100)),
      ),
      discoverKeywordMetrics: vi.fn(async () => [
        metric("캠핑공구가방", 500),
        metric("사무용가방", 900),
      ]),
    };

    const result = await new ProductTitleRecommendationService(
      metrics,
    ).recommend({
      title: "다용도 가방 무료배송",
      categoryPath: "생활 > 수납",
      analysisCriteria: {
        productType: "공구가방",
        materials: ["철제"],
        uses: ["캠핑"],
        modifiers: ["휴대용"],
        removedTerms: ["무료배송", "사무용"],
      },
    });

    expect(result.analysis).toEqual({
      productType: "공구가방",
      materials: ["철제"],
      uses: ["캠핑"],
      modifiers: ["휴대용"],
      removedTerms: ["무료배송", "사무용"],
    });
    expect(metrics.fetchKeywordMetrics).toHaveBeenCalledWith([
      "공구가방",
      "철제 공구가방",
      "캠핑 공구가방",
      "휴대용 공구가방",
    ]);
    expect(result.relatedKeywords.map((item) => item.keyword)).toEqual([
      "캠핑공구가방",
    ]);
  });
});

function metric(keyword: string, total: number): KeywordMetrics {
  return {
    keyword,
    monthlyPcSearchVolume: Math.floor(total / 4),
    monthlyMobileSearchVolume: total - Math.floor(total / 4),
    totalMonthlySearchVolume: total,
    rawMonthlyPcSearchVolume: String(Math.floor(total / 4)),
    rawMonthlyMobileSearchVolume: String(total - Math.floor(total / 4)),
    competition: "medium",
    fetchedAt: "2026-07-19T00:00:00.000Z",
    source: "naver-search-ad",
    status: "success",
  };
}
