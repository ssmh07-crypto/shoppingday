export type MarginCalculationInput = {
  supplierCost: number;
  sellerShippingCost: number;
  packagingAndFixedCost: number;
  buyerShippingCharge: number;
  feeRatePercent: number;
  targetMarginPercent: number;
  roundingUnit?: number;
};

export type MarginCalculation = {
  sellingPrice: number;
  expectedFee: number;
  totalCost: number;
  expectedProfit: number;
  expectedMarginPercent: number;
};

export const naverNpayFeeRates = {
  micro: { label: "영세", percent: 1.947 },
  small1: { label: "중소1", percent: 2.563 },
  small2: { label: "중소2", percent: 2.728 },
  small3: { label: "중소3", percent: 3.003 },
  general: { label: "일반", percent: 3.63 },
} as const;

export const naverSalesFeeRates = {
  shopping: { label: "네이버쇼핑 일반 유입", percent: 3 },
  sellerMarketing: { label: "판매자 마케팅 유입", percent: 1 },
} as const;

export type NaverNpayFeeGrade = keyof typeof naverNpayFeeRates;
export type NaverSalesFeeType = keyof typeof naverSalesFeeRates;

export function getNaverTotalFeeRatePercent(
  npayGrade: NaverNpayFeeGrade,
  salesFeeType: NaverSalesFeeType,
) {
  return (
    naverNpayFeeRates[npayGrade].percent +
    naverSalesFeeRates[salesFeeType].percent
  );
}

export function calculateSellingPrice(
  input: MarginCalculationInput,
): MarginCalculation {
  const values = [
    input.supplierCost,
    input.sellerShippingCost,
    input.packagingAndFixedCost,
    input.buyerShippingCharge,
    input.feeRatePercent,
    input.targetMarginPercent,
  ];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("금액과 비율은 0 이상의 숫자여야 합니다.");
  }
  const feeRate = input.feeRatePercent / 100;
  const targetMarginRate = input.targetMarginPercent / 100;
  if (feeRate + targetMarginRate >= 1) {
    throw new Error(
      "예상 수수료율과 목표 실마진율의 합은 100% 미만이어야 합니다.",
    );
  }
  const roundingUnit = input.roundingUnit ?? 10;
  if (!Number.isInteger(roundingUnit) || roundingUnit < 1) {
    throw new Error("판매가 반올림 단위는 1원 이상의 정수여야 합니다.");
  }

  const fixedExpenses =
    input.supplierCost +
    input.sellerShippingCost +
    input.packagingAndFixedCost -
    input.buyerShippingCharge;
  const rawPrice = Math.max(
    1,
    fixedExpenses / (1 - feeRate - targetMarginRate),
  );
  const sellingPrice = Math.ceil(rawPrice / roundingUnit) * roundingUnit;
  const expectedFee = Math.ceil(sellingPrice * feeRate);
  const totalCost =
    input.supplierCost +
    input.sellerShippingCost +
    input.packagingAndFixedCost +
    expectedFee;
  const expectedProfit = sellingPrice + input.buyerShippingCharge - totalCost;

  return {
    sellingPrice,
    expectedFee,
    totalCost,
    expectedProfit,
    expectedMarginPercent: (expectedProfit / sellingPrice) * 100,
  };
}
