"use client";

import { useMemo, useState } from "react";
import { calculateSellingPrice } from "@/modules/pricing/margin-calculator";

export function MarginCalculator({
  supplierCost,
  onApply,
}: {
  supplierCost: number;
  onApply: (sellingPrice: number) => void;
}) {
  const [feeRatePercent, setFeeRatePercent] = useState(6);
  const [targetMarginPercent, setTargetMarginPercent] = useState(20);
  const [sellerShippingCost, setSellerShippingCost] = useState(3000);
  const [packagingAndFixedCost, setPackagingAndFixedCost] = useState(0);
  const [buyerShippingCharge, setBuyerShippingCharge] = useState(0);
  const calculation = useMemo(() => {
    try {
      return {
        value: calculateSellingPrice({
          supplierCost,
          feeRatePercent,
          targetMarginPercent,
          sellerShippingCost,
          packagingAndFixedCost,
          buyerShippingCharge,
          roundingUnit: 10,
        }),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "계산할 수 없습니다.",
      };
    }
  }, [
    buyerShippingCharge,
    feeRatePercent,
    packagingAndFixedCost,
    sellerShippingCost,
    supplierCost,
    targetMarginPercent,
  ]);

  return (
    <details className="drawer-margin-calculator">
      <summary>수수료·배송비 포함 권장 판매가 계산</summary>
      <div className="drawer-margin-fields">
        <NumberField
          label="예상 전체 수수료율 (%)"
          value={feeRatePercent}
          onChange={setFeeRatePercent}
          step="0.1"
        />
        <NumberField
          label="목표 실마진율 (%)"
          value={targetMarginPercent}
          onChange={setTargetMarginPercent}
          step="0.1"
        />
        <NumberField
          label="내가 부담할 배송비"
          value={sellerShippingCost}
          onChange={setSellerShippingCost}
        />
        <NumberField
          label="포장·기타 고정비"
          value={packagingAndFixedCost}
          onChange={setPackagingAndFixedCost}
        />
        <NumberField
          label="구매자 배송비 결제액"
          value={buyerShippingCharge}
          onChange={setBuyerShippingCharge}
        />
      </div>
      {calculation.value ? (
        <div className="drawer-margin-result">
          <span>
            권장 판매가{" "}
            <strong>
              {calculation.value.sellingPrice.toLocaleString("ko-KR")}원
            </strong>
          </span>
          <small>
            예상 수수료 {calculation.value.expectedFee.toLocaleString("ko-KR")}
            원 · 예상 실이익{" "}
            {calculation.value.expectedProfit.toLocaleString("ko-KR")}원 ·
            마진율 {calculation.value.expectedMarginPercent.toFixed(1)}%
          </small>
          <button
            type="button"
            onClick={() => onApply(calculation.value!.sellingPrice)}
          >
            판매가에 적용
          </button>
        </div>
      ) : (
        <p className="drawer-margin-error">{calculation.error}</p>
      )}
      <p className="drawer-margin-disclaimer">
        수수료율은 채널·상품·할인·결제 조건에 따라 달라지는 예상값입니다. 주문
        후 네이버 정산 내역으로 실제 금액을 대조해야 합니다.
      </p>
    </details>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = "1",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
