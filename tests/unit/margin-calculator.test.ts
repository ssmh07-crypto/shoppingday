import { describe, expect, it } from "vitest";
import { calculateSellingPrice } from "@/modules/pricing/margin-calculator";

describe("판매가 계산기", () => {
  it("공급가·배송비·수수료와 목표 실마진을 모두 역산한다", () => {
    const result = calculateSellingPrice({
      supplierCost: 10_000,
      sellerShippingCost: 3_000,
      packagingAndFixedCost: 500,
      buyerShippingCharge: 0,
      feeRatePercent: 6,
      targetMarginPercent: 20,
      roundingUnit: 10,
    });
    expect(result.sellingPrice).toBe(18_250);
    expect(result.expectedFee).toBe(1_095);
    expect(result.expectedProfit).toBe(3_655);
    expect(result.expectedMarginPercent).toBeGreaterThanOrEqual(20);
  });

  it("구매자가 낸 배송비를 필요한 판매가에서 차감한다", () => {
    const freeShipping = calculateSellingPrice({
      supplierCost: 10_000,
      sellerShippingCost: 3_000,
      packagingAndFixedCost: 0,
      buyerShippingCharge: 0,
      feeRatePercent: 5,
      targetMarginPercent: 20,
    });
    const paidShipping = calculateSellingPrice({
      supplierCost: 10_000,
      sellerShippingCost: 3_000,
      packagingAndFixedCost: 0,
      buyerShippingCharge: 3_000,
      feeRatePercent: 5,
      targetMarginPercent: 20,
    });
    expect(paidShipping.sellingPrice).toBeLessThan(freeShipping.sellingPrice);
  });

  it("수수료와 목표 마진의 합이 100% 이상이면 거부한다", () => {
    expect(() =>
      calculateSellingPrice({
        supplierCost: 10_000,
        sellerShippingCost: 0,
        packagingAndFixedCost: 0,
        buyerShippingCharge: 0,
        feeRatePercent: 80,
        targetMarginPercent: 20,
      }),
    ).toThrow("100% 미만");
  });
});
