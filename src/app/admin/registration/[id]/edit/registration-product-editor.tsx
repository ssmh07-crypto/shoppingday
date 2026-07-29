"use client";

import { useEffect, useState } from "react";
import { ProductEditor } from "@/app/admin/products/[id]/edit/product-editor";
import type {
  ProductEditorInitial,
  SourcingRegistrationContext,
} from "@/app/admin/products/[id]/edit/product-editor-types";

export function RegistrationProductEditor({
  productId,
  registrationContext,
}: {
  productId: string;
  registrationContext: SourcingRegistrationContext;
}) {
  const [editor, setEditor] = useState<ProductEditorInitial | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/products/${encodeURIComponent(productId)}`, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.data) {
          throw new Error(
            body?.error?.message ?? "등록 상품 정보를 불러오지 못했습니다.",
          );
        }
        setEditor(body.data);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "등록 상품 정보를 불러오지 못했습니다.",
        );
      });
    return () => controller.abort();
  }, [productId]);

  if (error) {
    return (
      <div className="registration-editor-state error" role="alert">
        <strong>등록 상품 정보를 불러오지 못했습니다.</strong>
        <p>{error}</p>
      </div>
    );
  }
  if (!editor) {
    return (
      <div className="registration-editor-state" aria-live="polite">
        등록 상품 정보를 불러오는 중…
      </div>
    );
  }
  return (
    <section className="registration-editor-shell">
      <ProductEditor
        initial={editor}
        registrationContext={registrationContext}
      />
    </section>
  );
}
