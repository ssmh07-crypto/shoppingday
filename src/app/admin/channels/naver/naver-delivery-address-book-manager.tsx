"use client";

import { useCallback, useEffect, useState } from "react";

type StoreConnection = {
  id: string;
  storeName: string;
  isDefault: boolean;
};

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

export function NaverDeliveryAddressBookManager({
  stores,
}: {
  stores: StoreConnection[];
}) {
  const [storeConnectionId, setStoreConnectionId] = useState(
    stores.find((store) => store.isDefault)?.id ?? stores[0]?.id ?? "",
  );
  const [options, setOptions] = useState<DeliveryOptions | null>(null);
  const [loading, setLoading] = useState(Boolean(storeConnectionId));
  const [message, setMessage] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!storeConnectionId) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/integrations/naver/delivery-options?storeConnectionId=${encodeURIComponent(storeConnectionId)}`,
        { cache: "no-store", signal },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "네이버 배송 주소록을 불러오지 못했습니다.",
        );
      }
      setOptions(body.data);
      setMessage("네이버 배송 주소록을 불러왔습니다.");
    } catch (error) {
      if (signal?.aborted) return;
      setOptions(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "네이버 배송 주소록을 불러오지 못했습니다.",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [storeConnectionId]);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [load]);

  if (!stores.length) return null;

  return (
    <section className="naver-delivery-address-book">
      <div className="naver-store-form-heading">
        <div>
          <span>네이버 원본 정보</span>
          <h2>배송 주소록</h2>
          <p>
            네이버가 발급한 주소록 번호와 계약 정보를 확인합니다. 새 주소는
            스마트스토어 판매자센터에서 등록한 뒤 새로고침하세요.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "불러오는 중…" : "주소록 새로고침"}
        </button>
      </div>

      <label className="naver-delivery-policy-store">
        <span>주소록을 확인할 스마트스토어</span>
        <select
          value={storeConnectionId}
          onChange={(event) => {
            setStoreConnectionId(event.target.value);
            setOptions(null);
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

      {options && (
        <div className="naver-delivery-address-groups">
          <AddressGroup title="출고지" addresses={options.releaseAddresses} />
          <AddressGroup
            title="반품·교환지"
            addresses={options.returnAddresses}
          />
          <InfoGroup
            title="반품 택배사"
            items={options.returnDeliveryCompanies.map((company) => ({
              id: company.returnDeliveryCompanyPriorityType,
              name: company.name,
            }))}
          />
          <InfoGroup
            title="묶음배송 그룹"
            items={options.bundleGroups.map((group) => ({
              id: String(group.id),
              name: `${group.name}${group.baseGroup ? " · 기본" : ""}`,
            }))}
          />
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

function AddressGroup({
  title,
  addresses,
}: {
  title: string;
  addresses: Address[];
}) {
  return (
    <section>
      <h3>
        {title} <span>{addresses.length}개</span>
      </h3>
      {addresses.map((address) => (
        <article key={address.addressBookNo}>
          <div>
            <strong>{address.name || "이름 없음"}</strong>
            <p>{addressText(address) || "주소 정보 없음"}</p>
          </div>
          <code>{address.addressBookNo}</code>
        </article>
      ))}
      {!addresses.length && <p>등록된 항목이 없습니다.</p>}
    </section>
  );
}

function InfoGroup({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; name: string }>;
}) {
  return (
    <section>
      <h3>
        {title} <span>{items.length}개</span>
      </h3>
      {items.map((item) => (
        <article key={item.id}>
          <strong>{item.name}</strong>
          <code>{item.id}</code>
        </article>
      ))}
      {!items.length && <p>등록된 항목이 없습니다.</p>}
    </section>
  );
}

function addressText(address: Address) {
  return (
    address.address ||
    [address.baseAddress, address.detailAddress].filter(Boolean).join(" ")
  );
}
