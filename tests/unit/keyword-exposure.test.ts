import { describe, expect, it } from "vitest";
import {
  allocateAutomaticKeywordPlacements,
  assessKeywordContext,
  recommendKeywordPlacement,
  type KeywordExposureResult,
} from "@/modules/sourcing/keyword-exposure";

const base: KeywordExposureResult = {
  keyword: "욕실화",
  device: "pc",
  status: "completed",
  productCount: 40,
  titleMatchCount: 0,
  attributeMatchCount: 0,
  categoryMatchCount: 0,
  contextKeyword: "욕실화",
  contextMatchCount: 40,
  contextCategoryId: "",
  contextCategoryName: "",
  contextCategoryMatchCount: 0,
  categoryDistribution: [],
  observedAt: "2026-08-16T00:00:00.000Z",
  samples: [],
  message: null,
};

describe("네이버쇼핑 키워드 노출 추천", () => {
  it("기본 상품명 다수 기준은 광고 제외 결과의 50%다", () => {
    expect(
      recommendKeywordPlacement({ ...base, titleMatchCount: 20 }),
    ).toMatchObject({ placement: "product_name", titleThresholdCount: 20 });
    expect(
      recommendKeywordPlacement({
        ...base,
        titleMatchCount: 19,
        attributeMatchCount: 1,
      }),
    ).toMatchObject({ placement: "product_name", titleThresholdCount: 20 });
  });

  it("설정 비율 이상 상품명에 노출되면 상품명으로 추천한다", () => {
    expect(
      recommendKeywordPlacement({ ...base, titleMatchCount: 12 }, 30),
    ).toMatchObject({ placement: "product_name", titleThresholdCount: 12 });
  });

  it("상품 카드 부가정보만으로 공식 속성이라고 판단하지 않는다", () => {
    expect(
      recommendKeywordPlacement({ ...base, attributeMatchCount: 2 }),
    ).toMatchObject({ placement: "product_name" });
  });

  it("상품명 기준 미달 후 예상 카테고리의 공식 속성값이면 속성으로 추천한다", () => {
    expect(
      recommendKeywordPlacement(
        { ...base, attributeMatchCount: 2 },
        50,
        undefined,
        {
          categoryId: "50000000",
          categoryName: "생활/건강",
          attributeSeq: 10,
          attributeName: "타입",
          attributeValueSeq: 11,
          attributeValueName: "욕실화",
        },
      ),
    ).toMatchObject({ placement: "attribute" });
  });

  it("공식 속성·태그가 아니고 카테고리에서 확인되면 카테고리로 추천한다", () => {
    expect(
      recommendKeywordPlacement({ ...base, categoryMatchCount: 1 }),
    ).toMatchObject({ placement: "category" });
  });

  it("노출 근거가 없고 추천 태그사전에 정확 일치하면 태그로 추천한다", () => {
    const recommendation = recommendKeywordPlacement(base, 30, {
      keyword: "욕실화",
      status: "registered",
      exactTag: { code: 123, text: "욕실화" },
      candidates: [{ code: 123, text: "욕실화" }],
      message: null,
    });
    expect(recommendation).toMatchObject({ placement: "tag" });
    expect(recommendation?.reason).toContain("정확 일치 태그");
  });

  it("추천 태그사전에 없고 공식 속성·카테고리도 아니면 상품명으로 분류한다", () => {
    expect(
      recommendKeywordPlacement(base, 30, {
        keyword: "두부짜기",
        status: "unregistered",
        exactTag: null,
        candidates: [],
        message: null,
      }),
    ).toMatchObject({ placement: "product_name" });
  });

  it("상품명 다수 기준은 공식 속성과 공식 태그보다 우선한다", () => {
    expect(
      recommendKeywordPlacement(
        { ...base, titleMatchCount: 20 },
        50,
        {
          keyword: "욕실화",
          status: "registered",
          exactTag: { code: 123, text: "욕실화" },
          candidates: [{ code: 123, text: "욕실화" }],
          message: null,
        },
        {
          categoryId: "50000000",
          categoryName: "생활/건강",
          attributeSeq: 10,
          attributeName: "타입",
          attributeValueSeq: 11,
          attributeValueName: "욕실화",
        },
      ),
    ).toMatchObject({ placement: "product_name" });
  });

  it("차단되거나 상품 카드를 읽지 못한 결과는 추천하지 않는다", () => {
    expect(
      recommendKeywordPlacement({ ...base, status: "blocked" }),
    ).toBeNull();
    expect(
      recommendKeywordPlacement({ ...base, productCount: 0 }),
    ).toBeNull();
  });

  it("기준 상품과 연결된 결과가 20% 미만이면 검색 의도 불일치로 보고 추천하지 않는다", () => {
    const mismatched = {
      ...base,
      keyword: "스피너",
      contextKeyword: "야채짤순이",
      contextMatchCount: 3,
      titleMatchCount: 30,
    };

    expect(assessKeywordContext(mismatched)).toMatchObject({
      mismatched: true,
      thresholdCount: 8,
    });
    expect(recommendKeywordPlacement(mismatched)).toBeNull();
  });

  it("단독 검색 카테고리가 달라도 선택 카테고리 공식 속성이면 속성으로 추천한다", () => {
    const mismatched = {
      ...base,
      keyword: "스피너",
      contextKeyword: "야채짤순이",
      contextCategoryId: "50000001",
      contextCategoryName: "야채탈수기",
      contextCategoryMatchCount: 2,
      titleMatchCount: 30,
    };

    expect(
      recommendKeywordPlacement(mismatched, 50, undefined, {
        categoryId: "50000001",
        categoryName: "야채탈수기",
        attributeSeq: 10,
        attributeName: "타입",
        attributeValueSeq: 101,
        attributeValueName: "스피너",
      }),
    ).toMatchObject({ placement: "attribute" });
  });

  it("단독 검색 카테고리가 달라도 정확 일치 공식 태그이면 태그로 추천한다", () => {
    expect(
      recommendKeywordPlacement(
        {
          ...base,
          keyword: "스피너",
          contextKeyword: "야채짤순이",
          contextCategoryId: "50000001",
          contextCategoryName: "야채탈수기",
          contextCategoryMatchCount: 2,
        },
        50,
        {
          keyword: "스피너",
          status: "registered",
          exactTag: { code: 123, text: "스피너" },
          candidates: [{ code: 123, text: "스피너" }],
          message: null,
        },
      ),
    ).toMatchObject({ placement: "tag" });
  });

  it("카테고리를 선택한 분석은 상품명보다 선택 카테고리 일치를 관련성 기준으로 사용한다", () => {
    const mismatched = {
      ...base,
      keyword: "유청분리기",
      titleMatchCount: 36,
      contextMatchCount: 5,
      contextCategoryId: "50000001",
      contextCategoryName: "야채탈수기",
      contextCategoryMatchCount: 0,
    };

    expect(assessKeywordContext(mismatched)).toMatchObject({
      mismatched: true,
      thresholdCount: 8,
    });
    expect(assessKeywordContext(mismatched).reason).toContain(
      "선택 카테고리 '야채탈수기'",
    );
    expect(recommendKeywordPlacement(mismatched)).toBeNull();
  });

  it("전체 자동분류는 상품명 후보를 모두 유지하고 상품명 조합과 공식 태그 풀을 별도로 계산한다", () => {
    const analyses = Array.from({ length: 20 }, (_, index) => {
      const number = index + 1;
      return {
        item: {
          id: `keyword-${number}`,
          keyword: `키워드${number}`,
          monthlySearchVolume: 1_000 - index * 50,
        },
        recommendation: {
          placement: "product_name" as const,
          titleThresholdCount: 20,
          reason: "상품명 40/40",
        },
        tagDictionary: {
          keyword: `키워드${number}`,
          status: "registered" as const,
          exactTag: { code: number, text: `키워드${number}` },
          candidates: [{ code: number, text: `키워드${number}` }],
          message: null,
        },
        officialAttribute: null,
        requiresReview: false,
      };
    });

    const allocation = allocateAutomaticKeywordPlacements(analyses);

    expect(allocation.titleKeywordIds).toEqual(
      Array.from({ length: 10 }, (_, index) => `keyword-${index + 1}`),
    );
    expect(allocation.productNameKeywordIds).toHaveLength(20);
    expect(allocation.tagKeywordIds).toHaveLength(20);
    expect(allocation.placements["keyword-1"]).toBe("product_name");
    expect(allocation.placements["keyword-11"]).toBe("product_name");
  });

  it("상품명 노출 기준을 충족한 후보는 조합 검토 대상에서 빠져도 상품명 분류를 유지한다", () => {
    const primary = [3_000, 2_500, 2_000].map((volume, index) => ({
      item: { id: `primary-${index}`, keyword: `핵심${index}`, monthlySearchVolume: volume },
      recommendation: {
        placement: "product_name" as const,
        titleThresholdCount: 20,
        reason: "상품명 40/40",
      },
      tagDictionary: {
        keyword: `핵심${index}`,
        status: "unregistered" as const,
        exactTag: null,
        candidates: [],
        message: null,
      },
      officialAttribute: null,
      requiresReview: false,
    }));
    const allocation = allocateAutomaticKeywordPlacements([...primary, {
      item: { id: "spinner", keyword: "스피너", monthlySearchVolume: 1_500 },
      recommendation: {
        placement: "product_name",
        titleThresholdCount: 20,
        reason: "상품명 40/40",
      },
      tagDictionary: {
        keyword: "스피너",
        status: "registered",
        exactTag: { code: 1, text: "스피너" },
        candidates: [{ code: 1, text: "스피너" }],
        message: null,
      },
      officialAttribute: {
        categoryId: "50000001",
        categoryName: "야채탈수기",
        attributeSeq: 10,
        attributeName: "타입",
        attributeValueSeq: 101,
        attributeValueName: "스피너",
      },
      requiresReview: false,
    }]);

    expect(allocation.placements.spinner).toBe("product_name");
  });
});
