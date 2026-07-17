"use client";

import { useState } from "react";
import {
  productSyncProtectedFields,
  type ProductProcessingSettings,
  type ProductSyncProtectedField,
} from "@/modules/products/product-processing-settings";

const fieldLabels: Record<ProductSyncProtectedField, string> = {
  title: "상품명",
  description: "상세설명",
  images: "이미지",
  options: "옵션",
};

export function ProductSettingsForm({
  initial,
}: {
  initial: ProductProcessingSettings;
}) {
  const [settings, setSettings] = useState(initial);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(settings) !== baseline;

  function toggleProtected(field: ProductSyncProtectedField, checked: boolean) {
    setSettings((current) => ({
      ...current,
      syncProtectedFields: checked
        ? [...current.syncProtectedFields, field]
        : current.syncProtectedFields.filter((value) => value !== field),
    }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings/products", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.error?.message ?? "설정을 저장하지 못했습니다.");
      setSettings(body.settings);
      setBaseline(JSON.stringify(body.settings));
      setMessage("저장했습니다.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "설정을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="product-settings-sections">
      <section className="product-settings-section">
        <div>
          <span>변동처리</span>
          <h2>변경하지 않을 항목</h2>
        </div>
        <div className="product-settings-checks">
          {productSyncProtectedFields.map((field) => (
            <label key={field}>
              <input
                type="checkbox"
                checked={settings.syncProtectedFields.includes(field)}
                onChange={(event) =>
                  toggleProtected(field, event.target.checked)
                }
              />
              <span>{fieldLabels[field]}</span>
            </label>
          ))}
        </div>
        <p>체크한 항목은 공급처 상품이 변경되어도 판매용 편집값을 유지합니다.</p>
      </section>

      <section className="product-settings-section">
        <div>
          <span>카테고리 추천</span>
          <h2>정리된 검색어의 상품명 적용 기본값</h2>
        </div>
        <label className="product-settings-toggle">
          <input
            type="checkbox"
            checked={settings.applyCategoryQueryToTitleByDefault}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                applyCategoryQueryToTitleByDefault: event.target.checked,
              }))
            }
          />
          <span>정리된 검색어를 상품명에도 적용</span>
        </label>
        <p>상품별 편집 화면에서 필요하면 이 기본값을 다시 변경할 수 있습니다.</p>
      </section>

      <footer className="product-settings-savebar">
        <span aria-live="polite">{message}</span>
        <button type="button" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? "저장 중…" : "설정 저장"}
        </button>
      </footer>
    </div>
  );
}
