import { describe, expect, it } from "vitest";
import { assessSearchTag } from "@/modules/keywords/search-tag-quality";

describe("검색 태그 품질 검사", () => {
  it("배송·할인 문구와 상품명 중복을 구분한다", () => {
    expect(
      assessSearchTag("무료배송욕실", {
        title: "미끄럼방지 욕실화",
      }).map((issue) => issue.code),
    ).toEqual(["promotional-term"]);
    expect(
      assessSearchTag("욕실화", {
        title: "미끄럼방지 욕실화",
      }).map((issue) => issue.code),
    ).toEqual(["duplicate-product-info"]);
  });

  it("상품명에 없는 구체적인 보조 태그는 허용한다", () => {
    expect(
      assessSearchTag("화장실슬리퍼", {
        title: "미끄럼방지 욕실화",
      }),
    ).toEqual([]);
  });
});
