import { describe, expect, it } from "vitest";
import {
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
  observedAt: "2026-08-16T00:00:00.000Z",
  samples: [],
  message: null,
};

describe("네이버쇼핑 키워드 노출 추천", () => {
  it("설정 비율 이상 상품명에 노출되면 상품명으로 추천한다", () => {
    expect(
      recommendKeywordPlacement({ ...base, titleMatchCount: 12 }, 30),
    ).toMatchObject({ placement: "product_name", titleThresholdCount: 12 });
  });

  it("상품명 기준 미달 후 부가정보와 카테고리 순으로 추천한다", () => {
    expect(
      recommendKeywordPlacement({ ...base, attributeMatchCount: 2 }),
    ).toMatchObject({ placement: "attribute" });
    expect(
      recommendKeywordPlacement({ ...base, categoryMatchCount: 1 }),
    ).toMatchObject({ placement: "category" });
  });

  it("노출 근거가 없을 때 태그 후보임을 추론한다", () => {
    const recommendation = recommendKeywordPlacement(base);
    expect(recommendation).toMatchObject({ placement: "tag" });
    expect(recommendation?.reason).toContain("실제 판매자 태그");
  });

  it("차단되거나 상품 카드를 읽지 못한 결과는 추천하지 않는다", () => {
    expect(
      recommendKeywordPlacement({ ...base, status: "blocked" }),
    ).toBeNull();
    expect(
      recommendKeywordPlacement({ ...base, productCount: 0 }),
    ).toBeNull();
  });
});
