"use client";

import { useEffect, useState } from "react";
import type { DatabaseJsonObject } from "@/lib/db/schema";
import { NaverDeliveryPolicyInput } from "@/app/admin/components/naver-delivery-policy-input";

type StoreConnection = {
  id: string;
  storeName: string;
  isDefault: boolean;
};

type DeliveryPolicy = {
  id: string;
  storeConnectionId: string;
  policyCode: string;
  name: string;
  deliveryInfo: DatabaseJsonObject;
};

export function NaverDeliveryPolicyManager({
  stores,
}: {
  stores: StoreConnection[];
}) {
  const [storeConnectionId, setStoreConnectionId] = useState(
    stores.find((store) => store.isDefault)?.id ?? stores[0]?.id ?? "",
  );
  const [policies, setPolicies] = useState<DeliveryPolicy[]>([]);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [deliveryInfo, setDeliveryInfo] =
    useState<DatabaseJsonObject | null>(null);
  const [sourceProduct, setSourceProduct] = useState("");
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(Boolean(storeConnectionId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!storeConnectionId) return;
    const controller = new AbortController();
    void fetch(
      `/api/settings/channels/naver/delivery-policies?storeConnectionId=${encodeURIComponent(storeConnectionId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            body?.error?.message ?? "배송정책 목록을 불러오지 못했습니다.",
          );
        }
        setPolicies(body.policies ?? []);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setPolicies([]);
        setMessage(
          error instanceof Error
            ? error.message
            : "배송정책 목록을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [storeConnectionId]);

  function startCreate() {
    setEditingId("new");
    setName("");
    setDeliveryInfo(null);
    setSourceProduct("");
    setMessage("");
  }

  function startEdit(policy: DeliveryPolicy) {
    setEditingId(policy.id);
    setName(policy.name);
    setDeliveryInfo(policy.deliveryInfo);
    setSourceProduct("");
    setMessage("");
  }

  async function importFromProduct() {
    if (!sourceProduct.trim()) {
      setMessage("기존 스마트스토어 상품 링크나 상품번호를 입력해 주세요.");
      return;
    }
    setImporting(true);
    setMessage("");
    try {
      const response = await fetch(
        "/api/integrations/naver/delivery-policy-from-product",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            storeConnectionId,
            product: sourceProduct,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "기존 상품의 배송정책을 불러오지 못했습니다.",
        );
      }
      setDeliveryInfo(body.data.deliveryInfo);
      setName((current) =>
        current.trim() ? current : `${body.data.productName} 배송정책`,
      );
      setMessage(
        `채널상품번호 ${body.data.channelProductNo}의 배송정책을 불러왔습니다. 내용을 확인한 뒤 저장해 주세요.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "기존 상품의 배송정책을 불러오지 못했습니다.",
      );
    } finally {
      setImporting(false);
    }
  }

  async function save() {
    if (!name.trim()) {
      setMessage("배송정책 이름을 입력해 주세요.");
      return;
    }
    if (!deliveryInfo) {
      setMessage("네이버 배송정보를 선택해 배송정책을 완성해 주세요.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const creating = editingId === "new";
      const response = await fetch(
        creating
          ? "/api/settings/channels/naver/delivery-policies"
          : `/api/settings/channels/naver/delivery-policies/${editingId}`,
        {
          method: creating ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(creating ? { storeConnectionId } : {}),
            name,
            deliveryInfo,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "배송정책을 저장하지 못했습니다.",
        );
      }
      const saved = body.policy as DeliveryPolicy;
      setPolicies((current) =>
        creating
          ? [...current, saved].sort((a, b) =>
              a.policyCode.localeCompare(b.policyCode),
            )
          : current.map((policy) => (policy.id === saved.id ? saved : policy)),
      );
      setEditingId(null);
      setMessage(
        `배송정책 ${saved.policyCode} · ${saved.name}을 저장했습니다.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "배송정책을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(policy: DeliveryPolicy) {
    if (!confirm(`${policy.policyCode} · ${policy.name}을 삭제할까요?`)) return;
    const response = await fetch(
      `/api/settings/channels/naver/delivery-policies/${policy.id}`,
      { method: "DELETE" },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(body?.error?.message ?? "배송정책을 삭제하지 못했습니다.");
      return;
    }
    setPolicies((current) =>
      current.filter((candidate) => candidate.id !== policy.id),
    );
    setMessage(`배송정책 ${policy.policyCode}을 삭제했습니다.`);
  }

  if (!stores.length) {
    return (
      <section className="naver-delivery-policy-manager">
        <h2>스토어별 배송정책</h2>
        <p>스마트스토어를 먼저 연결하면 배송정책을 만들 수 있습니다.</p>
      </section>
    );
  }

  return (
    <section className="naver-delivery-policy-manager">
      <div className="naver-store-form-heading">
        <div>
          <span>스토어별 등록 설정</span>
          <h2>배송정책 관리</h2>
          <p>
            스토어별 배송정책을 한 번 저장한 뒤 상품에서는 6자리 관리번호만
            선택합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          disabled={editingId === "new"}
        >
          배송정책 추가
        </button>
      </div>

      <label className="naver-delivery-policy-store">
        <span>정책을 관리할 스마트스토어</span>
        <select
          value={storeConnectionId}
          onChange={(event) => {
            setLoading(true);
            setMessage("");
            setStoreConnectionId(event.target.value);
            setEditingId(null);
          }}
        >
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.storeName}
              {store.isDefault ? " · 기본" : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="naver-delivery-template-list">
        {policies.map((policy) => (
          <article key={policy.id}>
            <div>
              <code>{policy.policyCode}</code>
              <strong>{policy.name}</strong>
            </div>
            <div>
              <button
                type="button"
                className="secondary"
                onClick={() => startEdit(policy)}
              >
                편집
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => void remove(policy)}
              >
                삭제
              </button>
            </div>
          </article>
        ))}
        {!loading && !policies.length && (
          <p>이 스토어에 저장된 배송정책이 없습니다.</p>
        )}
        {loading && <p>배송정책 목록을 불러오는 중입니다.</p>}
      </div>

      {editingId && (
        <div className="naver-delivery-template-editor">
          <div className="naver-delivery-template-editor-heading">
            <div>
              <span>{editingId === "new" ? "새 정책" : "정책 편집"}</span>
              <h3>
                {editingId === "new"
                  ? "저장하면 다음 관리번호가 자동 발급됩니다."
                  : policies.find((policy) => policy.id === editingId)
                      ?.policyCode}
              </h3>
            </div>
            <label>
              <span>배송정책 이름</span>
              <input
                value={name}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder="예: 기본 무료배송"
              />
            </label>
          </div>
          <div className="drawer-url-import">
            <label htmlFor="delivery-policy-source-product">
              기존 스마트스토어 상품
            </label>
            <div>
              <input
                id="delivery-policy-source-product"
                value={sourceProduct}
                onChange={(event) => setSourceProduct(event.target.value)}
                placeholder="상품 링크 또는 채널상품번호"
              />
              <button
                type="button"
                onClick={() => void importFromProduct()}
                disabled={importing}
              >
                {importing ? "불러오는 중…" : "기존 배송정책 불러오기"}
              </button>
            </div>
            <small>
              판매 중인 상품의 배송정보를 가져온 뒤 이 스토어의 6자리
              관리번호로 저장합니다.
            </small>
          </div>
          <NaverDeliveryPolicyInput
            value={deliveryInfo}
            onChange={setDeliveryInfo}
            storeConnectionId={storeConnectionId}
          />
          <div className="naver-store-form-actions">
            <button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? "저장 중…" : "배송정책 저장"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditingId(null)}
            >
              취소
            </button>
          </div>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
