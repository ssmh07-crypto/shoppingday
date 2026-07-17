"use client";

import type { NaverProductAttribute } from "@/lib/db/schema";

export type NaverAttributeDefinition = {
  attributeSeq: number;
  attributeName: string;
  attributeClassificationType?: "SINGLE_SELECT" | "MULTI_SELECT" | "RANGE";
  unitUsable?: boolean;
  representativeUnitCode?: string;
  attributeValueMaxMatchingCount?: number;
};

export type NaverAttributeCandidate = {
  attributeSeq: number;
  attributeValueSeq: number;
  minAttributeValue?: string;
  minAttributeValueUnitCode?: string;
  maxAttributeValue?: string;
  maxAttributeValueUnitCode?: string;
  exposureOrder?: number;
};

export function NaverAttributeEditor({
  attributes,
  candidates,
  units,
  value,
  onChange,
}: {
  attributes: NaverAttributeDefinition[];
  candidates: NaverAttributeCandidate[];
  units: Array<{ id: string; unitCodeName: string }>;
  value: NaverProductAttribute[];
  onChange: (value: NaverProductAttribute[]) => void;
}) {
  function replaceAttribute(
    attributeSeq: number,
    selections: NaverProductAttribute[],
  ) {
    onChange([
      ...value.filter((item) => item.attributeSeq !== attributeSeq),
      ...selections,
    ]);
  }

  return (
    <div className="drawer-naver-attribute-fields">
      {attributes.map((attribute) => {
        const options = candidates
          .filter(
            (candidate) => candidate.attributeSeq === attribute.attributeSeq,
          )
          .sort((a, b) => (a.exposureOrder ?? 0) - (b.exposureOrder ?? 0));
        const selected = value.filter(
          (item) => item.attributeSeq === attribute.attributeSeq,
        );
        const type = attribute.attributeClassificationType ?? "SINGLE_SELECT";
        return (
          <fieldset key={attribute.attributeSeq}>
            <legend>
              {attribute.attributeName}
              <small>{attributeTypeLabel(type)}</small>
            </legend>
            {type === "RANGE" && !options.length ? (
              <RangeAttribute
                attribute={attribute}
                units={units}
                value={selected[0]}
                onChange={(next) =>
                  replaceAttribute(attribute.attributeSeq, [next])
                }
              />
            ) : type === "MULTI_SELECT" && options.length ? (
              <div className="drawer-naver-attribute-options">
                {options.map((option) => {
                  const checked = selected.some(
                    (item) =>
                      item.attributeValueSeq === option.attributeValueSeq,
                  );
                  const max =
                    attribute.attributeValueMaxMatchingCount || options.length;
                  return (
                    <label key={option.attributeValueSeq}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && selected.length >= max}
                        onChange={() => {
                          const next = checked
                            ? selected.filter(
                                (item) =>
                                  item.attributeValueSeq !==
                                  option.attributeValueSeq,
                              )
                            : [...selected, fromCandidate(option)];
                          replaceAttribute(attribute.attributeSeq, next);
                        }}
                      />
                      <span>{candidateLabel(option, units)}</span>
                    </label>
                  );
                })}
              </div>
            ) : options.length ? (
              <select
                aria-label={attribute.attributeName}
                value={selected[0]?.attributeValueSeq ?? ""}
                onChange={(event) => {
                  const option = options.find(
                    (item) =>
                      item.attributeValueSeq === Number(event.target.value),
                  );
                  replaceAttribute(
                    attribute.attributeSeq,
                    option ? [fromCandidate(option)] : [],
                  );
                }}
              >
                <option value="">선택해 주세요</option>
                {options.map((option) => (
                  <option
                    key={option.attributeValueSeq}
                    value={option.attributeValueSeq}
                  >
                    {candidateLabel(option, units)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                aria-label={attribute.attributeName}
                value={selected[0]?.minValue ?? ""}
                placeholder="속성값 직접 입력"
                onChange={(event) => {
                  const minValue = event.target.value;
                  replaceAttribute(
                    attribute.attributeSeq,
                    minValue
                      ? [
                          {
                            attributeSeq: attribute.attributeSeq,
                            attributeValueSeq: null,
                            minValue,
                            maxValue: "",
                            unitCode: attribute.representativeUnitCode ?? null,
                          },
                        ]
                      : [],
                  );
                }}
              />
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

function RangeAttribute({
  attribute,
  units,
  value,
  onChange,
}: {
  attribute: NaverAttributeDefinition;
  units: Array<{ id: string; unitCodeName: string }>;
  value?: NaverProductAttribute;
  onChange: (value: NaverProductAttribute) => void;
}) {
  const current: NaverProductAttribute = value ?? {
    attributeSeq: attribute.attributeSeq,
    attributeValueSeq: null,
    minValue: "",
    maxValue: "",
    unitCode: attribute.representativeUnitCode ?? null,
  };
  return (
    <div className="drawer-naver-range-inputs">
      <input
        type="text"
        inputMode="decimal"
        aria-label={`${attribute.attributeName} 최소값`}
        placeholder="최소값"
        value={current.minValue}
        onChange={(event) =>
          onChange({ ...current, minValue: event.target.value })
        }
      />
      <span>~</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={`${attribute.attributeName} 최대값`}
        placeholder="최대값"
        value={current.maxValue}
        onChange={(event) =>
          onChange({ ...current, maxValue: event.target.value })
        }
      />
      {attribute.unitUsable && (
        <select
          aria-label={`${attribute.attributeName} 단위`}
          value={current.unitCode ?? ""}
          onChange={(event) =>
            onChange({ ...current, unitCode: event.target.value || null })
          }
        >
          <option value="">단위</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.unitCodeName}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function fromCandidate(
  candidate: NaverAttributeCandidate,
): NaverProductAttribute {
  return {
    attributeSeq: candidate.attributeSeq,
    attributeValueSeq: candidate.attributeValueSeq,
    minValue: candidate.minAttributeValue ?? "",
    maxValue: candidate.maxAttributeValue ?? "",
    unitCode:
      candidate.minAttributeValueUnitCode ??
      candidate.maxAttributeValueUnitCode ??
      null,
  };
}

function candidateLabel(
  candidate: NaverAttributeCandidate,
  units: Array<{ id: string; unitCodeName: string }>,
) {
  const min = candidate.minAttributeValue ?? "";
  const max = candidate.maxAttributeValue ?? "";
  const range =
    min && max && min !== max
      ? `${min} ~ ${max}`
      : min
        ? `${min} 이상`
        : max
          ? `${max} 이하`
          : "";
  const unitCode =
    candidate.minAttributeValueUnitCode ?? candidate.maxAttributeValueUnitCode;
  const unit = units.find((item) => item.id === unitCode)?.unitCodeName ?? "";
  return `${range || `값 ${candidate.attributeValueSeq}`}${unit ? ` ${unit}` : ""}`;
}

function attributeTypeLabel(type: string) {
  return (
    {
      SINGLE_SELECT: "단일 선택",
      MULTI_SELECT: "복수 선택",
      RANGE: "범위 입력",
    }[type] ?? "입력"
  );
}
