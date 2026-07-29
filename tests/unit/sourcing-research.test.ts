import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { sourcingResearchInputSchema } from "@/modules/sourcing/schemas";
import { calculateMaximumPurchasePrice } from "@/modules/sourcing/sourcing-service";
import { defaultSourcingSignals } from "@/modules/sourcing/types";

describe("소싱 조사 규칙", () => {
  it("예상 판매가에서 목표 마진 30%를 제외한 단순 최대 구매단가를 계산한다", () => {
    expect(calculateMaximumPurchasePrice(30_000)).toBe(21_000);
    expect(calculateMaximumPurchasePrice(null)).toBeNull();
  });

  it("음수 금액과 잘못된 1688 URL을 거부한다", () => {
    const input = validInput();
    expect(
      sourcingResearchInputSchema.safeParse({
        ...input,
        monthlySearchVolume: -1,
      }).success,
    ).toBe(false);
    expect(
      sourcingResearchInputSchema.safeParse({
        ...input,
        samples: [
          { id: crypto.randomUUID(), url: "javascript:alert(1)", price: 100, features: "" },
        ],
      }).success,
    ).toBe(false);
  });

  it("미확인 체크 상태를 저장할 수 있다", () => {
    expect(sourcingResearchInputSchema.parse(validInput()).signals).toEqual(
      defaultSourcingSignals,
    );
  });

  it("조사 중인 소싱 아이템은 키워드 없이 임시저장할 수 있다", () => {
    expect(
      sourcingResearchInputSchema.safeParse({
        ...validInput(),
        sourcingKeyword: "",
        status: "researching",
      }).success,
    ).toBe(true);
    expect(
      sourcingResearchInputSchema.safeParse({
        ...validInput(),
        sourcingKeyword: "",
        status: "candidate",
      }).success,
    ).toBe(false);
  });
});

function validInput() {
  return {
    status: "researching" as const,
    sourcingKeyword: "욕실 선반",
    monthlySearchVolume: 10_000,
    sixMonthRevenue: 100_000_000,
    marketNotes: "",
    coupangAveragePrice: 20_000,
    naverAveragePrice: 22_000,
    expectedSellingPrice: 30_000,
    signals: defaultSourcingSignals,
    finalSellingPoint: "",
    positiveReviews: "",
    negativeReviews: "",
    customerNeeds: "",
    productSpecs: "",
    primaryTarget: "",
    referenceNotes: "",
    relatedKeywords: [],
    samples: [],
  };
}
