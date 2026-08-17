"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import type { NaverProductAttribute } from "@/lib/db/schema";
import {
  defaultKeywordFilters,
  filterAndSortKeywords,
} from "@/modules/keywords/keyword-filter";
import {
  findKeywordsUsedInTitle,
  formatRawTotalSearchVolume,
} from "@/modules/keywords/keyword-utils";
import { assessProductTitle } from "@/modules/keywords/title-quality";
import { assessSearchTag } from "@/modules/keywords/search-tag-quality";
import { keywordThresholds } from "@/modules/keywords/config";
import { shoppingSearchOperatingHypotheses } from "@/modules/keywords/shopping-search-operating-hypotheses";
import type {
  KeywordCandidateRecord,
  KeywordFilterState,
  ManagedProductDetail,
  ManagedProductSummary,
  ProductAnalysis,
  SupplierAvailabilityCheck,
} from "@/modules/keywords/types";

const NaverAttributeEditor = dynamic(
  () =>
    import("../products/[id]/edit/naver-attribute-editor").then(
      (module) => module.NaverAttributeEditor,
    ),
  { loading: () => <p role="status">네이버 공식 속성 편집기를 불러오는 중…</p> },
);
const NaverMarginCalculator = dynamic(
  () =>
    import("@/app/admin/components/naver-margin-calculator").then(
      (module) => module.NaverMarginCalculator,
    ),
  { loading: () => <p role="status">판매가 계산기를 불러오는 중…</p> },
);

type CategoryRequirements = {
  attributes: Array<{
    attributeSeq: number;
    attributeName: string;
    attributeClassificationType?: "SINGLE_SELECT" | "MULTI_SELECT" | "RANGE";
    unitUsable?: boolean;
    representativeUnitCode?: string;
    attributeValueMaxMatchingCount?: number;
  }>;
  attributeValues: Array<{
    attributeSeq: number;
    attributeValueSeq: number;
    attributeValueName?: string;
    minAttributeValue?: string;
    minAttributeValueUnitCode?: string;
    maxAttributeValue?: string;
    maxAttributeValueUnitCode?: string;
    exposureOrder?: number;
  }>;
  units: Array<{ id: string; unitCodeName: string }>;
};

type RuntimeStatus = {
  mockMode: boolean;
  searchAdConfigured: boolean;
  apiHubConfigured: boolean;
  rankLookupConfigured?: boolean;
};

type StoreOption = {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
};

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  requirements?: T;
  items?: ManagedProductSummary[];
  runtime?: RuntimeStatus;
  error?: { message?: string };
};

type ChromeRankResult = {
  device: "pc";
  status: "found" | "not_found" | "blocked" | "failed";
  rank: number | null;
  checkedRange: number;
  observedAt: string;
  message: string | null;
};

const RANK_EXTENSION_PING_EVENT = "shoppingday:rank-extension-ping";
const RANK_EXTENSION_STATUS_EVENT = "shoppingday:rank-extension-status";
const RANK_EXTENSION_REQUEST_EVENT = "shoppingday:rank-extension-request";
const RANK_EXTENSION_RESULT_EVENT = "shoppingday:rank-extension-result";
const SUPPLIER_CHECK_REQUEST_EVENT = "shoppingday:supplier-check-request";
const SUPPLIER_CHECK_RESULT_EVENT = "shoppingday:supplier-check-result";

export function KeywordManager({
  initialItems,
  initialDetail,
  initialRuntime,
  stores = [],
}: {
  initialItems: ManagedProductSummary[];
  initialDetail: ManagedProductDetail | null;
  initialRuntime: RuntimeStatus;
  stores?: StoreOption[];
}) {
  const [items, setItems] = useState(initialItems);
  const [activeId, setActiveId] = useState(initialDetail?.product.id ?? null);
  const [detail, setDetail] = useState(initialDetail);
  const [runtime, setRuntime] = useState(initialRuntime);
  const [showAdd, setShowAdd] = useState(!initialDetail);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function selectProduct(id: string) {
    setActiveId(id);
    setShowAdd(false);
    setBusy("detail");
    clearFeedback();
    try {
      const response = await api<ManagedProductDetail>(`/api/keyword-products/${id}`);
      setDetail(response.data!);
      if (response.runtime) setRuntime(response.runtime);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function refreshList(preferredId?: string) {
    const response = await api<never>("/api/keyword-products");
    setItems(response.items ?? []);
    if (response.runtime) setRuntime(response.runtime);
    if (preferredId) setActiveId(preferredId);
  }

  async function removeManagedProduct(id: string, title: string) {
    if (
      !window.confirm(
        `"${title}"을 성장관리에서 제외할까요?\n\n키워드 분석과 순위 기록은 삭제되지만, 등록상품과 스마트스토어 상품은 그대로 유지됩니다.`,
      )
    ) {
      return;
    }
    setBusy("remove");
    clearFeedback();
    try {
      await api(`/api/keyword-products/${id}`, { method: "DELETE" });
      const response = await api<never>("/api/keyword-products");
      const nextItems = response.items ?? [];
      setItems(nextItems);
      if (response.runtime) setRuntime(response.runtime);

      const nextId = nextItems[0]?.id ?? null;
      setActiveId(nextId);
      if (nextId) {
        const next = await api<ManagedProductDetail>(
          `/api/keyword-products/${nextId}`,
        );
        setDetail(next.data!);
        setShowAdd(false);
        if (next.runtime) setRuntime(next.runtime);
      } else {
        setDetail(null);
        setShowAdd(true);
      }
      setMessage("상품을 성장관리에서 제외했습니다. 등록상품과 스마트스토어 상품은 유지됩니다.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function runAction(
    name: string,
    url: string,
    successMessage: string,
    init: RequestInit = { method: "POST" },
  ) {
    setBusy(name);
    clearFeedback();
    try {
      const response = await api<ManagedProductDetail>(url, init);
      if (response.data) setDetail(response.data);
      await refreshList(activeId ?? undefined);
      setMessage(successMessage);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  function clearFeedback() {
    setError(null);
    setMessage(null);
  }

  return (
    <>
      <header className="inventory-topbar keyword-topbar">
        <div>
          <strong>성장 상품 관리</strong>
          <span>판매 반응이 보이는 상품의 실제 검색량을 집중 관리합니다.</span>
        </div>
        <div className="keyword-runtime-badges">
          {runtime.mockMode ? (
            <span className="keyword-runtime mock">Mock 데이터</span>
          ) : (
            <span className="keyword-runtime live">규칙 기반 기본 모드</span>
          )}
          <span className="inventory-admin-label">
            <span className="inventory-status-dot" /> 관리자 화면
          </span>
        </div>
      </header>

      <main className="inventory-main keyword-page">
        <section className="inventory-heading keyword-heading">
          <div>
            <span className="inventory-eyebrow">성장 관리 단계</span>
            <h1>등록 상품 성장 관리</h1>
            <p>
              스마트스토어에 등록된 상품을 연결하고 키워드 순위, 상품명과 검색
              태그의 변경 전후를 한곳에서 관리합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowAdd(true);
              setActiveId(null);
              setDetail(null);
              clearFeedback();
            }}
          >
            관리 상품 추가
          </button>
        </section>

        {runtime.mockMode && (
          <div className="keyword-callout mock" role="status">
            현재 화면의 상품 분석과 검색량은 고정된 Mock fixture입니다. 실제 데이터로
            오해하지 마세요.
          </div>
        )}
        {!runtime.mockMode && !runtime.searchAdConfigured && (
          <div className="keyword-callout warning" role="status">
            네이버 검색광고 API 키가 아직 설정되지 않았습니다. 규칙 기반 상품 분석과
            상품명 초안은 사용할 수 있지만 실제 검색량 조회는 키 입력 후 가능합니다.
          </div>
        )}
        {error && <div className="keyword-callout error" role="alert">{error}</div>}
        {message && <div className="keyword-callout success" role="status">{message}</div>}

        <div className="keyword-workspace">
          <aside className="keyword-product-list" aria-label="성장 관리 상품 목록">
            <div className="keyword-section-title">
              <div>
                <h2>관리 상품</h2>
                <span>{items.length.toLocaleString("ko-KR")}개</span>
              </div>
              <SalesBulkRefreshButton
                items={items}
                busy={busy}
                onBusy={setBusy}
                onSaved={(nextItems) => {
                  setItems(nextItems);
                  const active = nextItems.find((item) => item.id === activeId);
                  if (active?.salesSummary) {
                    setDetail((current) =>
                      current && current.product.id === active.id
                        ? {
                            ...current,
                            product: {
                              ...current.product,
                              productInput: {
                                ...current.product.productInput,
                                salesSummary: active.salesSummary,
                              },
                            },
                          }
                        : current,
                    );
                  }
                }}
                onFeedback={(nextMessage, nextError) => {
                  setMessage(nextMessage);
                  setError(nextError);
                }}
              />
              <SupplierBulkCheckPanel
                items={items}
                busy={busy}
                onBusy={setBusy}
                onSaved={(productId, nextDetail, result) => {
                  setItems((current) =>
                    current.map((item) =>
                      item.id === productId
                        ? {
                            ...item,
                            supplierUrl: result.url,
                            supplierAvailabilityCheck: result,
                          }
                        : item,
                    ),
                  );
                  if (activeId === productId) setDetail(nextDetail);
                }}
                onFeedback={(nextMessage, nextError) => {
                  setMessage(nextMessage);
                  setError(nextError);
                }}
              />
            </div>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={activeId === item.id ? "active" : undefined}
                onClick={() => void selectProduct(item.id)}
                disabled={busy === "supplier-bulk-check"}
              >
                <strong>{item.finalTitle || item.editableTitle || item.supplierTitle}</strong>
                <span className="keyword-product-list-meta">
                  <span className={`keyword-supplier-status status-${item.supplierAvailabilityCheck?.status ?? "unchecked"}`}>
                    {item.supplierAvailabilityCheck
                      ? supplierAvailabilityLabel(item.supplierAvailabilityCheck.status)
                      : "직감 미확인"}
                  </span>
                  <span>
                    판매 {item.salesSummary
                      ? `7일 ${item.salesSummary.sevenDays.toLocaleString("ko-KR")}개 · 30일 ${item.salesSummary.thirtyDays.toLocaleString("ko-KR")}개`
                      : "미확인"}
                  </span>
                </span>
                <span>키워드 {item.keywordCount}개 · 선택 {item.selectedKeywordCount}개</span>
                <small>{item.channelProductNo ?? "상품번호 확인 필요"}</small>
              </button>
            ))}
            {!items.length && (
              <div className="keyword-empty-small">
                <strong>아직 관리 상품이 없습니다.</strong>
                <span>판매 반응이 보이는 상품부터 추가하세요.</span>
              </div>
            )}
          </aside>

          <section className="keyword-detail-area">
            {showAdd ? (
              <AddManagedProduct
                busy={busy === "create"}
                stores={stores}
                onSubmit={async (payload) => {
                  setBusy("create");
                  clearFeedback();
                  try {
                    const response = await api<ManagedProductDetail>(
                      "/api/keyword-products",
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                      },
                    );
                    const createdId = response.data!.product.id;
                    setDetail(response.data!);
                    setActiveId(createdId);
                    setShowAdd(false);
                    if (response.runtime) setRuntime(response.runtime);
                    await refreshList(createdId);
                    const analyzed = await api<ManagedProductDetail>(
                      `/api/keyword-products/${createdId}/analyze`,
                      { method: "POST" },
                    );
                    setDetail(analyzed.data!);
                    setMessage("상품을 저장하고 규칙 기반 분석을 완료했습니다. 분석 결과를 확인해 주세요.");
                  } catch (caught) {
                    setError(errorMessage(caught));
                  } finally {
                    setBusy(null);
                  }
                }}
              />
            ) : busy === "detail" ? (
              <div className="keyword-loading" role="status">상품 정보를 불러오는 중입니다.</div>
            ) : detail ? (
              <KeywordProductDetail
                key={`${detail.product.id}:${detail.analysis?.id ?? "not-analyzed"}`}
                detail={detail}
                rankLookupConfigured={Boolean(runtime.rankLookupConfigured)}
                busy={busy}
                onAnalyze={() =>
                  runAction(
                    "analyze",
                    `/api/keyword-products/${detail.product.id}/analyze`,
                    "규칙 기반 분석을 다시 실행했습니다. 결과를 확인해 주세요.",
                  )
                }
                onMetrics={() =>
                  runAction(
                    "metrics",
                    `/api/keyword-products/${detail.product.id}/metrics`,
                    "키워드 검색량을 갱신했습니다.",
                  )
                }
                onDetailChange={(next) => setDetail(next)}
                onFeedback={(nextMessage, nextError) => {
                  setMessage(nextMessage);
                  setError(nextError);
                }}
                onBusy={setBusy}
                onRefreshList={() => refreshList(detail.product.id)}
                onRemove={() =>
                  removeManagedProduct(
                    detail.product.id,
                    detail.product.finalTitle ||
                      detail.product.editableTitle ||
                      detail.product.supplierTitle,
                  )
                }
              />
            ) : (
              <div className="keyword-loading">왼쪽에서 관리할 상품을 선택하세요.</div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

function SupplierBulkCheckPanel({
  items,
  busy,
  onBusy,
  onSaved,
  onFeedback,
}: {
  items: ManagedProductSummary[];
  busy: string | null;
  onBusy: (name: string | null) => void;
  onSaved: (
    productId: string,
    detail: ManagedProductDetail,
    result: SupplierAvailabilityCheck,
  ) => void;
  onFeedback: (message: string | null, error: string | null) => void;
}) {
  const [extensionAvailable, setExtensionAvailable] = useState(false);
  const [skipRecent, setSkipRecent] = useState(true);
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
    currentTitle: string;
    failed: number;
  } | null>(null);
  const stopRequested = useRef(false);
  const allTargets = useMemo(
    () => items.filter((item) => isSupportedSupplierUrl(item.supplierUrl ?? "")),
    [items],
  );
  const targets = useMemo(
    () =>
      allTargets.filter(
        (item) => !skipRecent || !wasSupplierCheckedRecently(item.supplierAvailabilityCheck),
      ),
    [allTargets, skipRecent],
  );
  const running = busy === "supplier-bulk-check";

  useEffect(() => {
    function handleStatus(event: Event) {
      const status = (
        event as CustomEvent<{ available?: boolean }>
      ).detail;
      setExtensionAvailable(Boolean(status?.available));
    }
    window.addEventListener(RANK_EXTENSION_STATUS_EVENT, handleStatus);
    window.dispatchEvent(new CustomEvent(RANK_EXTENSION_PING_EVENT));
    return () =>
      window.removeEventListener(RANK_EXTENSION_STATUS_EVENT, handleStatus);
  }, []);

  async function runBulkCheck() {
    if (
      !window.confirm(
        `저장된 직감 상품 ${targets.length.toLocaleString("ko-KR")}개를 한 탭에서 순서대로 확인할까요?\n\n각 결과는 즉시 저장되며, 자동으로 스마트스토어 품절 처리는 하지 않습니다.`,
      )
    ) {
      return;
    }
    stopRequested.current = false;
    onBusy("supplier-bulk-check");
    onFeedback(null, null);
    setProgress({
      completed: 0,
      total: targets.length,
      currentTitle: "",
      failed: 0,
    });
    let completed = 0;
    let failed = 0;
    let stopReason: "auth" | "failed" | null = null;
    try {
      for (const [index, item] of targets.entries()) {
        if (stopRequested.current) break;
        const title =
          item.finalTitle || item.editableTitle || item.supplierTitle;
        setProgress({
          completed,
          total: targets.length,
          currentTitle: title,
          failed,
        });
        const result = await requestSupplierAvailabilityWithChrome(
          item.supplierUrl!,
          { background: true },
        );
        const response = await saveSupplierAvailability(
          item.id,
          item.supplierUrl!,
          result,
        );
        onSaved(item.id, response.data!, result);
        completed += 1;
        if (result.status === "failed" || result.status === "unknown") {
          failed += 1;
        }
        setProgress({
          completed,
          total: targets.length,
          currentTitle: title,
          failed,
        });
        if (result.status === "auth_required") {
          stopReason = "auth";
          break;
        }
        if (result.status === "failed") {
          stopReason = "failed";
          break;
        }
        if (index < targets.length - 1 && !stopRequested.current) {
          await wait(3_000 + Math.floor(Math.random() * 2_000));
        }
      }
      const stopped = stopRequested.current || stopReason !== null;
      onFeedback(
        stopped
          ? `직감 전체 확인을 중단했습니다. ${completed.toLocaleString("ko-KR")}/${targets.length.toLocaleString("ko-KR")}개 결과는 저장했습니다.${stopReason === "auth" ? " 직감 로그인·회원 승인을 확인해 주세요." : stopReason === "failed" ? " 확장 프로그램과 직감 페이지 상태를 확인해 주세요." : ""}`
          : `직감 상품 ${completed.toLocaleString("ko-KR")}개 확인을 완료했습니다.${failed ? ` 판정 불가·실패 ${failed.toLocaleString("ko-KR")}개를 확인해 주세요.` : ""}`,
        null,
      );
    } catch (caught) {
      onFeedback(
        null,
        `${completed.toLocaleString("ko-KR")}개까지 저장한 뒤 중단됐습니다. ${errorMessage(caught)}`,
      );
    } finally {
      onBusy(null);
    }
  }

  return (
    <div className="keyword-supplier-bulk">
      <button
        type="button"
        onClick={() => void runBulkCheck()}
        disabled={
          Boolean(busy) ||
          !extensionAvailable ||
          targets.length === 0
        }
      >
        직감 전체 확인
      </button>
      <label className="keyword-supplier-skip-recent">
        <input
          type="checkbox"
          checked={skipRecent}
          onChange={(event) => setSkipRecent(event.target.checked)}
          disabled={running}
        />
        최근 24시간 확인 상품 제외
      </label>
      {running && (
        <button
          type="button"
          className="secondary"
          onClick={() => {
            stopRequested.current = true;
          }}
        >
          현재 상품 후 중단
        </button>
      )}
      <small>
        {progress
          ? `${progress.completed.toLocaleString("ko-KR")}/${progress.total.toLocaleString("ko-KR")}개${progress.currentTitle ? ` · ${progress.currentTitle}` : ""}`
          : extensionAvailable
            ? `확인 대상 ${targets.length.toLocaleString("ko-KR")}개 / 직감 연결 ${allTargets.length.toLocaleString("ko-KR")}개`
            : "확장 프로그램을 다시 로드해 주세요."}
      </small>
      {progress && (
        <progress
          aria-label="직감 전체 확인 진행률"
          max={progress.total}
          value={progress.completed}
        />
      )}
    </div>
  );
}

function SalesBulkRefreshButton({
  items,
  busy,
  onBusy,
  onSaved,
  onFeedback,
}: {
  items: ManagedProductSummary[];
  busy: string | null;
  onBusy: (value: string | null) => void;
  onSaved: (items: ManagedProductSummary[]) => void;
  onFeedback: (message: string | null, error: string | null) => void;
}) {
  const linkedCount = items.filter((item) => item.channelProductNo).length;

  async function refreshAll() {
    onBusy("sales-summary-all");
    onFeedback(null, null);
    try {
      const response = await api<never>("/api/keyword-products/sales-summaries", {
        method: "POST",
      });
      const nextItems = response.items ?? [];
      onSaved(nextItems);
      onFeedback(
        `스마트스토어 주문을 한 번씩 조회해 관리상품 ${nextItems.length.toLocaleString("ko-KR")}개의 판매수량을 갱신했습니다.`,
        null,
      );
    } catch (caught) {
      onFeedback(null, errorMessage(caught));
    } finally {
      onBusy(null);
    }
  }

  return (
    <button
      type="button"
      className="secondary keyword-sales-bulk-button"
      onClick={() => void refreshAll()}
      disabled={Boolean(busy) || linkedCount === 0}
    >
      {busy === "sales-summary-all" ? "판매수량 일괄 조회 중…" : "판매수량 전체 갱신"}
    </button>
  );
}

function AddManagedProduct({
  busy,
  stores,
  onSubmit,
}: {
  busy: boolean;
  stores: StoreOption[];
  onSubmit: (payload: unknown) => Promise<void>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await onSubmit({
      smartstoreUrl: String(data.get("smartstoreUrl") ?? ""),
      storeConnectionId:
        String(data.get("storeConnectionId") ?? "") || undefined,
      productInput: {
        supplierTitle: String(data.get("supplierTitle") ?? ""),
        currentTitle: String(data.get("currentTitle") ?? ""),
        description: String(data.get("description") ?? ""),
        category: String(data.get("category") ?? ""),
        features: [],
        materials: [],
        colors: [],
        sizes: [],
        target: "",
        seasons: [],
        supplierUrl: String(data.get("supplierUrl") ?? ""),
        imageUrls: splitList(String(data.get("imageUrl") ?? "")),
        memo: String(data.get("memo") ?? ""),
      },
    });
  }

  return (
    <form className="keyword-card keyword-add-form" onSubmit={submit}>
      <div className="keyword-card-head">
        <div>
          <span className="inventory-eyebrow">1단계 · 상품 정보</span>
          <h2>관리할 상품 추가</h2>
          <p>
            스마트스토어 상품 링크를 붙여넣으면 현재 상품명·가격·재고·대표
            이미지·태그를 불러옵니다.
          </p>
        </div>
      </div>
      <div className="keyword-form-grid">
        <label className="wide-field">
          <span>연결 스마트스토어 *</span>
          <select
            name="storeConnectionId"
            required
            defaultValue={
              stores.find((store) => store.isDefault)?.id ??
              stores[0]?.id ??
              ""
            }
          >
            {!stores.length && (
              <option value="">먼저 스마트스토어를 연결해 주세요</option>
            )}
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name} · {store.url}
              </option>
            ))}
          </select>
        </label>
        <label className="wide-field">
          <span>스마트스토어 상품 링크 *</span>
          <input
            name="smartstoreUrl"
            type="url"
            required
            placeholder="https://smartstore.naver.com/스토어/products/1234567890"
          />
          <small className="keyword-field-help">
            본인 스토어 상품이면 카테고리·등록 속성·판매자 태그를 네이버 커머스 API에서 자동으로 가져옵니다.
          </small>
        </label>
        <label className="wide-field">
          <span>내부 참고 상품명</span>
          <input
            name="supplierTitle"
            placeholder="비워두면 스마트스토어 상품명을 사용합니다"
          />
        </label>
        <label className="wide-field">
          <span>현재 스마트스토어 상품명</span>
          <input name="currentTitle" placeholder="현재 판매 페이지에 사용 중인 상품명" />
        </label>
        <label>
          <span>카테고리</span>
          <input name="category" placeholder="예: 패션의류 > 원피스" />
          <small className="keyword-field-help">비워 두면 상품 링크에서 확인합니다.</small>
        </label>
        <label className="wide-field">
          <span>상품 설명</span>
          <textarea name="description" rows={5} placeholder="상품의 실제 특징만 입력하세요." />
        </label>
        <label>
          <span>공급사 URL</span>
          <input name="supplierUrl" type="url" placeholder="https://" />
        </label>
        <label className="wide-field">
          <span>대표 이미지 URL</span>
          <input name="imageUrl" type="url" placeholder="https://" />
        </label>
        <label className="wide-field">
          <span>추가 메모</span>
          <textarea name="memo" rows={3} />
        </label>
      </div>
      <div className="keyword-form-actions">
        <button type="submit" disabled={busy}>
          {busy ? "상품 정보를 불러오는 중…" : "상품 불러와 성장 관리 시작"}
        </button>
      </div>
    </form>
  );
}

function KeywordProductDetail({
  detail,
  rankLookupConfigured,
  busy,
  onAnalyze,
  onMetrics,
  onDetailChange,
  onFeedback,
  onBusy,
  onRefreshList,
  onRemove,
}: {
  detail: ManagedProductDetail;
  rankLookupConfigured: boolean;
  busy: string | null;
  onAnalyze: () => void;
  onMetrics: () => void;
  onDetailChange: (value: ManagedProductDetail) => void;
  onFeedback: (message: string | null, error: string | null) => void;
  onBusy: (name: string | null) => void;
  onRefreshList: () => Promise<void>;
  onRemove: () => void;
}) {
  const [activeTab, setActiveTab] = useState<
    "operations" | "keywords" | "history"
  >("operations");
  const [filters, setFilters] = useState<KeywordFilterState>(defaultKeywordFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(detail.keywords.filter((item) => item.isSelected).map((item) => item.id)),
  );
  const latestTitle = detail.titles[0] ?? null;
  const [draftId, setDraftId] = useState(latestTitle?.id ?? null);
  const [draftTitle, setDraftTitle] = useState(
    latestTitle?.editedTitle ?? detail.product.finalTitle ?? "",
  );
  const [bannedWords, setBannedWords] = useState("");
  const [similarTitles, setSimilarTitles] = useState<string[]>([]);
  const [optimizationTitle, setOptimizationTitle] = useState(
    detail.product.finalTitle ||
      detail.product.currentTitle ||
      detail.product.editableTitle,
  );
  const [optimizationTags, setOptimizationTags] = useState<string[]>(
    detail.product.productInput.searchTags ?? [],
  );
  const [salePrice, setSalePrice] = useState(
    String(detail.product.productInput.salePrice ?? ""),
  );
  const [stockQuantity, setStockQuantity] = useState(
    String(detail.product.productInput.stockQuantity ?? ""),
  );
  const [statusType, setStatusType] = useState<
    "SALE" | "OUTOFSTOCK" | "SUSPENSION"
  >(
    detail.product.productInput.statusType === "OUTOFSTOCK" ||
      detail.product.productInput.statusType === "SUSPENSION"
      ? detail.product.productInput.statusType
      : "SALE",
  );
  const [naverAttributes, setNaverAttributes] = useState<
    NaverProductAttribute[]
  >(() =>
    (detail.product.productInput.naverAttributes ?? []).map((attribute) => ({
      attributeSeq: attribute.attributeSeq,
      attributeValueSeq: attribute.attributeValueSeq,
      minValue: attribute.minValue ?? "",
      maxValue: attribute.maxValue ?? "",
      unitCode: attribute.unitCode ?? null,
    })),
  );
  const [requirements, setRequirements] =
    useState<CategoryRequirements | null>(null);
  const [requirementsError, setRequirementsError] = useState<string | null>(
    null,
  );
  const [attributesOpen, setAttributesOpen] = useState(false);
  const [supplierUrl, setSupplierUrl] = useState(
    detail.product.productInput.supplierUrl,
  );
  const [supplierExtensionAvailable, setSupplierExtensionAvailable] =
    useState(false);
  const optimizationSearchTags = optimizationTags;
  const titleKeywords = useMemo(
    () =>
      findKeywordsUsedInTitle(optimizationTitle, [
        ...detail.keywords.map((item) => item.keyword),
        ...detail.titles.flatMap((title) => title.selectedKeywords),
      ]),
    [detail.keywords, detail.titles, optimizationTitle],
  );
  const optimizationTagIssues = useMemo(
    () =>
      optimizationSearchTags.flatMap((tag) =>
        assessSearchTag(tag, { title: optimizationTitle }).map((issue) => ({
          tag,
          ...issue,
        })),
      ),
    [optimizationSearchTags, optimizationTitle],
  );

  const rejectedKeywords = detail.keywords.filter((item) => item.reviewStatus === "rejected");
  const keywordsWithSelection = useMemo(
    () =>
      detail.keywords.filter((item) => item.reviewStatus !== "rejected").map((item) => ({
        ...item,
        isSelected: selectedIds.has(item.id),
      })),
    [detail.keywords, selectedIds],
  );
  const visible = useMemo(
    () => filterAndSortKeywords(keywordsWithSelection, filters),
    [keywordsWithSelection, filters],
  );
  const selected = keywordsWithSelection.filter((item) => item.isSelected);
  const titleQualityIssues = useMemo(
    () => assessProductTitle(draftTitle, detail.analysis?.analysis.productType ?? ""),
    [draftTitle, detail.analysis?.analysis.productType],
  );
  const overviewDescription =
    htmlToPlainText(detail.product.productInput.description) ||
    "상세 설명은 스마트스토어 상품 페이지에서 확인할 수 있습니다.";
  const changeCount = useMemo(() => {
    const input = detail.product.productInput;
    const currentTitle =
      detail.product.finalTitle ||
      detail.product.currentTitle ||
      detail.product.editableTitle;
    const currentTags = input.searchTags ?? [];
    const currentStatus =
      input.statusType === "OUTOFSTOCK" || input.statusType === "SUSPENSION"
        ? input.statusType
        : "SALE";
    return [
      optimizationTitle.trim() !== currentTitle.trim(),
      JSON.stringify(optimizationSearchTags) !== JSON.stringify(currentTags),
      Number(salePrice) !== input.salePrice,
      Number(stockQuantity) !== input.stockQuantity,
      statusType !== currentStatus,
      JSON.stringify(naverAttributes) !==
        JSON.stringify(
          (input.naverAttributes ?? []).map((attribute) => ({
            attributeSeq: attribute.attributeSeq,
            attributeValueSeq: attribute.attributeValueSeq,
            minValue: attribute.minValue ?? "",
            maxValue: attribute.maxValue ?? "",
            unitCode: attribute.unitCode ?? null,
          })),
        ),
    ].filter(Boolean).length;
  }, [
    detail.product,
    naverAttributes,
    optimizationSearchTags,
    optimizationTitle,
    salePrice,
    statusType,
    stockQuantity,
  ]);

  useEffect(() => {
    const categoryId = detail.product.productInput.naverCategoryId;
    if (!categoryId || !attributesOpen) return;
    const controller = new AbortController();
    void api<CategoryRequirements>(
      `/api/integrations/naver/category-requirements?categoryId=${encodeURIComponent(categoryId)}`,
      { signal: controller.signal },
    )
      .then((response) => {
        setRequirementsError(null);
        setRequirements(response.requirements ?? null);
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setRequirementsError(errorMessage(caught));
      });
    return () => controller.abort();
  }, [attributesOpen, detail.product.productInput.naverCategoryId]);

  useEffect(() => {
    function handleStatus(event: Event) {
      const status = (
        event as CustomEvent<{ available?: boolean }>
      ).detail;
      setSupplierExtensionAvailable(Boolean(status?.available));
    }
    window.addEventListener(RANK_EXTENSION_STATUS_EVENT, handleStatus);
    window.dispatchEvent(new CustomEvent(RANK_EXTENSION_PING_EVENT));
    return () =>
      window.removeEventListener(RANK_EXTENSION_STATUS_EVENT, handleStatus);
  }, []);

  function resetOptimization() {
    const input = detail.product.productInput;
    setOptimizationTitle(
      detail.product.finalTitle ||
        detail.product.currentTitle ||
        detail.product.editableTitle,
    );
    setOptimizationTags(input.searchTags ?? []);
    setSalePrice(String(input.salePrice ?? ""));
    setStockQuantity(String(input.stockQuantity ?? ""));
    setStatusType(
      input.statusType === "OUTOFSTOCK" || input.statusType === "SUSPENSION"
        ? input.statusType
        : "SALE",
    );
    setNaverAttributes(
      (input.naverAttributes ?? []).map((attribute) => ({
        attributeSeq: attribute.attributeSeq,
        attributeValueSeq: attribute.attributeValueSeq,
        minValue: attribute.minValue ?? "",
        maxValue: attribute.maxValue ?? "",
        unitCode: attribute.unitCode ?? null,
      })),
    );
  }

  async function saveSelection() {
    onBusy("selection");
    onFeedback(null, null);
    try {
      await api(`/api/keyword-products/${detail.product.id}/keywords`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedKeywordIds: Array.from(selectedIds) }),
      });
      onFeedback("선택한 키워드를 저장했습니다.", null);
      await onRefreshList();
    } catch (caught) {
      onFeedback(null, errorMessage(caught));
    } finally {
      onBusy(null);
    }
  }

  async function updateKeywordReview(candidateId: string, status: "accepted" | "rejected") {
    onBusy("keyword-review");
    onFeedback(null, null);
    try {
      const response = await api<ManagedProductDetail>(
        `/api/keyword-products/${detail.product.id}/keywords/${candidateId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      onDetailChange(response.data!);
      onFeedback(status === "accepted" ? "제외 키워드를 다시 포함했습니다." : "키워드를 제외했습니다.", null);
    } catch (caught) {
      onFeedback(null, errorMessage(caught));
    } finally {
      onBusy(null);
    }
  }

  async function generateTitle() {
    onBusy("title-generate");
    onFeedback(null, null);
    try {
      const response = await api<{
        id: string;
        editedTitle: string;
        generatedTitle: string;
        similarTitles: string[];
      }>(`/api/keyword-products/${detail.product.id}/titles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedKeywordIds: Array.from(selectedIds),
          bannedWords: splitList(bannedWords),
        }),
      });
      setDraftId(response.data!.id);
      setDraftTitle(response.data!.editedTitle);
      setSimilarTitles(response.data!.similarTitles ?? []);
      onFeedback("상품명 초안을 생성했습니다. 수정 후 저장해 주세요.", null);
      await onRefreshList();
    } catch (caught) {
      onFeedback(null, errorMessage(caught));
    } finally {
      onBusy(null);
    }
  }

  async function saveTitle() {
    if (!draftId) return;
    onBusy("title-save");
    onFeedback(null, null);
    try {
      const response = await api<ManagedProductDetail>(
        `/api/keyword-products/${detail.product.id}/titles/${draftId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ editedTitle: draftTitle }),
        },
      );
      onDetailChange(response.data!);
      onFeedback(
        "최종 상품명을 저장했습니다. 네이버 상품에는 아직 자동 반영되지 않았습니다.",
        null,
      );
      await onRefreshList();
    } catch (caught) {
      onFeedback(null, errorMessage(caught));
    } finally {
      onBusy(null);
    }
  }

  async function applyOptimizationToNaver() {
    const searchTags = optimizationSearchTags.slice(0, 10);
    const parsedPrice = Number(salePrice);
    const parsedStock = Number(stockQuantity);
    if (
      !window.confirm(
        `스마트스토어 상품을 실제로 수정할까요?\n\n상품명: ${optimizationTitle}\n판매가: ${parsedPrice.toLocaleString("ko-KR")}원\n재고: ${parsedStock.toLocaleString("ko-KR")}개\n상태: ${statusLabel(statusType)}\n검색 태그: ${searchTags.join(", ") || "없음"}`,
      )
    ) {
      return;
    }
    onBusy("naver-apply");
    onFeedback(null, null);
    try {
      const response = await api<ManagedProductDetail>(
        `/api/keyword-products/${detail.product.id}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmed: true,
            title: optimizationTitle,
            searchTags,
            salePrice: parsedPrice,
            stockQuantity: parsedStock,
            statusType,
            naverAttributes: serializeNaverAttributes(
              naverAttributes,
              requirements,
              detail.product.productInput.naverAttributes ?? [],
            ),
          }),
        },
      );
      onDetailChange(response.data!);
      onFeedback(
        "상품명과 검색 태그를 스마트스토어 상품에 반영했습니다.",
        null,
      );
      await onRefreshList();
    } catch (caught) {
      onFeedback(null, errorMessage(caught));
    } finally {
      onBusy(null);
    }
  }

  async function checkSupplierAvailability() {
    onBusy("supplier-stock-check");
    onFeedback(null, null);
    try {
      const result = await requestSupplierAvailabilityWithChrome(
        supplierUrl.trim(),
      );
      const response = await saveSupplierAvailability(
        detail.product.id,
        supplierUrl.trim(),
        result,
      );
      onDetailChange(response.data!);
      onFeedback(
        `직감 공급처 상태를 '${supplierAvailabilityLabel(result.status)}'로 기록했습니다.`,
        null,
      );
      await onRefreshList();
    } catch (caught) {
      onFeedback(null, errorMessage(caught));
    } finally {
      onBusy(null);
    }
  }

  return (
    <div className="keyword-detail-stack">
      <section className="keyword-card keyword-product-overview">
        <div className="keyword-overview-main">
          {detail.product.productInput.representativeImageUrl ? (
            <Image
              className="keyword-overview-image"
              src={detail.product.productInput.representativeImageUrl}
              alt=""
              width={112}
              height={112}
              unoptimized
            />
          ) : (
            <div className="keyword-overview-image placeholder">이미지 없음</div>
          )}
          <div className="keyword-overview-copy">
            <div className="keyword-overview-badges">
              <span className={`keyword-status-badge ${statusType.toLowerCase()}`}>
                {statusLabel(statusType)}
              </span>
              {detail.product.productInput.commerceImport && (
                <span className="keyword-import-status">
                  {detail.product.productInput.commerceImport.status === "success"
                    ? "네이버 조회 완료"
                    : "네이버 정보 확인 필요"}
                </span>
              )}
            </div>
            <h2>{detail.product.finalTitle || detail.product.editableTitle}</h2>
            <p title={overviewDescription}>{overviewDescription}</p>
            <div className="keyword-overview-links">
              <a href={detail.product.smartstoreUrl} target="_blank" rel="noreferrer">
                스마트스토어 상품 보기 ↗
              </a>
              <button
                type="button"
                className="keyword-remove-managed"
                onClick={onRemove}
                disabled={Boolean(busy)}
              >
                {busy === "remove" ? "제외 중…" : "성장관리에서 제외"}
              </button>
            </div>
          </div>
        </div>
        <div className="keyword-overview-facts">
          <div>
            <span>판매가</span>
            <strong>
              {detail.product.productInput.salePrice == null
                ? "—"
                : `${detail.product.productInput.salePrice.toLocaleString("ko-KR")}원`}
            </strong>
          </div>
          <div>
            <span>재고</span>
            <strong>
              {detail.product.productInput.stockQuantity == null
                ? "—"
                : `${detail.product.productInput.stockQuantity.toLocaleString("ko-KR")}개`}
            </strong>
          </div>
          <div className="wide">
            <span>카테고리</span>
            <strong>
              {detail.product.productInput.category ||
                detail.product.productInput.naverCategoryId ||
                "확인되지 않음"}
            </strong>
          </div>
        </div>
        <SalesSummaryPanel
          detail={detail}
          busy={busy}
          onBusy={onBusy}
          onChange={onDetailChange}
          onFeedback={onFeedback}
        />
        <div className="keyword-current-tags">
          <span>판매자 태그</span>
          <div>
            {(detail.product.productInput.searchTags ?? []).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
            {!detail.product.productInput.searchTags?.length && (
              <small>등록된 태그 없음</small>
            )}
          </div>
        </div>
        <div className="keyword-current-tags keyword-title-keywords">
          <span>상품명 키워드</span>
          <div>
            {titleKeywords.map((keyword) => (
              <span key={keyword}>{keyword}</span>
            ))}
            {!titleKeywords.length && (
              <small>현재 상품명과 일치하는 분석 키워드가 없습니다.</small>
            )}
          </div>
        </div>
      </section>

      <div className="keyword-detail-tabs" role="tablist" aria-label="성장 상품 관리 영역">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "operations"}
          className={activeTab === "operations" ? "active" : undefined}
          onClick={() => setActiveTab("operations")}
        >
          상품 운영
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "keywords"}
          className={activeTab === "keywords" ? "active" : undefined}
          onClick={() => setActiveTab("keywords")}
        >
          키워드 분석
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "history"}
          className={activeTab === "history" ? "active" : undefined}
          onClick={() => setActiveTab("history")}
        >
          변경·순위 이력
        </button>
      </div>

      {activeTab === "operations" && (
        <section className="keyword-card keyword-growth-optimizer" role="tabpanel">
          <div className="keyword-card-head">
            <div>
              <span className="inventory-eyebrow">스마트스토어 변경 반영</span>
              <h2>핵심 판매 정보 편집</h2>
              <p>자주 수정하는 정보만 먼저 확인하고 공식 속성은 필요할 때 펼칩니다.</p>
            </div>
          </div>
          <div className="keyword-supplier-stock-panel">
            <div>
              <span className="inventory-eyebrow">위탁 공급처</span>
              <strong>품절·단종 확인</strong>
              <small>
                현재는 로그인된 Chrome에서 직감 상품 상세 페이지만 확인합니다.
              </small>
            </div>
            <label>
              <span>공급처 상품 URL</span>
              <input
                type="url"
                value={supplierUrl}
                onChange={(event) => setSupplierUrl(event.target.value)}
                placeholder="https://zicgam.com/product/detail.html?product_no=..."
              />
            </label>
            <button
              type="button"
              onClick={() => void checkSupplierAvailability()}
              disabled={
                Boolean(busy) ||
                !supplierExtensionAvailable ||
                !isSupportedSupplierUrl(supplierUrl)
              }
            >
              {busy === "supplier-stock-check"
                ? "직감 재고 확인 중…"
                : "Chrome으로 이 상품만 확인"}
            </button>
            <SupplierAvailabilityResult
              result={detail.product.productInput.supplierAvailabilityCheck}
              extensionAvailable={supplierExtensionAvailable}
            />
          </div>
          <div className="keyword-commerce-fields">
            <label className="keyword-title-editor wide">
              <span>스마트스토어 상품명</span>
              <textarea
                rows={2}
                value={optimizationTitle}
                onChange={(event) => setOptimizationTitle(event.target.value)}
              />
              <small>{optimizationTitle.length}자</small>
            </label>
            <label>
              <span>판매가</span>
              <input
                type="number"
                min={1}
                value={salePrice}
                onChange={(event) => setSalePrice(event.target.value)}
              />
            </label>
            <label>
              <span>재고</span>
              <input
                type="number"
                min={0}
                value={stockQuantity}
                onChange={(event) => setStockQuantity(event.target.value)}
              />
            </label>
            <label>
              <span>판매 상태</span>
              <select
                value={statusType}
                onChange={(event) => {
                  const next = event.target.value as
                    | "SALE"
                    | "OUTOFSTOCK"
                    | "SUSPENSION";
                  setStatusType(next);
                  if (next === "OUTOFSTOCK") setStockQuantity("0");
                }}
              >
                <option value="SALE">판매 중</option>
                <option value="OUTOFSTOCK">품절</option>
                <option value="SUSPENSION">판매 중지</option>
              </select>
            </label>
            <div className="keyword-price-calculator wide">
              <NaverMarginCalculator
                editableSupplierCost
                defaultOpen
                onApply={(sellingPrice) => setSalePrice(String(sellingPrice))}
              />
            </div>
            <div className="keyword-tag-field wide">
              <div className="keyword-tag-field-heading">
                <span>판매자 태그</span>
                <small>{optimizationSearchTags.length}/10</small>
              </div>
              <SearchTagEditor
                tags={optimizationSearchTags}
                onChange={setOptimizationTags}
                disabled={optimizationSearchTags.length >= 10}
              />
              {optimizationTagIssues.map((issue) => (
                <small className="field-error" key={`${issue.tag}-${issue.code}`}>
                  {issue.tag}: {issue.message}
                </small>
              ))}
            </div>
          </div>
          <details
            className="keyword-attribute-editor"
            open={attributesOpen}
            onToggle={(event) =>
              setAttributesOpen((event.currentTarget as HTMLDetailsElement).open)
            }
          >
            <summary>
              <span>
                <strong>카테고리·네이버 공식 속성</strong>
                <small>
                  {detail.product.productInput.category || "카테고리 미확인"} ·{" "}
                  {detail.product.productInput.naverAttributes?.length ?? 0}개
                </small>
              </span>
              <span>필요할 때 펼치기</span>
            </summary>
            <div className="keyword-attribute-editor-body">
              <p>상품명에 반복하지 않고 속성 필드에 정확한 값을 입력합니다.</p>
              {requirements ? (
                <NaverAttributeEditor
                  attributes={requirements.attributes}
                  candidates={requirements.attributeValues}
                  units={requirements.units}
                  value={naverAttributes}
                  onChange={setNaverAttributes}
                />
              ) : requirementsError ? (
                <p className="field-error">{requirementsError}</p>
              ) : detail.product.productInput.naverCategoryId ? (
                <p role="status">카테고리 속성을 불러오는 중…</p>
              ) : (
                <p>네이버 카테고리 ID가 없어 속성 편집기를 열 수 없습니다.</p>
              )}
            </div>
          </details>
          {changeCount > 0 && (
            <div className="keyword-sticky-actions" role="status">
              <strong>변경 {changeCount}건</strong>
              <span>확인 후 기존 스마트스토어 상품에 반영합니다.</span>
              <button type="button" className="secondary" onClick={resetOptimization}>
                변경 취소
              </button>
              <button
                type="button"
                onClick={() => void applyOptimizationToNaver()}
                disabled={
                  Boolean(busy) ||
                  !optimizationTitle.trim() ||
                  !Number.isInteger(Number(salePrice)) ||
                  Number(salePrice) < 1 ||
                  !Number.isInteger(Number(stockQuantity)) ||
                  Number(stockQuantity) < 0 ||
                  (statusType === "SALE" && Number(stockQuantity) < 1) ||
                  (statusType === "OUTOFSTOCK" && Number(stockQuantity) !== 0) ||
                  optimizationSearchTags.length > 10 ||
                  optimizationTagIssues.length > 0
                }
              >
                {busy === "naver-apply"
                  ? "스마트스토어 반영 중…"
                  : "변경사항 스마트스토어 반영"}
              </button>
            </div>
          )}
        </section>
      )}

      {activeTab === "keywords" && (
        <>
          <section className="keyword-card keyword-analysis-actions">
            <div>
              <span className="inventory-eyebrow">분석 도구</span>
              <strong>상품과 직접 관련된 키워드만 검토합니다.</strong>
            </div>
            <div className="keyword-summary-actions">
              <button type="button" onClick={onAnalyze} disabled={Boolean(busy)}>
                {busy === "analyze"
                  ? "분석 중…"
                  : detail.analysis
                    ? "분석 다시 실행"
                    : "규칙 기반 분석 시작"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={onMetrics}
                disabled={Boolean(busy) || !detail.keywords.length}
              >
                {busy === "metrics" ? "조회 중…" : "네이버 검색 데이터 조회"}
              </button>
            </div>
          </section>

      {detail.analysis ? (
        <AnalysisEditor
          detail={detail}
          busy={Boolean(busy)}
          onBusy={onBusy}
          onChange={onDetailChange}
          onFeedback={onFeedback}
          onRefreshList={onRefreshList}
        />
      ) : (
        <section className="keyword-card keyword-empty-state">
          <strong>아직 상품 분석 결과가 없습니다.</strong>
          <span>상품 분석을 실행하면 관련 키워드 후보가 생성됩니다.</span>
        </section>
      )}

      {detail.keywords.length > 0 && (
        <section className="keyword-card keyword-table-card">
          <div className="keyword-card-head keyword-table-heading">
            <div>
              <span className="inventory-eyebrow">검색량 기반 비교</span>
              <h2>키워드 후보</h2>
              <p>필터를 바꿔도 선택 상태는 유지됩니다.</p>
            </div>
            <div className="keyword-selection-count">선택 {selected.length}개</div>
          </div>
          <details className="keyword-hypothesis-note">
            <summary>
              월간 검색량 1,000 이하를 ‘초기 공략 후보’로 표시합니다.
            </summary>
            <p>
              사용자 운영 가설: {shoppingSearchOperatingHypotheses.rankingFormulaLabel}, 필드 우선순위는
              {` ${shoppingSearchOperatingHypotheses.fieldPriority.join(" > ")}`}, 자연검색 1페이지는
              {` ${shoppingSearchOperatingHypotheses.resultPageSize}개`}로 봅니다. N+스토어는
              개인별 선호도가 추가되고 검색 결과가 개인화되므로 같은 시각에도 사용자별
              순위가 다를 수 있습니다. 네이버 공식 배점이나 노출 보장은 아닙니다.
            </p>
          </details>
          <KeywordFilters filters={filters} onChange={setFilters} />
          <div className="keyword-bulk-actions">
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setSelectedIds((current) => new Set([...current, ...visible.map((item) => item.id)]))
              }
            >
              표시 항목 전체 선택
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setSelectedIds((current) => {
                  const next = new Set(current);
                  visible.forEach((item) => next.delete(item.id));
                  return next;
                })
              }
            >
              표시 항목 선택 해제
            </button>
            <button type="button" className="secondary" onClick={() => setSelectedIds(new Set())}>
              전체 선택 초기화
            </button>
            <button type="button" onClick={() => void saveSelection()} disabled={busy === "selection"}>
              선택 저장
            </button>
          </div>
          <KeywordTable
            items={visible}
            selectedIds={selectedIds}
            onToggle={(id, checked) =>
              setSelectedIds((current) => {
                const next = new Set(current);
                if (checked) next.add(id);
                else next.delete(id);
                return next;
              })
            }
            onReject={(id) => void updateKeywordReview(id, "rejected")}
          />
          {!visible.length && (
            <div className="keyword-empty-state compact">
              <strong>현재 필터에 맞는 키워드가 없습니다.</strong>
              <span>필터를 초기화하거나 검색 범위를 넓혀보세요.</span>
            </div>
          )}
          {rejectedKeywords.length > 0 && (
            <details className="keyword-rejected-panel">
              <summary>제외 키워드 보기 ({rejectedKeywords.length}개)</summary>
              <ul>
                {rejectedKeywords.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.keyword}</strong>
                      <span>{item.filterReasons.join(" · ") || "사용자가 제외함"}</span>
                    </div>
                    <button type="button" className="secondary" onClick={() => void updateKeywordReview(item.id, "accepted")}>다시 포함</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="keyword-metric-note">
            분류 기준 — 소형: 월간 {keywordThresholds.smallMin.toLocaleString("ko-KR")}~{keywordThresholds.smallMax.toLocaleString("ko-KR")},
            중형: {keywordThresholds.mediumMin.toLocaleString("ko-KR")}~{keywordThresholds.mediumMax.toLocaleString("ko-KR")},
            대형: {keywordThresholds.largeMin.toLocaleString("ko-KR")} 이상. 검색량과 경쟁도는
            수요 참고 정보이며 실제 노출 순위나 판매를 보장하지 않습니다.
          </p>
        </section>
      )}

      {detail.analysis && detail.keywords.length > 0 && (
        <section className="keyword-card keyword-title-builder">
          <div className="keyword-card-head">
            <div>
              <span className="inventory-eyebrow">사용자 최종 결정</span>
              <h2>상품명 초안</h2>
              <p>선택한 키워드의 중복을 제거하고 상품 유형을 유지하며 최종 문구는 직접 수정합니다.</p>
            </div>
          </div>
          <div className="keyword-selected-chips">
            {selected.map((item) => <span key={item.id}>{item.keyword}</span>)}
            {!selected.length && <small>선택한 키워드가 없습니다.</small>}
          </div>
          <label>
            <span>금지어</span>
            <input
              value={bannedWords}
              onChange={(event) => setBannedWords(event.target.value)}
              placeholder="쉼표로 구분"
            />
          </label>
          <button
            type="button"
            onClick={() => void generateTitle()}
            disabled={!selected.length || busy === "title-generate"}
          >
            {busy === "title-generate" ? "초안 생성 중…" : "선택한 키워드로 초안 만들기"}
          </button>
          <label className="keyword-title-editor">
            <span>수정 가능한 최종 상품명</span>
            <textarea
              rows={3}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="초안을 만든 뒤 직접 수정하세요."
            />
            <small>{draftTitle.length}자</small>
          </label>
          {draftTitle.trim() && (
            <div
              className={`keyword-title-quality ${titleQualityIssues.length ? "warning" : "clear"}`}
              aria-live="polite"
            >
              <strong>
                {titleQualityIssues.length
                  ? `품질 확인 ${titleQualityIssues.length}건`
                  : "기본 품질 확인 완료"}
              </strong>
              {titleQualityIssues.length ? (
                <ul>
                  {titleQualityIssues.map((issue) => (
                    <li key={issue.code}>{issue.message}</li>
                  ))}
                </ul>
              ) : (
                <span>상품 유형 유지, 단어 중복, 넓은 분류어와 홍보 문구를 확인했습니다.</span>
              )}
              <small>검색어드바이저 품질 원칙을 참고한 권장사항이며 노출 순위를 보장하지 않습니다.</small>
            </div>
          )}
          {similarTitles.length > 0 && (
            <div className="keyword-callout warning" role="status">
              <strong>유사한 상품명이 이미 있습니다.</strong> 실제로 구분되는 속성이 있는지
              확인하세요: {similarTitles.join(", ")}
            </div>
          )}
          <div className="keyword-title-save-row">
            <button
              type="button"
              onClick={() => void saveTitle()}
              disabled={!draftId || !draftTitle.trim() || busy === "title-save"}
            >
              {busy === "title-save" ? "저장 중…" : "수정한 상품명 저장"}
            </button>
            <span>네이버 상품 자동 수정은 이번 MVP에 포함되지 않습니다.</span>
          </div>
        </section>
      )}
        </>
      )}

      {activeTab === "history" && (
        <div className="keyword-history-stack" role="tabpanel">
          <TitleHistoryPanel detail={detail} />
          <RankTrackingPanel
            detail={detail}
            titleKeywords={titleKeywords}
            rankLookupConfigured={rankLookupConfigured}
            busy={busy}
            onBusy={onBusy}
            onChange={onDetailChange}
            onFeedback={onFeedback}
          />
        </div>
      )}
    </div>
  );
}

function SalesSummaryPanel({
  detail,
  busy,
  onBusy,
  onChange,
  onFeedback,
}: {
  detail: ManagedProductDetail;
  busy: string | null;
  onBusy: (value: string | null) => void;
  onChange: (value: ManagedProductDetail) => void;
  onFeedback: (message: string | null, error: string | null) => void;
}) {
  const summary = detail.product.productInput.salesSummary;

  async function refresh() {
    onBusy("sales-summary");
    onFeedback(null, null);
    try {
      const response = await api<ManagedProductDetail>(
        `/api/keyword-products/${detail.product.id}/sales-summary`,
        { method: "POST" },
      );
      onChange(response.data!);
      onFeedback("네이버 주문 기준 최근 판매 수량을 갱신했습니다.", null);
    } catch (caught) {
      onFeedback(null, errorMessage(caught));
    } finally {
      onBusy(null);
    }
  }

  return (
    <div className="keyword-sales-summary">
      <div className="keyword-sales-heading">
        <div>
          <span className="inventory-eyebrow">실제 판매 반응</span>
          <h2>최근 판매 수량</h2>
          <p>취소·반품·미결제 수량을 제외한 네이버 주문의 잔여수량입니다.</p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => void refresh()}
          disabled={Boolean(busy)}
        >
          {busy === "sales-summary" ? "주문 조회 중…" : "판매 수량 새로고침"}
        </button>
      </div>
      <div className="keyword-sales-cards">
        <article>
          <span>최근 7일</span>
          <strong>
            {summary ? summary.sevenDays.toLocaleString("ko-KR") : "—"}
            <small>개</small>
          </strong>
        </article>
        <article>
          <span>최근 30일</span>
          <strong>
            {summary ? summary.thirtyDays.toLocaleString("ko-KR") : "—"}
            <small>개</small>
          </strong>
        </article>
        <article className="keyword-sales-meta">
          <span>마지막 확인</span>
          <strong>
            {summary
              ? new Date(summary.fetchedAt).toLocaleString("ko-KR")
              : "아직 조회하지 않음"}
          </strong>
        </article>
      </div>
    </div>
  );
}

function SearchTagEditor({
  tags,
  onChange,
  disabled,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState("");

  function commitDraft(value = draft) {
    const candidates = splitList(value);
    if (!candidates.length) {
      setDraft("");
      return;
    }
    onChange(Array.from(new Set([...tags, ...candidates])).slice(0, 10));
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft();
      return;
    }
    if (event.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="keyword-tag-editor">
      {tags.map((tag) => (
        <span className="keyword-tag-chip" key={tag}>
          {tag}
          <button
            type="button"
            aria-label={`${tag} 태그 삭제`}
            onClick={() => onChange(tags.filter((item) => item !== tag))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        aria-label="판매자 태그 추가"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commitDraft()}
        placeholder={tags.length ? "태그 추가" : "쉼표 또는 Enter로 태그 추가"}
        disabled={disabled}
      />
    </div>
  );
}

function TitleHistoryPanel({ detail }: { detail: ManagedProductDetail }) {
  return (
    <section className="keyword-card keyword-title-history">
      <div className="keyword-card-head">
        <div>
          <span className="inventory-eyebrow">저장된 변경 기록</span>
          <h2>상품명 초안 이력</h2>
          <p>저장한 상품명 초안과 사용한 키워드를 시간순으로 확인합니다.</p>
        </div>
      </div>
      {detail.titles.length ? (
        <div className="keyword-title-history-list">
          {detail.titles.map((title) => (
            <article key={title.id}>
              <div>
                <strong>{title.editedTitle}</strong>
                <span>{title.selectedKeywords.join(" · ") || "선택 키워드 없음"}</span>
              </div>
              <time dateTime={new Date(title.updatedAt).toISOString()}>
                {new Date(title.updatedAt).toLocaleString("ko-KR")}
              </time>
            </article>
          ))}
        </div>
      ) : (
        <div className="keyword-empty-state compact">
          <strong>저장된 상품명 초안이 없습니다.</strong>
          <span>키워드 분석 탭에서 초안을 저장하면 여기에 기록됩니다.</span>
        </div>
      )}
    </section>
  );
}

function RankTrackingPanel({
  detail,
  titleKeywords,
  rankLookupConfigured,
  busy,
  onBusy,
  onChange,
  onFeedback,
}: {
  detail: ManagedProductDetail;
  titleKeywords: string[];
  rankLookupConfigured: boolean;
  busy: string | null;
  onBusy: (value: string | null) => void;
  onChange: (value: ManagedProductDetail) => void;
  onFeedback: (message: string | null, error: string | null) => void;
}) {
  const selectedKeyword =
    detail.product.sourceTitleKeywords[0] ??
    titleKeywords[0] ??
    detail.keywords.find((keyword) => keyword.isSelected)?.keyword ??
    detail.keywords[0]?.keyword ??
    "";
  const [keyword, setKeyword] = useState(selectedKeyword);
  const [rank, setRank] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [checkedAt, setCheckedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [rankExtension, setRankExtension] = useState<{
    available: boolean;
    version: string | null;
  }>({ available: false, version: null });
  const observations = detail.rankObservations ?? [];

  useEffect(() => {
    function handleStatus(event: Event) {
      const status = (
        event as CustomEvent<{ available?: boolean; version?: string | null }>
      ).detail;
      setRankExtension({
        available: Boolean(status?.available),
        version: status?.version ?? null,
      });
    }
    window.addEventListener(RANK_EXTENSION_STATUS_EVENT, handleStatus);
    window.dispatchEvent(new CustomEvent(RANK_EXTENSION_PING_EVENT));
    return () =>
      window.removeEventListener(RANK_EXTENSION_STATUS_EVENT, handleStatus);
  }, []);

  async function saveObservation() {
    onBusy("rank-save");
    onFeedback(null, null);
    try {
      const response = await api<ManagedProductDetail>(
        `/api/keyword-products/${detail.product.id}/rank-observations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword,
            rank: notFound ? null : Number(rank),
            checkedAt: new Date(`${checkedAt}T12:00:00+09:00`).toISOString(),
            note: notFound ? "1,000위 안에서 찾지 못함" : "",
          }),
        },
      );
      onChange(response.data!);
      setRank("");
      onFeedback("확인한 키워드 순위를 기록했습니다.", null);
    } catch (caught) {
      onFeedback(null, errorMessage(caught));
    } finally {
      onBusy(null);
    }
  }

  async function observeRanks() {
    onBusy("rank-observe");
    onFeedback(null, null);
    try {
      const response = await api<ManagedProductDetail>(
        `/api/keyword-products/${detail.product.id}/rank-observations/observe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword }),
        },
      );
      onChange(response.data!);
      onFeedback(
        `"${keyword.trim()}"의 네이버쇼핑 PC·모바일 100위 이내 노출을 확인했습니다.`,
        null,
      );
    } catch (caught) {
      onFeedback(null, errorMessage(caught));
    } finally {
      onBusy(null);
    }
  }

  async function observePcRankWithChrome() {
    if (!detail.product.channelProductNo) {
      onFeedback(null, "네이버 채널 상품번호를 확인하지 못했습니다.");
      return;
    }
    onBusy("rank-extension-observe");
    onFeedback(null, null);
    try {
      const result = await requestChromeRankObservation({
        keyword,
        channelProductNo: detail.product.channelProductNo,
        smartstoreUrl: detail.product.smartstoreUrl,
      });
      const response = await api<ManagedProductDetail>(
        `/api/keyword-products/${detail.product.id}/rank-observations/browser`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword, result }),
        },
      );
      onChange(response.data!);
      onFeedback(
        result.status === "found"
          ? `"${keyword.trim()}"의 가격비교 PC 순위를 Chrome에서 확인했습니다.`
          : `"${keyword.trim()}"의 가격비교 PC 조회 결과를 기록했습니다.`,
        null,
      );
    } catch (caught) {
      onFeedback(null, errorMessage(caught));
    } finally {
      onBusy(null);
    }
  }

  return (
    <section className="keyword-card keyword-rank-tracker">
      <div className="keyword-card-head">
        <div>
          <span className="inventory-eyebrow">실제 순위 이력</span>
          <h2>키워드별 노출 순위 기록</h2>
          <p>
            같은 조건에서 확인한 실제 순위를 날짜별로 남겨 상품명·태그 변경 전후를
            비교합니다.
          </p>
        </div>
      </div>
      <div className="keyword-rank-entry">
        <div className="keyword-rank-title-keywords source">
          <strong>소싱 상품명 생성에 사용한 키워드</strong>
          <div>
            {detail.product.sourceTitleKeywords.map((item) => (
              <button
                type="button"
                className="secondary"
                key={item}
                onClick={() => setKeyword(item)}
              >
                {item}
              </button>
            ))}
            {!detail.product.sourceTitleKeywords.length && (
              <small>
                저장되거나 소싱조사 기록에서 복원 가능한 상품명 키워드가 없습니다.
              </small>
            )}
          </div>
        </div>
        <div className="keyword-rank-title-keywords">
          <strong>상품명 기반 추적 후보</strong>
          <div>
            {titleKeywords.map((item) => (
              <button
                type="button"
                className="secondary"
                key={item}
                onClick={() => setKeyword(item)}
              >
                {item}
              </button>
            ))}
            {!titleKeywords.length && (
              <small>상품명과 일치하는 키워드 후보가 없습니다.</small>
            )}
          </div>
        </div>
        <label>
          <span>확인 키워드</span>
          <input
            list={`rank-keywords-${detail.product.id}`}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <datalist id={`rank-keywords-${detail.product.id}`}>
            {Array.from(
              new Set([
                ...detail.product.sourceTitleKeywords,
                ...titleKeywords,
                ...detail.keywords.map((item) => item.keyword),
              ]),
            ).map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </label>
        <div className="keyword-rank-auto-action">
          <button
            type="button"
            onClick={() => void observePcRankWithChrome()}
            disabled={
              Boolean(busy) || !keyword.trim() || !rankExtension.available
            }
          >
            {busy === "rank-extension-observe"
              ? "Chrome PC 조회 중…"
              : "Chrome으로 PC 100위 조회"}
          </button>
          {rankLookupConfigured && (
            <button
              type="button"
              className="secondary"
              onClick={() => void observeRanks()}
              disabled={Boolean(busy) || !keyword.trim()}
            >
              {busy === "rank-observe"
                ? "기존 조회 중…"
                : "기존 PC·모바일 조회"}
            </button>
          )}
          <div className="keyword-rank-extension-status">
            <small>
              {rankExtension.available
                ? `Chrome 확장 프로그램 연결됨${
                    rankExtension.version
                      ? ` · v${rankExtension.version}`
                      : ""
                  }`
                : "Chrome 확장 프로그램을 설치한 뒤 페이지를 새로고침해 주세요."}
            </small>
            <small>
              광고를 제외한 가격비교 PC 공개 화면을 버튼을 누를 때만 확인합니다.
            </small>
          </div>
        </div>
        <label>
          <span>확인일</span>
          <input
            type="date"
            value={checkedAt}
            onChange={(event) => setCheckedAt(event.target.value)}
          />
        </label>
        <label>
          <span>순위</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={rank}
            disabled={notFound}
            onChange={(event) => setRank(event.target.value)}
            placeholder="예: 37"
          />
        </label>
        <label className="keyword-rank-not-found">
          <input
            type="checkbox"
            checked={notFound}
            onChange={(event) => setNotFound(event.target.checked)}
          />
          <span>1,000위 안에서 찾지 못함</span>
        </label>
        <button
          type="button"
          onClick={() => void saveObservation()}
          disabled={
            busy === "rank-save" ||
            !keyword.trim() ||
            !checkedAt ||
            (!notFound && (!rank || Number(rank) < 1 || Number(rank) > 1000))
          }
        >
          {busy === "rank-save" ? "기록 중…" : "순위 기록"}
        </button>
      </div>
      {observations.length ? (
        <div className="keyword-rank-history">
          {observations.slice(0, 20).map((observation) => (
            <div key={observation.id}>
              <strong>{observation.keyword}</strong>
              <small className="keyword-rank-device">
                {observation.device === "pc"
                  ? "PC"
                  : observation.device === "mobile"
                    ? "모바일"
                    : "직접 기록"}
              </small>
              <span>
                {observation.resultStatus === "blocked"
                  ? "조회 차단"
                  : observation.resultStatus === "failed"
                    ? "조회 실패"
                    : observation.rank
                      ? `${observation.rank.toLocaleString("ko-KR")}위`
                      : `${observation.checkedRange.toLocaleString("ko-KR")}위 내 미노출`}
              </span>
              <small>
                {new Date(observation.checkedAt).toLocaleString("ko-KR")}
              </small>
            </div>
          ))}
        </div>
      ) : (
        <div className="keyword-empty-state compact">
          <strong>아직 기록된 실제 순위가 없습니다.</strong>
          <span>상품명이나 태그를 바꾸기 전에 기준 순위를 먼저 기록해 보세요.</span>
        </div>
      )}
      <small className="keyword-field-help">
        조회값은 네이버 공식 순위 데이터가 아니라 조회 시점의 공개 검색 화면 관측값입니다.
        Chrome PC 조회는 가격비교 자연검색에서 광고를 제외하며, 검색 결과 변경이나
        화면 구조에 따라 실제 노출과 다를 수 있습니다.
      </small>
    </section>
  );
}

function AnalysisEditor({
  detail,
  busy,
  onBusy,
  onChange,
  onFeedback,
  onRefreshList,
}: {
  detail: ManagedProductDetail;
  busy: boolean;
  onBusy: (value: string | null) => void;
  onChange: (value: ManagedProductDetail) => void;
  onFeedback: (message: string | null, error: string | null) => void;
  onRefreshList: () => Promise<void>;
}) {
  const [analysis, setAnalysis] = useState(detail.analysis!.analysis);

  async function saveAndGenerateCandidates() {
    onBusy("candidates");
    onFeedback(null, null);
    try {
      const saved = await api<ManagedProductDetail>(
        `/api/keyword-products/${detail.product.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysis }),
        },
      );
      onChange(saved.data!);
      const generated = await api<ManagedProductDetail>(
        `/api/keyword-products/${detail.product.id}/candidates`,
        { method: "POST" },
      );
      onChange(generated.data!);
      try {
        const metrics = await api<ManagedProductDetail>(
          `/api/keyword-products/${detail.product.id}/metrics`,
          { method: "POST" },
        );
        onChange(metrics.data!);
        onFeedback("분석 결과를 저장하고 키워드 후보의 검색량과 경쟁도를 조회했습니다.", null);
      } catch (metricsError) {
        onFeedback(
          "키워드 후보는 저장했지만 네이버 검색 데이터를 불러오지 못했습니다. 상단의 ‘네이버 검색 데이터 조회’로 다시 시도해 주세요.",
          errorMessage(metricsError),
        );
      }
      await onRefreshList();
    } catch (caught) {
      onFeedback(null, errorMessage(caught));
    } finally {
      onBusy(null);
    }
  }

  return (
    <details className="keyword-card keyword-analysis" open>
      <summary>
        <div>
          <span className="inventory-eyebrow">2단계 · 분석 결과 검토</span>
          <strong>규칙 기반 상품 분석</strong>
        </div>
        <small>{detail.analysis!.model}</small>
      </summary>
      <p className="keyword-analysis-notice">
        자동 분석 결과가 정확하지 않을 수 있습니다. 키워드 조회 전에 핵심 상품 유형과
        상품 속성을 확인하세요.
      </p>
      {detail.analysis?.isStale && (
        <div className="keyword-callout warning" role="status">
          상품 정보가 변경되어 기존 분석 결과가 오래되었습니다. 분석을 다시 실행해 주세요.
        </div>
      )}
      {!analysis.primaryProductType && (
        <div className="keyword-callout warning" role="status">
          핵심 상품 유형을 확인해 주세요. 대표값을 선택해야 키워드 후보를 만들 수 있습니다.
        </div>
      )}
      <div className="keyword-analysis-grid keyword-chip-grid">
        {analysisFields.map(([key, label]) => (
          <EditableChipGroup
            key={key}
            fieldKey={key}
            label={label}
            values={analysis[key]}
            primaryValue={key === "productTypes" ? analysis.primaryProductType : null}
            onPrimaryChange={(value) =>
              setAnalysis((current) => ({
                ...current,
                productType: value,
                primaryProductType: value,
              }))
            }
            onChange={(values) =>
              setAnalysis((current) => ({
                ...current,
                [key]: values,
                ...(key === "productTypes" && !values.includes(current.primaryProductType ?? "")
                  ? { productType: "", primaryProductType: null }
                  : {}),
              }))
            }
            onMove={(value, target) =>
              setAnalysis((current) => moveAnalysisTerm(current, key, target, value))
            }
          />
        ))}
      </div>
      <div className="keyword-form-actions">
        <button
          type="button"
          onClick={() => void saveAndGenerateCandidates()}
          disabled={busy || detail.analysis?.isStale || !analysis.primaryProductType}
        >
          {busy ? "저장하고 검색 데이터 조회 중…" : "키워드 후보 만들기"}
        </button>
      </div>
    </details>
  );
}

type EditableAnalysisKey =
  | "productTypes"
  | "materials"
  | "purposes"
  | "targetCustomers"
  | "forms"
  | "features"
  | "colors"
  | "sizes"
  | "seasons"
  | "styles"
  | "categoryTerms"
  | "unclassifiedTerms";

const analysisFields: Array<[EditableAnalysisKey, string]> = [
  ["productTypes", "핵심 상품 유형"],
  ["materials", "소재·재질"],
  ["purposes", "용도"],
  ["categoryTerms", "일반 분류어"],
  ["targetCustomers", "대상"],
  ["forms", "형태·핏"],
  ["features", "주요 특징"],
  ["colors", "색상"],
  ["sizes", "사이즈"],
  ["seasons", "계절"],
  ["styles", "스타일"],
  ["unclassifiedTerms", "미분류 단어"],
];

function EditableChipGroup({
  fieldKey,
  label,
  values,
  primaryValue,
  onPrimaryChange,
  onChange,
  onMove,
}: {
  fieldKey: EditableAnalysisKey;
  label: string;
  values: string[];
  primaryValue: string | null;
  onPrimaryChange: (value: string) => void;
  onChange: (values: string[]) => void;
  onMove: (value: string, target: EditableAnalysisKey) => void;
}) {
  const [newValue, setNewValue] = useState("");

  function add() {
    const value = newValue.trim();
    if (!value || values.some((item) => normalizeForUi(item) === normalizeForUi(value))) return;
    onChange([...values, value]);
    setNewValue("");
  }

  return (
    <fieldset className={`keyword-chip-group ${fieldKey === "productTypes" ? "core-type-group" : ""}`}>
      <legend>{label}</legend>
      <div className="keyword-editable-chips">
        {values.map((value, index) => (
          <div className={`keyword-editable-chip ${fieldKey === "productTypes" ? "core-type" : ""}`} key={`${fieldKey}-${index}`}>
            {fieldKey === "productTypes" && (
              <input
                type="radio"
                name="primary-product-type"
                checked={primaryValue === value}
                aria-label={`${value} 대표 상품 유형으로 선택`}
                onChange={() => onPrimaryChange(value)}
              />
            )}
            <input
              value={value}
              aria-label={`${label} ${value} 수정`}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                onChange(next);
              }}
              onBlur={() => onChange(uniqueUiTerms(values))}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") event.currentTarget.blur();
              }}
            />
            {fieldKey !== "productTypes" && (
              <select
                aria-label={`${value} 다른 분류로 이동`}
                value=""
                onChange={(event) => {
                  const target = event.target.value as EditableAnalysisKey;
                  if (target) onMove(value, target);
                }}
              >
                <option value="">분류 이동</option>
                {analysisFields.filter(([key]) => key !== fieldKey).map(([key, text]) => (
                  <option key={key} value={key}>{text}</option>
                ))}
              </select>
            )}
            <button type="button" aria-label={`${value} 삭제`} onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}>×</button>
          </div>
        ))}
      </div>
      <div className="keyword-chip-add">
        <input
          value={newValue}
          aria-label={`${label} 추가`}
          placeholder="직접 추가"
          onChange={(event) => setNewValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
            if (event.key === "Escape") setNewValue("");
          }}
        />
        <button type="button" className="secondary" onClick={add}>추가</button>
      </div>
    </fieldset>
  );
}

function moveAnalysisTerm(
  analysis: ProductAnalysis,
  source: EditableAnalysisKey,
  target: EditableAnalysisKey,
  value: string,
) {
  const sourceValues = analysis[source].filter((item) => item !== value);
  const targetValues = uniqueUiTerms([...analysis[target], value]);
  const primaryWasMoved = source === "productTypes" && analysis.primaryProductType === value;
  return {
    ...analysis,
    [source]: sourceValues,
    [target]: targetValues,
    ...(primaryWasMoved ? { productType: "", primaryProductType: null } : {}),
  };
}

function uniqueUiTerms(values: string[]) {
  const seen = new Set<string>();
  return values.map((value) => value.trim()).filter((value) => {
    const normalized = normalizeForUi(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function normalizeForUi(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

function KeywordFilters({
  filters,
  onChange,
}: {
  filters: KeywordFilterState;
  onChange: (value: KeywordFilterState) => void;
}) {
  const tabs: Array<[KeywordFilterState["size"], string]> = [
    ["all", "전체"],
    ["small", "소형"],
    ["medium", "중형"],
    ["large", "대형"],
    ["unclassified", "미분류"],
  ];
  return (
    <div className="keyword-filter-panel">
      <div className="keyword-size-tabs" role="group" aria-label="키워드 그룹">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={filters.size === value ? "active" : undefined}
            onClick={() => onChange({ ...filters, size: value })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="keyword-filter-fields">
        <label>
          <span>키워드 검색</span>
          <input
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
            placeholder="키워드 입력"
          />
        </label>
        <label>
          <span>최소 월간 검색량</span>
          <input
            type="number"
            min={0}
            value={filters.minimumVolume}
            onChange={(event) =>
              onChange({ ...filters, minimumVolume: Math.max(0, Number(event.target.value) || 0) })
            }
          />
        </label>
        <label>
          <span>최대 월간 검색량</span>
          <input
            type="number"
            min={0}
            value={filters.maximumVolume ?? ""}
            onChange={(event) =>
              onChange({
                ...filters,
                maximumVolume: event.target.value === "" ? null : Math.max(0, Number(event.target.value)),
              })
            }
          />
        </label>
        <label>
          <span>경쟁도</span>
          <select
            value={filters.competition}
            onChange={(event) =>
              onChange({
                ...filters,
                competition: event.target.value as KeywordFilterState["competition"],
              })
            }
          >
            <option value="all">전체</option>
            <option value="low">낮음</option>
            <option value="medium">중간</option>
            <option value="high">높음</option>
            <option value="unknown">알 수 없음</option>
          </select>
        </label>
        <label>
          <span>정렬</span>
          <select
            value={filters.sort}
            onChange={(event) =>
              onChange({ ...filters, sort: event.target.value as KeywordFilterState["sort"] })
            }
          >
            <option value="recommended">후보 추천 순서</option>
            <option value="total-desc">전체 검색량 높은 순</option>
            <option value="total-asc">전체 검색량 낮은 순</option>
            <option value="pc-desc">PC 검색량 높은 순</option>
            <option value="mobile-desc">모바일 검색량 높은 순</option>
            <option value="keyword-asc">키워드 가나다순</option>
          </select>
        </label>
        <label className="keyword-checkbox-label">
          <input
            type="checkbox"
            checked={filters.selectedOnly}
            onChange={(event) => onChange({ ...filters, selectedOnly: event.target.checked })}
          />
          <span>선택한 키워드만 보기</span>
        </label>
        <button type="button" className="secondary" onClick={() => onChange(defaultKeywordFilters)}>
          필터 초기화
        </button>
      </div>
    </div>
  );
}

function KeywordTable({
  items,
  selectedIds,
  onToggle,
  onReject,
}: {
  items: KeywordCandidateRecord[];
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  onReject: (id: string) => void;
}) {
  return (
    <div className="keyword-table-scroll">
      <table className="keyword-table">
        <thead>
          <tr>
            <th>선택</th>
            <th>키워드</th>
            <th>분류</th>
            <th>PC 검색량</th>
            <th>모바일 검색량</th>
            <th>전체 검색량</th>
            <th>경쟁도</th>
            <th>상태</th>
            <th>검토</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={selectedIds.has(item.id) ? "selected" : undefined}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`${item.keyword} 선택`}
                  checked={selectedIds.has(item.id)}
                  onChange={(event) => onToggle(item.id, event.target.checked)}
                />
              </td>
              <td>
                <strong>{item.keyword}</strong>
                {isBeginnerKeywordCandidate(item) && (
                  <span className="keyword-beginner-badge">초기 공략 후보</span>
                )}
                {item.recommendationReason && (
                  <details>
                    <summary>추천 이유</summary>
                    <p>{item.recommendationReason}</p>
                  </details>
                )}
              </td>
              <td><KeywordSizeBadge value={item.keywordSize} /></td>
              <td>{formatRawVolume(item.rawMonthlyPcSearchVolume, item.monthlyPcSearchVolume)}</td>
              <td>{formatRawVolume(item.rawMonthlyMobileSearchVolume, item.monthlyMobileSearchVolume)}</td>
              <td className="keyword-total-volume">
                {formatRawTotalSearchVolume({
                  rawMonthlyPcSearchVolume: item.rawMonthlyPcSearchVolume,
                  rawMonthlyMobileSearchVolume: item.rawMonthlyMobileSearchVolume,
                  totalMonthlySearchVolume: item.totalMonthlySearchVolume,
                })}
              </td>
              <td>{competitionLabel(item.competition)}</td>
              <td><MetricsStatus value={item.metricsStatus} source={item.metricsSource} /></td>
              <td><button type="button" className="secondary" onClick={() => onReject(item.id)}>제외</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isBeginnerKeywordCandidate(item: KeywordCandidateRecord) {
  return (
    item.totalMonthlySearchVolume != null &&
    item.totalMonthlySearchVolume <=
      shoppingSearchOperatingHypotheses.beginnerMaximumMonthlySearchVolume
  );
}

function KeywordSizeBadge({ value }: { value: KeywordCandidateRecord["keywordSize"] }) {
  const labels = { small: "소형", medium: "중형", large: "대형", unclassified: "미분류" };
  return <span className={`keyword-size ${value}`}>{labels[value]}</span>;
}

function MetricsStatus({
  value,
  source,
}: {
  value: KeywordCandidateRecord["metricsStatus"];
  source: KeywordCandidateRecord["metricsSource"];
}) {
  const labels = {
    pending: "조회 전",
    success: source === "mock" ? "Mock" : "조회 완료",
    not_found: "결과 없음",
    error: "조회 실패",
  };
  return <span className={`keyword-metrics-status ${value}`}>{labels[value]}</span>;
}

function splitList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function htmlToPlainText(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/\s+/g, " ")
    .trim();
}

function formatRawVolume(raw: string | null, normalized: number | null) {
  if (raw?.trim().startsWith("<")) return raw;
  return normalized == null ? "—" : normalized.toLocaleString("ko-KR");
}

function competitionLabel(value: KeywordCandidateRecord["competition"]) {
  return { low: "낮음", medium: "중간", high: "높음", unknown: "알 수 없음" }[value];
}

function statusLabel(value: "SALE" | "OUTOFSTOCK" | "SUSPENSION") {
  return {
    SALE: "판매 중",
    OUTOFSTOCK: "품절",
    SUSPENSION: "판매 중지",
  }[value];
}

function serializeNaverAttributes(
  values: NaverProductAttribute[],
  requirements: CategoryRequirements | null,
  existing: NonNullable<
    ManagedProductDetail["product"]["productInput"]["naverAttributes"]
  >,
) {
  return values.map((value) => {
    const definition = requirements?.attributes.find(
      (item) => item.attributeSeq === value.attributeSeq,
    );
    const candidate = requirements?.attributeValues.find(
      (item) =>
        item.attributeSeq === value.attributeSeq &&
        item.attributeValueSeq === value.attributeValueSeq,
    );
    const previous = existing.find(
      (item) =>
        item.attributeSeq === value.attributeSeq &&
        item.attributeValueSeq === value.attributeValueSeq,
    );
    const displayValue =
      candidate?.attributeValueName ||
      [value.minValue, value.maxValue].filter(Boolean).join(" ~ ") ||
      previous?.value ||
      "직접 입력";
    return {
      attributeSeq: value.attributeSeq,
      attributeName:
        definition?.attributeName ??
        previous?.attributeName ??
        `속성 ${value.attributeSeq}`,
      attributeValueSeq: value.attributeValueSeq,
      value: displayValue,
      minValue: value.minValue,
      maxValue: value.maxValue,
      unitCode: value.unitCode,
    };
  });
}

async function api<T = unknown>(url: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message || "요청을 처리하지 못했습니다.");
  }
  return payload;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function SupplierAvailabilityResult({
  result,
  extensionAvailable,
}: {
  result?: SupplierAvailabilityCheck;
  extensionAvailable: boolean;
}) {
  if (!result) {
    return (
      <small className="keyword-supplier-stock-help">
        {extensionAvailable
          ? "아직 공급처 상태를 확인하지 않았습니다."
          : "Chrome 확장 프로그램을 설치한 뒤 페이지를 새로고침해 주세요."}
      </small>
    );
  }
  return (
    <div className={`keyword-supplier-stock-result status-${result.status}`}>
      <strong>{supplierAvailabilityLabel(result.status)}</strong>
      <span>{result.productName ?? "상품명 확인 안 됨"}</span>
      {result.evidence.map((item) => (
        <small key={item}>{item}</small>
      ))}
      {result.soldOutOptions.length > 0 && (
        <small>품절 옵션: {result.soldOutOptions.join(", ")}</small>
      )}
      <small>
        마지막 확인: {new Date(result.checkedAt).toLocaleString("ko-KR")}
      </small>
    </div>
  );
}

function supplierAvailabilityLabel(
  status: SupplierAvailabilityCheck["status"],
) {
  return {
    available: "판매 가능",
    partial_sold_out: "일부 옵션 품절",
    sold_out: "품절",
    discontinued: "단종·판매 종료",
    auth_required: "로그인·회원 승인 필요",
    unknown: "판정 불가",
    failed: "확인 실패",
  }[status];
}

function wasSupplierCheckedRecently(result?: SupplierAvailabilityCheck) {
  if (!result || ["unknown", "failed", "auth_required"].includes(result.status)) {
    return false;
  }
  const checkedAt = new Date(result.checkedAt).getTime();
  return Number.isFinite(checkedAt) && Date.now() - checkedAt < 24 * 60 * 60_000;
}

function isSupportedSupplierUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "zicgam.com" &&
      url.pathname === "/product/detail.html" &&
      /^\d+$/.test(url.searchParams.get("product_no") ?? "")
    );
  } catch {
    return false;
  }
}

function requestSupplierAvailabilityWithChrome(
  url: string,
  options: { background?: boolean } = {},
) {
  if (!isSupportedSupplierUrl(url)) {
    return Promise.reject(
      new Error("직감 상품 상세 URL과 product_no를 확인해 주세요."),
    );
  }
  const requestId =
    globalThis.crypto?.randomUUID?.() ??
    `supplier-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise<SupplierAvailabilityCheck>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "공급처 상태 확인 응답이 없습니다. 직감 로그인 상태와 확장 프로그램을 확인해 주세요.",
        ),
      );
    }, 90_000);
    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener(SUPPLIER_CHECK_RESULT_EVENT, handleResult);
    }
    function handleResult(event: Event) {
      const detail = (
        event as CustomEvent<{
          requestId?: string;
          result?: SupplierAvailabilityCheck;
        }>
      ).detail;
      if (detail?.requestId !== requestId || !detail.result) return;
      cleanup();
      resolve(detail.result);
    }
    window.addEventListener(SUPPLIER_CHECK_RESULT_EVENT, handleResult);
    window.dispatchEvent(
      new CustomEvent(SUPPLIER_CHECK_REQUEST_EVENT, {
        detail: {
          requestId,
          url,
          background: options.background === true,
        },
      }),
    );
  });
}

function saveSupplierAvailability(
  productId: string,
  supplierUrl: string,
  result: SupplierAvailabilityCheck,
) {
  return api<ManagedProductDetail>(
    `/api/keyword-products/${productId}/supplier-availability`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierUrl, result }),
    },
  );
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function requestChromeRankObservation(input: {
  keyword: string;
  channelProductNo: string;
  smartstoreUrl: string;
}) {
  const requestId =
    globalThis.crypto?.randomUUID?.() ??
    `rank-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise<ChromeRankResult>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Chrome 순위 조회 응답이 없습니다. 네이버 탭의 차단 화면과 확장 프로그램 상태를 확인해 주세요.",
        ),
      );
    }, 90_000);
    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener(
        RANK_EXTENSION_RESULT_EVENT,
        handleResult,
      );
    }
    function handleResult(event: Event) {
      const detail = (
        event as CustomEvent<{
          requestId?: string;
          result?: ChromeRankResult;
        }>
      ).detail;
      if (detail?.requestId !== requestId || !detail.result) return;
      cleanup();
      resolve(detail.result);
    }
    window.addEventListener(RANK_EXTENSION_RESULT_EVENT, handleResult);
    window.dispatchEvent(
      new CustomEvent(RANK_EXTENSION_REQUEST_EVENT, {
        detail: {
          requestId,
          keyword: input.keyword.trim(),
          channelProductNo: input.channelProductNo,
          smartstoreUrl: input.smartstoreUrl,
        },
      }),
    );
  });
}
