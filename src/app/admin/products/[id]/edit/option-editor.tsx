"use client";

import type { EditedOptions } from "@/lib/db/schema";

export function OptionEditor({
  value,
  onChange,
}: {
  value: EditedOptions;
  onChange: (value: EditedOptions) => void;
}) {
  const updateGroup = (
    index: number,
    patch: Partial<EditedOptions["groups"][number]>,
  ) =>
    onChange({
      ...value,
      groups: value.groups.map((group, i) =>
        i === index ? { ...group, ...patch } : group,
      ),
    });
  const removeGroup = (index: number) => {
    const removed = new Set(
      value.groups[index]?.values.map((item) => item.id) ?? [],
    );
    onChange({
      groups: value.groups.filter((_, i) => i !== index),
      combinations: value.combinations.filter(
        (item) => !item.valueIds.some((id) => removed.has(id)),
      ),
    });
  };
  const addGroup = () =>
    onChange({
      ...value,
      groups: [
        ...value.groups,
        { id: crypto.randomUUID(), name: "", values: [] },
      ],
    });
  const addValue = (groupIndex: number) =>
    updateGroup(groupIndex, {
      values: [
        ...value.groups[groupIndex]!.values,
        { id: crypto.randomUUID(), name: "", enabled: true },
      ],
    });
  const updateValue = (
    groupIndex: number,
    valueIndex: number,
    patch: { name?: string; enabled?: boolean },
  ) =>
    updateGroup(groupIndex, {
      values: value.groups[groupIndex]!.values.map((item, i) =>
        i === valueIndex ? { ...item, ...patch } : item,
      ),
    });
  const removeValue = (groupIndex: number, valueIndex: number) => {
    const id = value.groups[groupIndex]!.values[valueIndex]!.id;
    updateGroup(groupIndex, {
      values: value.groups[groupIndex]!.values.filter(
        (_, i) => i !== valueIndex,
      ),
    });
    onChange({
      groups: value.groups.map((group, i) =>
        i === groupIndex
          ? {
              ...group,
              values: group.values.filter((_, j) => j !== valueIndex),
            }
          : group,
      ),
      combinations: value.combinations.filter(
        (item) => !item.valueIds.includes(id),
      ),
    });
  };
  const addCombination = () =>
    onChange({
      ...value,
      combinations: [
        ...value.combinations,
        {
          id: crypto.randomUUID(),
          valueIds: value.groups
            .map((group) => group.values[0]?.id)
            .filter((id): id is string => Boolean(id)),
          additionalPrice: 0,
          stock: 0,
          enabled: true,
          supplierOptionReference: null,
        },
      ],
    });
  const updateCombination = (
    index: number,
    patch: Partial<EditedOptions["combinations"][number]>,
  ) =>
    onChange({
      ...value,
      combinations: value.combinations.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  const combinationCount = value.groups.reduce(
    (count, group) =>
      count * group.values.filter((item) => item.enabled).length,
    value.groups.length ? 1 : 0,
  );
  const canGenerateCombinations =
    value.groups.length > 0 &&
    value.groups.every((group) =>
      group.values.some((item) => item.enabled),
    ) &&
    combinationCount <= 500;
  const generateCombinations = () => {
    if (!canGenerateCombinations) return;
    const combinations = cartesianProduct(
      value.groups.map((group) =>
        group.values.filter((item) => item.enabled).map((item) => item.id),
      ),
    );
    const existing = new Map(
      value.combinations.map((combination) => [
        combination.valueIds.join("\u0000"),
        combination,
      ]),
    );
    onChange({
      ...value,
      combinations: combinations.map((valueIds) => {
        const saved = existing.get(valueIds.join("\u0000"));
        return (
          saved ?? {
            id: crypto.randomUUID(),
            valueIds,
            additionalPrice: 0,
            stock: 0,
            enabled: true,
            supplierOptionReference: null,
          }
        );
      }),
    });
  };

  return (
    <div className="option-editor">
      <div className="option-groups">
        {value.groups.map((group, groupIndex) => (
          <fieldset key={group.id}>
            <legend>옵션 그룹 {groupIndex + 1}</legend>
            <div className="row">
              <input
                aria-label="옵션 그룹명"
                placeholder="예: 색상"
                value={group.name}
                onChange={(e) =>
                  updateGroup(groupIndex, { name: e.target.value })
                }
              />
              <button
                type="button"
                className="danger"
                onClick={() => removeGroup(groupIndex)}
              >
                그룹 삭제
              </button>
            </div>
            <div className="option-values">
              {group.values.map((item, valueIndex) => (
                <div className="row" key={item.id}>
                  <input
                    aria-label="옵션값"
                    placeholder="예: 블랙"
                    value={item.name}
                    onChange={(e) =>
                      updateValue(groupIndex, valueIndex, {
                        name: e.target.value,
                      })
                    }
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={(e) =>
                        updateValue(groupIndex, valueIndex, {
                          enabled: e.target.checked,
                        })
                      }
                    />{" "}
                    사용
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => removeValue(groupIndex, valueIndex)}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => addValue(groupIndex)}
            >
              + 옵션값 추가
            </button>
          </fieldset>
        ))}
      </div>
      <button type="button" className="secondary" onClick={addGroup}>
        + 옵션 그룹 추가
      </button>
      {value.groups.length > 0 && (
        <>
          <div className="page-head">
            <div>
              <h3>옵션 조합</h3>
              <p>
                판매할 조합을 만들고 각 조합의 재고와 추가금을 확인하세요.
              </p>
            </div>
            <div className="option-combination-actions">
              <button
                type="button"
                className="secondary"
                disabled={!canGenerateCombinations}
                onClick={generateCombinations}
              >
                활성 옵션으로 전체 조합 생성
                {canGenerateCombinations ? ` (${combinationCount}개)` : ""}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={value.groups.some((group) => !group.values.length)}
                onClick={addCombination}
              >
                + 조합 한 개 추가
              </button>
            </div>
          </div>
          {!value.combinations.some((combination) => combination.enabled) && (
            <p className="option-combination-warning" role="alert">
              활성 옵션 조합이 없습니다. 전체 조합을 생성하거나 조합을 한 개
              이상 추가해 주세요.
            </p>
          )}
          {combinationCount > 500 && (
            <p className="option-combination-warning" role="alert">
              가능한 조합이 500개를 넘습니다. 옵션값을 줄인 뒤 조합을
              생성해 주세요.
            </p>
          )}
          <div className="combination-list">
            {value.combinations.map((combination, index) => (
              <div className="combination-row" key={combination.id}>
                {value.groups.map((group) => (
                  <select
                    aria-label={`${group.name || "옵션"} 선택`}
                    key={group.id}
                    value={
                      combination.valueIds.find((id) =>
                        group.values.some((item) => item.id === id),
                      ) ?? ""
                    }
                    onChange={(e) =>
                      updateCombination(index, {
                        valueIds: [
                          ...combination.valueIds.filter(
                            (id) =>
                              !group.values.some((item) => item.id === id),
                          ),
                          e.target.value,
                        ].filter(Boolean),
                      })
                    }
                  >
                    <option value="">선택</option>
                    {group.values.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name || "(이름 미입력)"}
                      </option>
                    ))}
                  </select>
                ))}
                <label>
                  추가금{" "}
                  <input
                    type="number"
                    step="1"
                    value={combination.additionalPrice}
                    onChange={(e) =>
                      updateCombination(index, {
                        additionalPrice: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  재고{" "}
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={combination.stock}
                    onChange={(e) =>
                      updateCombination(index, {
                        stock: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={combination.enabled}
                    onChange={(e) =>
                      updateCombination(index, { enabled: e.target.checked })
                    }
                  />{" "}
                  판매
                </label>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    onChange({
                      ...value,
                      combinations: value.combinations.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {!value.groups.length && <p>옵션이 없는 단일 상품입니다.</p>}
    </div>
  );
}

function cartesianProduct(groups: string[][]): string[][] {
  return groups.reduce<string[][]>(
    (combinations, values) =>
      combinations.flatMap((combination) =>
        values.map((value) => [...combination, value]),
      ),
    [[]],
  );
}
