"use client";

import { useMemo, useState } from "react";
import {
  calculateSellingPrice,
  getNaverTotalFeeRatePercent,
  naverNpayFeeRates,
  naverSalesFeeRates,
  type NaverNpayFeeGrade,
  type NaverSalesFeeType,
} from "@/modules/pricing/margin-calculator";

export function NaverMarginCalculator({
  supplierCost = 0,
  editableSupplierCost = false,
  defaultOpen = false,
  onApply,
}: {
  supplierCost?: number;
  editableSupplierCost?: boolean;
  defaultOpen?: boolean;
  onApply: (sellingPrice: number) => void;
}) {
  const [cost, setCost] = useState(supplierCost);
  const [open, setOpen] = useState(defaultOpen);
  const [npayGrade, setNpayGrade] =
    useState<NaverNpayFeeGrade>("general");
  const [salesFeeType, setSalesFeeType] =
    useState<NaverSalesFeeType>("shopping");
  const [targetMarginPercent, setTargetMarginPercent] = useState(30);
  const [sellerShippingCost, setSellerShippingCost] = useState(0);
  const [packagingAndFixedCost, setPackagingAndFixedCost] = useState(0);
  const [buyerShippingCharge, setBuyerShippingCharge] = useState(0);
  const effectiveCost = editableSupplierCost ? cost : supplierCost;
  const feeRatePercent = getNaverTotalFeeRatePercent(
    npayGrade,
    salesFeeType,
  );

  const calculation = useMemo(() => {
    try {
      return {
        value: calculateSellingPrice({
          supplierCost: effectiveCost,
          feeRatePercent,
          targetMarginPercent,
          sellerShippingCost,
          packagingAndFixedCost,
          buyerShippingCharge,
          roundingUnit: 100,
        }),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "계산할 수 없습니다.",
      };
    }
  }, [
    buyerShippingCharge,
    effectiveCost,
    feeRatePercent,
    packagingAndFixedCost,
    sellerShippingCost,
    targetMarginPercent,
  ]);

  return (
    <details
      className="drawer-margin-calculator"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>네이버 수수료·목표 마진 판매가 계산</summary>
      <div className="drawer-margin-fields">
        <NumberField
          label="상품 원가"
          value={effectiveCost}
          onChange={setCost}
          disabled={!editableSupplierCost}
        />
        <label>
          Npay 수수료 등급
          <select
            value={npayGrade}
            onChange={(event) =>
              setNpayGrade(event.target.value as NaverNpayFeeGrade)
            }
          >
            {Object.entries(naverNpayFeeRates).map(([value, option]) => (
              <option key={value} value={value}>
                {option.label} · {option.percent}%
              </option>
            ))}
          </select>
        </label>
        <label>
          판매 유입 유형
          <select
            value={salesFeeType}
            onChange={(event) =>
              setSalesFeeType(event.target.value as NaverSalesFeeType)
            }
          >
            {Object.entries(naverSalesFeeRates).map(([value, option]) => (
              <option key={value} value={value}>
                {option.label} · {option.percent}%
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="목표 마진율 (%)"
          value={targetMarginPercent}
          onChange={setTargetMarginPercent}
          step="0.1"
        />
        <NumberField
          label="판매자 부담 배송비"
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
      <div className="drawer-margin-fee-summary">
        Npay {naverNpayFeeRates[npayGrade].percent}% + 판매수수료{" "}
        {naverSalesFeeRates[salesFeeType].percent}% = 총 예상 수수료{" "}
        <strong>{feeRatePercent.toFixed(3)}%</strong>
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
            원 · 예상 이익{" "}
            {calculation.value.expectedProfit.toLocaleString("ko-KR")}원 ·
            마진율 {calculation.value.expectedMarginPercent.toFixed(1)}%
          </small>
          <button
            type="button"
            onClick={() => onApply(calculation.value!.sellingPrice)}
            disabled={effectiveCost <= 0}
          >
            판매가에 적용
          </button>
        </div>
      ) : (
        <p className="drawer-margin-error">{calculation.error}</p>
      )}
      <p className="drawer-margin-disclaimer">
        2025년 10월 이후 VAT 포함 기본 수수료율을 사용한 예상값입니다. 버티컬
        서비스·광고·무이자 할부·반품 비용은 별도로 더하고 실제 정산 내역과
        대조하세요.
      </p>
    </details>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = "1",
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
