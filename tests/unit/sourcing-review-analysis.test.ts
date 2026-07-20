import { describe, expect, it } from "vitest";
import {
  analyzeReviews,
  formatReviewEvidence,
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
    expect(analysis.negativeTerms).toContainEqual({ term: "접착력이나 고정력이 약해 쉽게 떨어짐", count: 2 });
    expect(analysis.customerNeedCandidates).toContain("접착력이나 고정력이 약해 쉽게 떨어짐 (2개 리뷰에서 확인)");
    expect(analysis.sellingPointCandidates).toContain("샘플에서 확인: 접착력이나 고정력이 약해 쉽게 떨어짐");
  });

  it("일반 단어는 제외하고 불편 유형과 반복 여부를 요약한다", () => {
    const reviews = parsePastedReviews([
      "1점 기능이 그런지 오래 기다리고 배송이 늦었어요",
      "2점 배송을 너무 오래 기다렸어요",
      "3점 기능이 생각보다 별로예요",
      "5점 튼튼하고 사용하기 편해요",
    ].join("\n"));
    const analysis = analyzeReviews(reviews);

    expect(analysis.negativeTerms).toContainEqual({ term: "배송이나 도착이 예상보다 늦음", count: 2 });
    expect(analysis.negativeTerms.map((item) => item.term)).not.toEqual(
      expect.arrayContaining(["그런지", "기능이", "기다리고"]),
    );
    expect(analysis.positiveTerms).toEqual(expect.arrayContaining([
      { term: "튼튼하고 견고하다는 평가가 있음", count: 1 },
      { term: "사용이 쉽고 편리하다는 평가가 있음", count: 1 },
    ]));
    const summary = formatReviewEvidence(analysis.negativeTerms, analysis.negativeExamples);
    expect(summary).toContain("배송이나 도착이 예상보다 늦음: 2개 리뷰에서 확인 (반복)");
    expect(summary).not.toContain("오래 기다리고");
  });

  it("욕실화 혼합 리뷰에서 건조 시간을 배송 지연으로 오해하지 않고 항목별로 분류한다", () => {
    const reviews = parsePastedReviews([
      "물빠짐 전혀 안되고 건조 넘 오래 걸림. 모양만 이쁜 기능이 전혀없는 비싼 욕실화예요",
      "너무 지저분해보여요. 반품할 걸 후회합니다.",
      "슬리퍼 바닥이 너무 얇아서 구멍으로 물이 올라옵니다. 너무 딱딱합니다.",
      "디자인이 좋아서 샀는데 너무 딱딱하고 까슬거리며 모퉁이를 밟으면 고통스럽고 위험해요. 폭도 넓고 크기도 커서 잘 안쓰네요. 실용성은 글쎄요.",
    ].join("\n"));
    const analysis = analyzeReviews(reviews);

    expect(analysis.negativeTerms).toEqual(expect.arrayContaining([
      { term: "딱딱하거나 까슬해 오래 신기 불편함", count: 2 },
      { term: "디자인은 괜찮지만 실제 사용 기능이 부족함", count: 2 },
      { term: "가격에 비해 기능이 부족해 구매를 후회함", count: 2 },
      { term: "물이 잘 빠지지 않고 바닥이 오래 젖어 있음", count: 1 },
      { term: "바닥이 얇아 구멍으로 물이 발에 올라옴", count: 1 },
      { term: "모서리나 표면 마감 때문에 다칠 위험이 있음", count: 1 },
      { term: "크기나 폭이 맞지 않아 실제 사용이 불편함", count: 1 },
      { term: "외관이나 마감이 지저분해 보임", count: 1 },
    ]));
    expect(analysis.negativeTerms).not.toContainEqual(
      expect.objectContaining({ term: "배송이나 도착이 예상보다 늦음" }),
    );
    expect(analysis.positiveTerms).toContainEqual({
      term: "디자인과 외관이 좋다는 평가가 있음",
      count: 2,
    });
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
