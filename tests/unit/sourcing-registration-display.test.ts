import { describe, expect, it } from "vitest";
import { registrationDisplay } from "@/modules/sourcing/registration-display";

describe("소싱 등록 목록 표시", () => {
  it("스마트스토어 등록 완료 상품은 등록 판매가와 완료 상태를 표시한다", () => {
    expect(
      registrationDisplay({
        expectedSellingPrice: 12_000,
        productSellingPrice: 15_900,
        registrationProductId: "product-1",
        productStatus: "ready",
        smartstorePublished: true,
      }),
    ).toEqual({
      sellingPrice: 15_900,
      statusClassName: "published",
      statusLabel: "스마트스토어 등록완료",
    });
  });

  it("등록 전 상품은 소싱 예상 판매가와 기존 준비 상태를 유지한다", () => {
    expect(
      registrationDisplay({
        expectedSellingPrice: 12_000,
        productSellingPrice: 15_900,
        registrationProductId: "product-1",
        productStatus: "ready",
        smartstorePublished: false,
      }),
    ).toEqual({
      sellingPrice: 12_000,
      statusClassName: "ready",
      statusLabel: "등록 준비 완료",
    });
  });
});
