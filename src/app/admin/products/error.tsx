"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ProductsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("products_page_render_failed", {
      digest: error.digest,
      name: error.name,
    });
  }, [error]);

  return (
    <main className="product-error-page">
      <div>
        <span>일시적인 연결 오류</span>
        <h1>상품 페이지를 불러오지 못했습니다.</h1>
        <p>
          잠시 후 다시 시도해 주세요. 입력하거나 저장한 상품 정보는 변경되지
          않았습니다.
        </p>
        <button type="button" onClick={reset}>
          다시 불러오기
        </button>
        <Link href="/admin/products">상품 목록으로 이동</Link>
      </div>
    </main>
  );
}
