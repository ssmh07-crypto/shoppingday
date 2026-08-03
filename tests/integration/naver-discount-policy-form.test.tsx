// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NaverPublicationPolicyForm } from "@/app/admin/components/naver-publication-policy-form";
import { emptyNaverPublicationPolicy } from "@/modules/channels/naver/naver-publication-policy";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("네이버 즉시 할인율 설정", () => {
  it("정상 판매가를 유지하면서 할인 적용 예상가를 보여준다", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ success: true, data: [] }))),
    );

    render(
      <NaverPublicationPolicyForm
        mode="product"
        endpoint="/api/products/product-1/naver-publication-policy"
        initialDefaults={emptyNaverPublicationPolicy}
        initialOverrides={{ immediateDiscountPercent: null }}
        salePrice={20_000}
      />,
    );

    fireEvent.change(screen.getByLabelText("즉시 할인율"), {
      target: { value: "15" },
    });

    expect(screen.getByText(/예상 할인 판매가/)).toHaveTextContent(
      "예상 할인 판매가 17,000원",
    );
  });
});
