import { describe, expect, it } from "vitest";
import {
  calculateOperatingHypothesisScore,
  shoppingSearchOperatingHypotheses,
} from "@/modules/keywords/shopping-search-operating-hypotheses";

describe("스마트스토어 순위 운영 가설", () => {
  it("사용자가 지정한 필드 순서와 초기 공략 기준을 보존한다", () => {
    expect(shoppingSearchOperatingHypotheses.fieldPriority).toEqual([
      "상품명", "스토어명", "카테고리", "속성", "태그",
    ]);
    expect(shoppingSearchOperatingHypotheses.resultPageSize).toBe(40);
    expect(
      shoppingSearchOperatingHypotheses.plusStorePersonalizedResults,
    ).toBe(true);
    expect(
      shoppingSearchOperatingHypotheses.uniformResultsAssumptionScope,
    ).toBe("price-comparison-sampling-only");
    expect(shoppingSearchOperatingHypotheses.popularityWindowLabel).toBe(
      "최근 1개월",
    );
    expect(shoppingSearchOperatingHypotheses.beginnerMaximumMonthlySearchVolume).toBe(1_000);
  });

  it("세 실제 입력이 모두 있을 때만 가설 점수를 곱한다", () => {
    expect(calculateOperatingHypothesisScore({
      popularity: 5_000,
      relevance: 0.5,
      trust: 1,
    })).toBe(2_500);
    expect(calculateOperatingHypothesisScore({
      popularity: null,
      relevance: 0.5,
      trust: 1,
    })).toBeNull();
  });

  it("N+스토어는 실제 선호도 입력이 있을 때만 점수를 계산한다", () => {
    expect(
      calculateOperatingHypothesisScore({
        popularity: 5_000,
        relevance: 0.5,
        trust: 1,
        surface: "plus-store",
        preference: null,
      }),
    ).toBeNull();
    expect(
      calculateOperatingHypothesisScore({
        popularity: 5_000,
        relevance: 0.5,
        trust: 1,
        surface: "plus-store",
        preference: 0.8,
      }),
    ).toBe(2_000);
  });
});
