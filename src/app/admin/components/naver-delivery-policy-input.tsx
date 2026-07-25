"use client";

import { useEffect, useState } from "react";
import type { DatabaseJsonObject } from "@/lib/db/schema";

type Address = {
  addressBookNo: number;
  name: string;
  addressType: string;
  address: string;
  baseAddress: string;
  detailAddress: string;
};

type DeliveryOptions = {
  releaseAddresses: Address[];
  returnAddresses: Address[];
  bundleGroups: Array<{
    id: number;
    name: string;
    baseGroup: boolean;
  }>;
  returnDeliveryCompanies: Array<{
    id: number;
    name: string;
    returnDeliveryCompanyPriorityType: string;
  }>;
};

const DELIVERY_COMPANIES = [
  ["CJGLS", "CJ대한통운"],
  ["HANJIN", "한진택배"],
  ["HYUNDAI", "롯데택배"],
  ["KGB", "로젠택배"],
  ["EPOST", "우체국택배"],
] as const;

function deliveryOptionsUrl(storeConnectionId?: string | null) {
  return storeConnectionId
    ? `/api/integrations/naver/delivery-options?storeConnectionId=${encodeURIComponent(storeConnectionId)}`
    : "/api/integrations/naver/delivery-options";
}

export function NaverDeliveryPolicyInput({
  value,
  onChange,
  storeConnectionId,
}: {
  value: DatabaseJsonObject | null;
  onChange: (value: DatabaseJsonObject | null) => void;
  storeConnectionId?: string | null;
}) {
  const [options, setOptions] = useState<DeliveryOptions | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch(deliveryOptionsUrl(storeConnectionId), {
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ??
            "스마트스토어 배송 정보를 불러오지 못했습니다.",
        );
      }
      setOptions(body.data);
      setStatus("스마트스토어 배송 정보를 불러왔습니다.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "스마트스토어 배송 정보를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetch(deliveryOptionsUrl(storeConnectionId), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            body?.error?.message ??
              "스마트스토어 배송 정보를 불러오지 못했습니다.",
          );
        }
        setOptions(body.data);
        setStatus("스마트스토어 배송 정보를 불러왔습니다.");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setStatus(
          error instanceof Error
            ? error.message
            : "스마트스토어 배송 정보를 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [storeConnectionId]);

  const deliveryFee = objectValue(value?.deliveryFee);
  const areaFee = objectValue(deliveryFee.deliveryFeeByArea);
  const claim = objectValue(value?.claimDeliveryInfo);
  const bundleUsable = booleanValue(value?.deliveryBundleGroupUsable);
  const feeType = stringValue(deliveryFee.deliveryFeeType) || "FREE";
  const areaType =
    stringValue(areaFee.deliveryAreaType) === "AREA_3" ? "AREA_3" : "AREA_2";

  function patchRoot(patch: DatabaseJsonObject) {
    onChange({
      ...value,
      deliveryType: stringValue(value?.deliveryType) || "DELIVERY",
      deliveryAttributeType:
        stringValue(value?.deliveryAttributeType) || "NORMAL",
      deliveryBundleGroupUsable: bundleUsable,
      deliveryFee: {
        deliveryFeeType: feeType,
        baseFee: numberValue(deliveryFee.baseFee),
        freeConditionalAmount: numberValue(
          deliveryFee.freeConditionalAmount,
        ),
        repeatQuantity: numberValue(deliveryFee.repeatQuantity),
        deliveryFeePayType:
          stringValue(deliveryFee.deliveryFeePayType) || "PREPAID",
        deliveryFeeByArea: {
          deliveryAreaType: areaType,
          area2extraFee: numberValue(areaFee.area2extraFee),
          area3extraFee: numberValue(areaFee.area3extraFee),
        },
        ...deliveryFee,
      },
      claimDeliveryInfo: {
        returnDeliveryCompanyPriorityType: stringValue(
          claim.returnDeliveryCompanyPriorityType,
        ),
        returnDeliveryFee: numberValue(claim.returnDeliveryFee),
        exchangeDeliveryFee: numberValue(claim.exchangeDeliveryFee),
        shippingAddressId: numberValue(claim.shippingAddressId),
        returnAddressId: numberValue(claim.returnAddressId),
        freeReturnInsuranceYn: booleanValue(claim.freeReturnInsuranceYn),
        ...claim,
      },
      ...patch,
    });
  }

  function patchFee(patch: DatabaseJsonObject) {
    patchRoot({
      deliveryFee: {
        deliveryFeeType: feeType,
        baseFee: numberValue(deliveryFee.baseFee),
        freeConditionalAmount: numberValue(
          deliveryFee.freeConditionalAmount,
        ),
        repeatQuantity: numberValue(deliveryFee.repeatQuantity),
        deliveryFeePayType:
          stringValue(deliveryFee.deliveryFeePayType) || "PREPAID",
        deliveryFeeByArea: {
          deliveryAreaType: areaType,
          area2extraFee: numberValue(areaFee.area2extraFee),
          area3extraFee: numberValue(areaFee.area3extraFee),
        },
        ...deliveryFee,
        ...patch,
      },
    });
  }

  function patchClaim(patch: DatabaseJsonObject) {
    patchRoot({
      claimDeliveryInfo: {
        returnDeliveryCompanyPriorityType:
          stringValue(claim.returnDeliveryCompanyPriorityType),
        returnDeliveryFee: numberValue(claim.returnDeliveryFee),
        exchangeDeliveryFee: numberValue(claim.exchangeDeliveryFee),
        shippingAddressId: numberValue(claim.shippingAddressId),
        returnAddressId: numberValue(claim.returnAddressId),
        freeReturnInsuranceYn: booleanValue(claim.freeReturnInsuranceYn),
        ...claim,
        ...patch,
      },
    });
  }

  return (
    <div className="naver-delivery-policy">
      <div className="naver-delivery-toolbar">
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "불러오는 중…" : "스마트스토어 배송정책 다시 불러오기"}
        </button>
        {status && <small role="status">{status}</small>}
      </div>

      <div className="naver-delivery-grid">
        <PolicySelect
          label="배송 방법"
          value={stringValue(value?.deliveryType) || "DELIVERY"}
          onChange={(next) => patchRoot({ deliveryType: next })}
          options={[
            ["DELIVERY", "택배·소포·등기"],
            ["DIRECT", "직접 배송"],
          ]}
        />
        <PolicySelect
          label="배송 속성"
          value={stringValue(value?.deliveryAttributeType) || "NORMAL"}
          onChange={(next) => patchRoot({ deliveryAttributeType: next })}
          options={[
            ["NORMAL", "일반 배송"],
            ["TODAY", "오늘출발"],
          ]}
        />
        <PolicySelect
          label="발송 택배사"
          value={stringValue(value?.deliveryCompany)}
          onChange={(next) => patchRoot({ deliveryCompany: next })}
          options={[["", "선택"], ...DELIVERY_COMPANIES]}
        />
        <PolicySelect
          label="출고지"
          value={String(numberValue(claim.shippingAddressId) || "")}
          onChange={(next) =>
            patchClaim({ shippingAddressId: Number(next) || 0 })
          }
          options={[
            ["", "선택"],
            ...(options?.releaseAddresses.map((address) => [
              String(address.addressBookNo),
              addressLabel(address),
            ] as const) ?? []),
          ]}
        />
        <PolicySelect
          label="반품·교환지"
          value={String(numberValue(claim.returnAddressId) || "")}
          onChange={(next) =>
            patchClaim({ returnAddressId: Number(next) || 0 })
          }
          options={[
            ["", "선택"],
            ...(options?.returnAddresses.map((address) => [
              String(address.addressBookNo),
              addressLabel(address),
            ] as const) ?? []),
          ]}
        />
        <PolicySelect
          label="반품 택배사 계약"
          value={stringValue(claim.returnDeliveryCompanyPriorityType)}
          onChange={(next) =>
            patchClaim({ returnDeliveryCompanyPriorityType: next })
          }
          options={[
            ["", "선택"],
            ...(options?.returnDeliveryCompanies.map((company) => [
              company.returnDeliveryCompanyPriorityType,
              company.name,
            ] as const) ?? []),
          ]}
        />
        <PolicySelect
          label="배송비 유형"
          value={feeType}
          onChange={(next) => patchFee({ deliveryFeeType: next })}
          options={[
            ["FREE", "무료"],
            ["PAID", "유료"],
            ["CONDITIONAL_FREE", "조건부 무료"],
            ["CHARGE_BY_QUANTITY", "수량별 부과"],
          ]}
        />
        <PolicyNumber
          label="기본 배송비"
          value={numberValue(deliveryFee.baseFee)}
          onChange={(next) => patchFee({ baseFee: next })}
        />
        {feeType === "CONDITIONAL_FREE" && (
          <PolicyNumber
            label="무료배송 기준금액"
            value={numberValue(deliveryFee.freeConditionalAmount)}
            onChange={(next) => patchFee({ freeConditionalAmount: next })}
          />
        )}
        {feeType === "CHARGE_BY_QUANTITY" && (
          <PolicyNumber
            label="배송비 반복 수량"
            value={numberValue(deliveryFee.repeatQuantity)}
            onChange={(next) => patchFee({ repeatQuantity: next })}
          />
        )}
        <PolicySelect
          label="배송비 결제"
          value={stringValue(deliveryFee.deliveryFeePayType) || "PREPAID"}
          onChange={(next) => patchFee({ deliveryFeePayType: next })}
          options={[
            ["PREPAID", "선결제"],
            ["COLLECT", "착불"],
          ]}
        />
        <PolicySelect
          label="추가 배송비 권역"
          value={areaType}
          onChange={(next) =>
            patchFee({
              deliveryFeeByArea: {
                ...areaFee,
                deliveryAreaType: next,
                area2extraFee: numberValue(areaFee.area2extraFee),
                area3extraFee: numberValue(areaFee.area3extraFee),
              },
            })
          }
          options={[
            ["AREA_2", "2권역(제주·도서산간)"],
            ["AREA_3", "3권역(제주/제주 외 도서산간)"],
          ]}
        />
        <PolicyNumber
          label={areaType === "AREA_3" ? "제주 추가 배송비" : "제주·도서산간 추가 배송비"}
          value={numberValue(areaFee.area2extraFee)}
          max={200_000}
          onChange={(next) =>
            patchFee({
              deliveryFeeByArea: { ...areaFee, deliveryAreaType: areaType, area2extraFee: next },
            })
          }
        />
        {areaType === "AREA_3" && (
          <PolicyNumber
            label="제주 외 도서산간 추가 배송비"
            value={numberValue(areaFee.area3extraFee)}
            max={200_000}
            onChange={(next) =>
              patchFee({
                deliveryFeeByArea: { ...areaFee, deliveryAreaType: areaType, area3extraFee: next },
              })
            }
          />
        )}
        <PolicyNumber
          label="반품 배송비"
          value={numberValue(claim.returnDeliveryFee)}
          onChange={(next) => patchClaim({ returnDeliveryFee: next })}
        />
        <PolicyNumber
          label="교환 배송비"
          value={numberValue(claim.exchangeDeliveryFee)}
          onChange={(next) => patchClaim({ exchangeDeliveryFee: next })}
        />
      </div>

      <label className="naver-delivery-checkbox">
        <input
          type="checkbox"
          checked={bundleUsable}
          onChange={(event) =>
            patchRoot({
              deliveryBundleGroupUsable: event.target.checked,
              ...(event.target.checked
                ? {}
                : { deliveryBundleGroupId: 0 }),
            })
          }
        />
        묶음배송 사용
      </label>
      {bundleUsable && (
        <PolicySelect
          label="묶음배송 그룹"
          value={String(numberValue(value?.deliveryBundleGroupId) || "")}
          onChange={(next) =>
            patchRoot({ deliveryBundleGroupId: Number(next) || 0 })
          }
          options={[
            ["", "선택"],
            ...(options?.bundleGroups.map((group) => [
              String(group.id),
              `${group.name}${group.baseGroup ? " (기본)" : ""}`,
            ] as const) ?? []),
          ]}
        />
      )}
    </div>
  );
}

function PolicySelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="naver-policy-control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, text]) => (
          <option key={`${optionValue}-${text}`} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function PolicyNumber({
  label,
  value,
  max = 999_999_990,
  onChange,
}: {
  label: string;
  value: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="naver-policy-control">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </label>
  );
}

function objectValue(value: unknown): DatabaseJsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DatabaseJsonObject)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function booleanValue(value: unknown) {
  return value === true;
}

function addressLabel(address: Address) {
  const location =
    address.address ||
    [address.baseAddress, address.detailAddress].filter(Boolean).join(" ");
  return `${address.name}${location ? ` · ${location}` : ""}`;
}
