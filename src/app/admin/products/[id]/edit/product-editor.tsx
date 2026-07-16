"use client";
/* eslint-disable @next/next/no-img-element -- supplier URLs are intentionally loaded directly; no image storage/optimizer proxy */

import { useEffect, useMemo, useState } from "react";
import type { SelectedImage } from "@/lib/db/schema";
import { OptionEditor } from "./option-editor";
import { MarginCalculator } from "./margin-calculator";
import type {
  ProductEditorCategory,
  ProductEditorInitial,
} from "./product-editor-types";

type EditorTab = "basic" | "content" | "market";

export function ProductEditor({
  initial,
  categories,
  onMutated,
}: {
  initial: ProductEditorInitial;
  categories: ProductEditorCategory[];
  onMutated?: () => void;
}) {
  const [form, setForm] = useState(() => fromInitial(initial));
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify(fromInitial(initial)),
  );
  const [activeTab, setActiveTab] = useState<EditorTab>("basic");
  const [status, setStatus] = useState(initial.product.status);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("저장됨");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(form) !== baseline;
  const margin = useMemo(
    () =>
      form.sellingPrice && initial.supplier.supplierPrice
        ? form.sellingPrice - Number(initial.supplier.supplierPrice)
        : null,
    [form.sellingPrice, initial.supplier.supplierPrice],
  );

  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    addEventListener("beforeunload", listener);
    return () => removeEventListener("beforeunload", listener);
  }, [dirty]);

  async function submit(action: "draft" | "ready" | "revert-to-draft") {
    setSaving(true);
    setErrors({});
    setMessage("저장 중…");
    try {
      const response = await fetch(
        `/api/products/${initial.product.id}/${action}`,
        {
          method: action === "draft" ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        setErrors(body.error?.errors ?? {});
        throw new Error(body.error?.message ?? "저장에 실패했습니다.");
      }
      const product = body.data.product;
      const next = { ...form, draftVersion: product.draftVersion };
      setForm(next);
      setBaseline(JSON.stringify(next));
      setStatus(product.status);
      setMessage(`저장 완료 ${new Date().toLocaleTimeString("ko-KR")}`);
      onMutated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function resetImages() {
    if (
      !confirm(
        "공급처 원본 이미지로 초기화할까요? 현재 이미지 편집 내용이 덮어써집니다.",
      )
    )
      return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/products/${initial.product.id}/reset-images`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ draftVersion: form.draftVersion }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? "초기화에 실패했습니다.");
      const next = {
        ...form,
        draftVersion: body.data.product.draftVersion,
        selectedImages: body.data.product.selectedImages,
      };
      setForm(next);
      setBaseline(JSON.stringify(next));
      setStatus(body.data.product.status);
      setMessage("원본 이미지로 초기화했습니다.");
      onMutated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "초기화 실패");
    } finally {
      setSaving(false);
    }
  }

  function imageChange(index: number, patch: Partial<SelectedImage>) {
    setForm((old) => ({
      ...old,
      selectedImages: old.selectedImages.map((image, imageIndex) =>
        imageIndex === index
          ? { ...image, ...patch }
          : patch.isPrimary
            ? { ...image, isPrimary: false }
            : image,
      ),
    }));
  }

  function moveImage(index: number, delta: number) {
    setForm((old) => {
      const selectedImages = [...old.selectedImages];
      const target = index + delta;
      if (target < 0 || target >= selectedImages.length) return old;
      [selectedImages[index], selectedImages[target]] = [
        selectedImages[target]!,
        selectedImages[index]!,
      ];
      return { ...old, selectedImages };
    });
  }

  const enabledImageCount = form.selectedImages.filter(
    (image) => image.enabled,
  ).length;
  const marketChecks = [
    { label: "카테고리 지정", done: Boolean(form.categoryId) },
    { label: "상품명 입력", done: Boolean(form.title.trim()) },
    { label: "판매가 입력", done: Boolean(form.sellingPrice) },
    {
      label: "대표 이미지 선택",
      done: form.selectedImages.some(
        (image) => image.enabled && image.isPrimary,
      ),
    },
    { label: "상세페이지 입력", done: Boolean(form.description.trim()) },
  ];
  const readyForMarket = marketChecks.every((check) => check.done);

  return (
    <div className="drawer-editor">
      <div className="drawer-source-summary">
        <div>
          <span>친구도매 상품번호</span>
          <strong>{initial.supplier.externalProductId}</strong>
        </div>
        <div>
          <span>공급가</span>
          <strong>{formatWon(initial.supplier.supplierPrice)}</strong>
        </div>
        <div>
          <span>공급 상태</span>
          <strong>
            {initial.supplier.availability === "sold_out"
              ? "품절"
              : "판매 가능"}
          </strong>
        </div>
      </div>

      <nav className="drawer-tabs" aria-label="상품 편집 단계">
        <TabButton
          active={activeTab === "basic"}
          onClick={() => setActiveTab("basic")}
          number="1"
          label="기본정보"
        />
        <TabButton
          active={activeTab === "content"}
          onClick={() => setActiveTab("content")}
          number="2"
          label="이미지·상세"
        />
        <TabButton
          active={activeTab === "market"}
          onClick={() => setActiveTab("market")}
          number="3"
          label="스마트스토어"
        />
      </nav>

      {Object.keys(errors).length > 0 && (
        <div className="drawer-alert error" role="alert">
          <strong>입력 내용을 확인해 주세요.</strong>
          {Object.values(errors).map((error) => (
            <span key={error}>{error}</span>
          ))}
        </div>
      )}

      <div className="drawer-editor-body">
        {activeTab === "basic" && (
          <div className="drawer-section-stack">
            <section className="drawer-form-section">
              <div className="drawer-section-title">
                <span>01</span>
                <div>
                  <h3>카테고리와 상품 정보</h3>
                  <p>마켓에 노출될 기본 판매 정보를 입력합니다.</p>
                </div>
              </div>
              <label>
                카테고리
                <select
                  value={form.categoryId ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, categoryId: event.target.value || null })
                  }
                >
                  <option value="">카테고리를 선택하세요</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {!categories.length && (
                  <small>
                    등록된 내부 카테고리가 없습니다. 카테고리 관리 기능은 추후
                    연결됩니다.
                  </small>
                )}
              </label>
              <label>
                판매용 상품명
                <input
                  value={form.title}
                  maxLength={200}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
                <small>
                  {form.title.length}/200자 · 원본:{" "}
                  {initial.supplier.originalName ?? "-"}
                </small>
              </label>
              <label>
                검색 키워드
                <input
                  value={form.searchTags.join(", ")}
                  placeholder="쉼표로 구분해 입력"
                  onChange={(event) =>
                    setForm({
                      ...form,
                      searchTags: event.target.value.split(","),
                    })
                  }
                />
                <small>최대 20개까지 입력할 수 있습니다.</small>
              </label>
              <div className="drawer-price-grid">
                <label>
                  공급가
                  <input
                    value={formatWon(initial.supplier.supplierPrice)}
                    disabled
                  />
                </label>
                <label>
                  판매가
                  <input
                    inputMode="numeric"
                    value={form.sellingPrice ?? ""}
                    placeholder="판매가 입력"
                    onChange={(event) =>
                      setForm({
                        ...form,
                        sellingPrice: event.target.value
                          ? Number(event.target.value.replace(/\D/g, ""))
                          : null,
                      })
                    }
                  />
                </label>
              </div>
              {margin !== null && (
                <p className="drawer-margin">
                  예상 단순 차액{" "}
                  <strong>{margin.toLocaleString("ko-KR")}원</strong>
                  <small>수수료·배송비·세금 미반영</small>
                </p>
              )}
              <MarginCalculator
                supplierCost={Number(initial.supplier.supplierPrice ?? 0)}
                onApply={(sellingPrice) =>
                  setForm((current) => ({ ...current, sellingPrice }))
                }
              />
            </section>

            <details className="drawer-options">
              <summary>
                옵션 정보 편집{" "}
                <span>{form.editedOptions.groups.length}개 그룹</span>
              </summary>
              <OptionEditor
                value={form.editedOptions}
                onChange={(editedOptions) =>
                  setForm({ ...form, editedOptions })
                }
              />
            </details>
          </div>
        )}

        {activeTab === "content" && (
          <div className="drawer-section-stack">
            <section className="drawer-form-section">
              <div className="drawer-section-title with-action">
                <span>02</span>
                <div>
                  <h3>썸네일 이미지</h3>
                  <p>
                    사용할 이미지와 대표 이미지를 선택하고 순서를 조정하세요.
                  </p>
                </div>
                <button type="button" onClick={resetImages} disabled={saving}>
                  원본으로 초기화
                </button>
              </div>
              <p className="drawer-image-count">
                전체 {form.selectedImages.length}개 중 {enabledImageCount}개
                사용
              </p>
              <div className="drawer-images">
                {form.selectedImages.map((image, index) => (
                  <article
                    key={image.id}
                    className={!image.enabled ? "disabled" : ""}
                  >
                    <div className="drawer-image-preview">
                      <img
                        src={image.storedUrl ?? image.sourceUrl}
                        alt={image.altText}
                      />
                      {image.isPrimary && image.enabled && <span>대표</span>}
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={image.enabled}
                        onChange={(event) =>
                          imageChange(index, { enabled: event.target.checked })
                        }
                      />{" "}
                      사용
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="drawer-primary"
                        checked={image.isPrimary}
                        onChange={() =>
                          imageChange(index, { isPrimary: true, enabled: true })
                        }
                      />{" "}
                      대표
                    </label>
                    <div className="drawer-image-actions">
                      <button
                        type="button"
                        onClick={() => moveImage(index, -1)}
                        disabled={index === 0}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => moveImage(index, 1)}
                        disabled={index === form.selectedImages.length - 1}
                      >
                        →
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="drawer-form-section">
              <div className="drawer-section-title">
                <span>03</span>
                <div>
                  <h3>상세페이지</h3>
                  <p>판매 페이지에 표시할 HTML을 편집하고 미리 확인하세요.</p>
                </div>
              </div>
              <textarea
                rows={13}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
              <div className="drawer-description-preview">
                <span>미리보기</span>
                <iframe
                  sandbox=""
                  srcDoc={form.description}
                  title="판매 상세페이지 미리보기"
                />
              </div>
            </section>
          </div>
        )}

        {activeTab === "market" && (
          <section className="drawer-market">
            <div className="drawer-market-brand">N</div>
            <span>스마트스토어 등록</span>
            <h3>상품 등록 준비 상태를 확인하세요.</h3>
            <p>
              필수 정보를 모두 작성하면 스마트스토어 등록 준비를 완료할 수
              있습니다.
            </p>
            <div className="drawer-market-checks">
              {marketChecks.map((check) => (
                <div key={check.label} className={check.done ? "done" : ""}>
                  <span>{check.done ? "✓" : "!"}</span>
                  {check.label}
                  <strong>{check.done ? "완료" : "필요"}</strong>
                </div>
              ))}
            </div>
            <div className="drawer-market-notice">
              <strong>스마트스토어 API 연동 예정</strong>
              <p>
                현재는 등록 화면과 준비 상태 확인만 제공됩니다. 실제 전송 기능은
                API 연동 후 활성화됩니다.
              </p>
            </div>
            <button
              type="button"
              className="drawer-market-button"
              onClick={() =>
                setMessage("스마트스토어 API 연동 후 사용할 수 있습니다.")
              }
            >
              스마트스토어 등록 <small>연동 예정</small>
            </button>
            {!readyForMarket && (
              <small className="drawer-market-help">
                미완료 항목을 앞선 탭에서 입력해 주세요.
              </small>
            )}
          </section>
        )}
      </div>

      <footer className="drawer-savebar">
        <div>
          <span className={`inventory-badge status-${status}`}>
            {statusLabel(status)}
          </span>
          <strong>{dirty ? "저장되지 않은 변경사항" : message}</strong>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={!dirty || saving}
          onClick={() => setForm(JSON.parse(baseline))}
        >
          변경 취소
        </button>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => submit("draft")}
        >
          {saving ? "저장 중…" : "임시저장"}
        </button>
        <button type="button" disabled={saving} onClick={() => submit("ready")}>
          등록 준비 완료
        </button>
      </footer>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  number,
  label,
}: {
  active: boolean;
  onClick: () => void;
  number: string;
  label: string;
}) {
  return (
    <button type="button" className={active ? "active" : ""} onClick={onClick}>
      <span>{number}</span>
      {label}
    </button>
  );
}

function fromInitial(initial: ProductEditorInitial) {
  const product = initial.product;
  return {
    draftVersion: product.draftVersion,
    title: product.title,
    searchTags: product.searchTags,
    sellingPrice: product.sellingPrice,
    currency: "KRW" as const,
    description: product.description,
    categoryId: product.categoryId,
    selectedImages: product.selectedImages,
    editedOptions: product.editedOptions,
  };
}

function formatWon(value: string | null) {
  if (value == null) return "-";
  const number = Number(value);
  return Number.isFinite(number)
    ? `${Math.round(number).toLocaleString("ko-KR")}원`
    : "-";
}

function statusLabel(status: string) {
  return (
    (
      {
        draft: "초안",
        editing: "편집 중",
        ready: "준비 완료",
        archived: "보관",
      } as Record<string, string>
    )[status] ?? status
  );
}
