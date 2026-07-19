import { describe, expect, it } from "vitest";
import {
  analyzeReviews,
  parsePastedReviews,
  parseReviewCsv,
  parseReviewRows,
} from "@/modules/sourcing/review-analysis";

describe("소싱 리뷰 규칙 분석", () => {
  it("붙여넣은 리뷰의 별점을 읽고 장점과 단점을 분리한다", () => {
    const reviews = parsePastedReviews([
      "5점 튼튼하고 설치가 편해서 좋아요",
      "1점 접착력이 약해 바로 떨어져요",
      "2점 접착력이 약하고 자꾸 떨어져요",
    ].join("\n"));
    const analysis = analyzeReviews(reviews);

    expect(analysis.totalCount).toBe(3);
    expect(analysis.positiveCount).toBe(1);
    expect(analysis.negativeCount).toBe(2);
    expect(analysis.negativeTerms).toContainEqual({ term: "접착력이", count: 2 });
    expect(analysis.customerNeedCandidates).toContain("접착력과 고정력 개선 필요 (2개 리뷰에서 확인)");
    expect(analysis.sellingPointCandidates).toContain("접착력과 고정력 항목을 샘플에서 우선 확인");
  });

  it("CSV의 따옴표와 쉼표가 포함된 리뷰를 읽는다", () => {
    const reviews = parseReviewCsv('평점,리뷰 내용\n5,"튼튼하고, 좋아요"\n1,"너무 약해요"');
    expect(reviews).toEqual([
      { rating: 5, content: "튼튼하고, 좋아요" },
      { rating: 1, content: "너무 약해요" },
    ]);
  });

  it("엑셀 열 이름에서 리뷰 내용과 별점을 찾는다", () => {
    expect(parseReviewRows([
      ["작성일", "상품 리뷰", "별점"],
      ["2026-07-19", "설치가 편리합니다", 4],
    ])).toEqual([{ content: "설치가 편리합니다", rating: 4 }]);
  });

  it("별점 표시가 없는 수량 문장을 별점으로 오해하지 않는다", () => {
    expect(parsePastedReviews("1개만 들어 있어서 아쉬워요")).toEqual([
      { content: "1개만 들어 있어서 아쉬워요", rating: null },
    ]);
  });
});
