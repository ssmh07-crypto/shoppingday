"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  DatabaseJsonObject,
  NaverPublicationPolicyData,
  NaverPublicationPolicyOverrides,
} from "@/lib/db/schema";
import { mergeNaverPublicationPolicy } from "@/modules/channels/naver/naver-publication-policy";

type PolicyKey = keyof NaverPublicationPolicyData;

export function NaverPublicationPolicyForm({
  mode,
  endpoint,
  initialDefaults,
  initialOverrides = {},
  categoryId,
  onSaved,
}: {
  mode: "default" | "product";
  endpoint: string;
  initialDefaults: NaverPublicationPolicyData;
  initialOverrides?: NaverPublicationPolicyOverrides;
  categoryId?: string | null;
  onSaved?: () => void;
}) {
  const [defaults, setDefaults] = useState(initialDefaults);
  const [overrides, setOverrides] = useState(initialOverrides);
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify(mode === "default" ? initialDefaults : initialOverrides),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const policy = useMemo(
    () =>
      mode === "default"
        ? defaults
        : mergeNaverPublicationPolicy(defaults, overrides),
    [defaults, mode, overrides],
  );
  const serialized = JSON.stringify(mode === "default" ? defaults : overrides);
  const dirty = serialized !== baseline;

  function inherited(key: PolicyKey) {
    return mode === "product" && !Object.hasOwn(overrides, key);
  }

  function setValue<K extends PolicyKey>(
    key: K,
    value: NaverPublicationPolicyData[K],
  ) {
    if (mode === "default") {
      setDefaults((current) => ({ ...current, [key]: value }));
    } else {
      setOverrides((current) => ({ ...current, [key]: value }));
    }
  }

  function toggleOverride(key: PolicyKey, enabled: boolean) {
    if (enabled) {
      setOverrides((current) => ({ ...current, [key]: policy[key] }));
      return;
    }
    setOverrides((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: serialized,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "판매 정책을 저장하지 못했습니다.");
      }
      if (mode === "default") {
        setDefaults(body.policy);
        setBaseline(JSON.stringify(body.policy));
      } else {
        setDefaults(body.policy.defaults);
        setOverrides(body.policy.overrides);
        setBaseline(JSON.stringify(body.policy.overrides));
      }
      setMessage("네이버 판매 정책을 저장했습니다.");
      onSaved?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "판매 정책을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const wrap = (key: PolicyKey, label: string, content: React.ReactNode) => (
    <div className="naver-policy-field" key={key}>
      <div className="naver-policy-field-heading">
        <strong>{label}</strong>
        {mode === "product" && (
          <label>
            <input
              type="checkbox"
              checked={!inherited(key)}
              onChange={(event) => toggleOverride(key, event.target.checked)}
            />
            상품별 설정
          </label>
        )}
      </div>
      <fieldset disabled={inherited(key)}>{content}</fieldset>
      {inherited(key) && <small>채널 기본값을 사용합니다.</small>}
    </div>
  );

  return (
    <div className="naver-policy-form">
      <p className="naver-policy-description">
        빈 값은 발행 시 오류로 표시되며 임의 기본값으로 전송되지 않습니다.
      </p>
      <div className="naver-policy-grid">
        {wrap(
          "singleStockQuantity",
          "단일상품 재고",
          <input
            type="number"
            min={0}
            max={99_999_999}
            value={policy.singleStockQuantity ?? ""}
            onChange={(event) =>
              setValue(
                "singleStockQuantity",
                event.target.value === "" ? null : Number(event.target.value),
              )
            }
          />,
        )}
        {wrap(
          "taxType",
          "부가가치세 유형",
          <select
            value={policy.taxType ?? ""}
            onChange={(event) =>
              setValue("taxType", (event.target.value || null) as NaverPublicationPolicyData["taxType"])
            }
          >
            <option value="">선택</option>
            <option value="TAX">과세</option>
            <option value="DUTYFREE">면세</option>
            <option value="SMALL">영세</option>
          </select>,
        )}
        {wrap(
          "minorPurchasable",
          "미성년자 구매",
          <NullableBooleanSelect
            value={policy.minorPurchasable}
            onChange={(value) => setValue("minorPurchasable", value)}
          />,
        )}
        {wrap(
          "naverShoppingRegistration",
          "네이버 쇼핑 등록",
          <NullableBooleanSelect
            value={policy.naverShoppingRegistration}
            onChange={(value) => setValue("naverShoppingRegistration", value)}
          />,
        )}
        {wrap(
          "channelProductDisplayStatusType",
          "채널 전시 상태",
          <select
            value={policy.channelProductDisplayStatusType ?? ""}
            onChange={(event) =>
              setValue(
                "channelProductDisplayStatusType",
                (event.target.value || null) as NaverPublicationPolicyData["channelProductDisplayStatusType"],
              )
            }
          >
            <option value="">선택</option>
            <option value="ON">전시</option>
            <option value="SUSPENSION">전시 중지</option>
          </select>,
        )}
        {wrap(
          "afterServiceInfo",
          "A/S 안내",
          <div className="naver-policy-stack">
            <input
              aria-label="A/S 전화번호"
              placeholder="전화번호"
              value={policy.afterServiceInfo?.afterServiceTelephoneNumber ?? ""}
              onChange={(event) =>
                setValue("afterServiceInfo", {
                  afterServiceTelephoneNumber: event.target.value,
                  afterServiceGuideContent: policy.afterServiceInfo?.afterServiceGuideContent ?? "",
                })
              }
            />
            <textarea
              aria-label="A/S 안내 내용"
              placeholder="A/S 안내"
              value={policy.afterServiceInfo?.afterServiceGuideContent ?? ""}
              onChange={(event) =>
                setValue("afterServiceInfo", {
                  afterServiceTelephoneNumber: policy.afterServiceInfo?.afterServiceTelephoneNumber ?? "",
                  afterServiceGuideContent: event.target.value,
                })
              }
            />
          </div>,
        )}
        {wrap(
          "originAreaInfo",
          "원산지",
          <div className="naver-policy-stack">
            <select
              aria-label="원산지 유형"
              value={policy.originAreaInfo?.originAreaCode ?? ""}
              onChange={(event) =>
                setValue(
                  "originAreaInfo",
                  event.target.value
                    ? {
                        originAreaCode: event.target.value as NonNullable<NaverPublicationPolicyData["originAreaInfo"]>["originAreaCode"],
                        plural: policy.originAreaInfo?.plural ?? false,
                      }
                    : null,
                )
              }
            >
              <option value="">선택</option>
              <option value="00">국산</option>
              <option value="01">국내산</option>
              <option value="02">수입산</option>
              <option value="03">기타</option>
              <option value="04">직접 입력</option>
              <option value="05">원산지 다양</option>
            </select>
            {policy.originAreaInfo?.originAreaCode === "02" && (
              <input
                placeholder="수입사"
                value={policy.originAreaInfo.importer ?? ""}
                onChange={(event) =>
                  setValue("originAreaInfo", { ...policy.originAreaInfo!, importer: event.target.value })
                }
              />
            )}
            {policy.originAreaInfo?.originAreaCode === "04" && (
              <input
                placeholder="원산지 표시 내용"
                value={policy.originAreaInfo.content ?? ""}
                onChange={(event) =>
                  setValue("originAreaInfo", { ...policy.originAreaInfo!, content: event.target.value })
                }
              />
            )}
          </div>,
        )}
        {wrap(
          "deliveryInfo",
          "배송 정책 JSON",
          <JsonObjectInput
            label="배송 정책 JSON"
            value={policy.deliveryInfo}
            onChange={(value) => setValue("deliveryInfo", value)}
          />,
        )}
        {wrap(
          "productInfoProvidedNotice",
          "상품정보제공고시",
          <ProvidedNoticeInput
            categoryId={categoryId}
            value={policy.productInfoProvidedNotice}
            onChange={(value) =>
              setValue(
                "productInfoProvidedNotice",
                value as NaverPublicationPolicyData["productInfoProvidedNotice"],
              )
            }
          />,
        )}
      </div>
      <div className="naver-policy-savebar">
        <span role="status">{message}</span>
        <button type="button" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? "저장 중…" : mode === "default" ? "기본 정책 저장" : "상품별 정책 저장"}
        </button>
      </div>
    </div>
  );
}

function NullableBooleanSelect({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <select
      value={value === null ? "" : String(value)}
      onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "true")}
    >
      <option value="">선택</option>
      <option value="true">허용</option>
      <option value="false">허용하지 않음</option>
    </select>
  );
}

function JsonObjectInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DatabaseJsonObject | null;
  onChange: (value: DatabaseJsonObject | null) => void;
}) {
  const [text, setText] = useState(value ? JSON.stringify(value, null, 2) : "");
  const [error, setError] = useState("");

  function commit() {
    if (!text.trim()) {
      setError("");
      onChange(null);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      setError("");
      onChange(parsed);
    } catch {
      setError("JSON 객체 형식을 확인해 주세요.");
    }
  }

  return (
    <div className="naver-policy-json">
      <textarea
        aria-label={label}
        rows={6}
        value={text}
        placeholder="API 조회 UI 연결 전에는 JSON 객체로 입력합니다."
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
      />
      {error && <small className="naver-policy-error">{error}</small>}
    </div>
  );
}

type ProvidedNoticeType = {
  productInfoProvidedNoticeType: string;
  productInfoProvidedNoticeTypeName: string;
  productInfoProvidedNoticeContents: Array<{
    fieldType: string;
    fieldName: string;
    fieldDescription: string;
    fieldAddDescription: string;
    fieldMaxLength: number;
  }>;
};

function ProvidedNoticeInput({
  categoryId,
  value,
  onChange,
}: {
  categoryId?: string | null;
  value: NaverPublicationPolicyData["productInfoProvidedNotice"];
  onChange: (value: NaverPublicationPolicyData["productInfoProvidedNotice"]) => void;
}) {
  const [types, setTypes] = useState<ProvidedNoticeType[]>([]);
  const [status, setStatus] = useState("고시 상품군을 불러오는 중입니다.");

  useEffect(() => {
    const controller = new AbortController();
    const query = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : "";
    void fetch(`/api/integrations/naver/provided-notices${query}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error?.message ?? "고시 상품군을 불러오지 못했습니다.");
        setTypes(body.data ?? []);
        setStatus(body.stale ? "릴레이 연결 문제로 마지막 조회 결과를 표시합니다." : "");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setStatus(error instanceof Error ? error.message : "고시 상품군을 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [categoryId]);

  const selected = types.find(
    (item) => item.productInfoProvidedNoticeType === value?.productInfoProvidedNoticeType,
  );
  const bodyKey = selected ? noticeBodyKey(selected.productInfoProvidedNoticeType) : "";
  const body = bodyKey && value && typeof value[bodyKey] === "object" && !Array.isArray(value[bodyKey])
    ? (value[bodyKey] as DatabaseJsonObject)
    : {};

  function select(type: string) {
    const next = types.find((item) => item.productInfoProvidedNoticeType === type);
    if (!next) {
      onChange(null);
      return;
    }
    onChange({
      productInfoProvidedNoticeType: type,
      [noticeBodyKey(type)]: {},
    });
  }

  return (
    <div className="naver-policy-stack">
      <select
        aria-label="상품정보제공고시 상품군"
        value={value?.productInfoProvidedNoticeType ?? ""}
        onChange={(event) => select(event.target.value)}
      >
        <option value="">선택</option>
        {types.map((item) => (
          <option key={item.productInfoProvidedNoticeType} value={item.productInfoProvidedNoticeType}>
            {item.productInfoProvidedNoticeTypeName}
          </option>
        ))}
      </select>
      {status && <small>{status}</small>}
      {selected?.productInfoProvidedNoticeContents.map((field) => (
        <label className="naver-policy-notice-field" key={field.fieldName}>
          <span>{field.fieldDescription || field.fieldName}</span>
          <input
            maxLength={field.fieldMaxLength || undefined}
            value={typeof body[field.fieldName] === "string" ? String(body[field.fieldName]) : ""}
            onChange={(event) =>
              onChange({
                productInfoProvidedNoticeType: selected.productInfoProvidedNoticeType,
                [bodyKey]: { ...body, [field.fieldName]: event.target.value },
              })
            }
          />
          {field.fieldAddDescription && <small>{field.fieldAddDescription}</small>}
        </label>
      ))}
    </div>
  );
}

function noticeBodyKey(type: string) {
  return type.toLowerCase().replace(/_([a-z])/g, (_, character: string) => character.toUpperCase());
}
