"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Supplier = {
  code: string;
  name: string;
  productNumberPrefix: string | null;
};

export function SupplierProductNumberSettings({
  suppliers,
}: {
  suppliers: Supplier[];
}) {
  const router = useRouter();
  const [selectedCode, setSelectedCode] = useState(suppliers[0]?.code ?? "");
  const selected = suppliers.find((supplier) => supplier.code === selectedCode);
  const [prefix, setPrefix] = useState(selected?.productNumberPrefix ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function selectSupplier(code: string) {
    setSelectedCode(code);
    setPrefix(
      suppliers.find((supplier) => supplier.code === code)
        ?.productNumberPrefix ?? "",
    );
    setMessage("");
  }

  async function save() {
    if (!selectedCode) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/suppliers/product-number-prefixes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ supplierCode: selectedCode, prefix }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(body?.error?.message ?? "접두사를 저장하지 못했습니다.");
        return;
      }
      setPrefix(body.supplier.productNumberPrefix ?? "");
      setMessage("저장했습니다.");
      router.refresh();
    } catch {
      setMessage("접두사를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (!suppliers.length) return null;
  return (
    <details className="inventory-number-settings">
      <summary>상품번호 규칙</summary>
      <div>
        <label>
          <span>공급처</span>
          <select
            value={selectedCode}
            onChange={(event) => selectSupplier(event.target.value)}
          >
            {suppliers.map((supplier) => (
              <option key={supplier.code} value={supplier.code}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>상품번호 접두사</span>
          <input
            value={prefix}
            maxLength={8}
            placeholder="예: ZG"
            onChange={(event) =>
              setPrefix(
                event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
              )
            }
          />
        </label>
        <button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "저장 중…" : "저장"}
        </button>
        <small role="status">
          {message ||
            `표시 예시: ${prefix || "접두사 없음"}${prefix ? "12345" : ""}`}
        </small>
      </div>
    </details>
  );
}
