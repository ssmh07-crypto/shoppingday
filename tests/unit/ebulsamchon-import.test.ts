import { describe, expect, it, vi } from "vitest";
import { ebulsamchonCapturedProductSchema } from "@/modules/suppliers/ebulsamchon/ebulsamchon-import";

vi.mock("server-only", () => ({}));

const validProduct = {
  externalProductId: "652",
  url: "https://xn--wr3bq2dn2hzng.com/product/detail.html?product_no=652",
  originalName: "극세사 드림버니",
  supplierPrice: 12_300,
  availability: "active" as const,
  images: ["https://xn--wr3bq2dn2hzng.com/web/product/big/product.jpg"],
  options: [{ name: "색상: 화이트", price: 0 }],
  rawDescription: "<p>상세 설명</p>",
  capturedAt: "2026-09-02T00:00:00.000Z",
  evidence: ["구매 가능한 상품 버튼을 확인했습니다."],
};

describe("Ebul Samchon captured product", () => {
  it("accepts a complete authenticated Cafe24 product", () => {
    expect(ebulsamchonCapturedProductSchema.parse(validProduct)).toMatchObject({
      externalProductId: "652",
      supplierPrice: 12_300,
    });
  });

  it("rejects a product without an authenticated supplier price", () => {
    expect(
      ebulsamchonCapturedProductSchema.safeParse({
        ...validProduct,
        supplierPrice: null,
      }).success,
    ).toBe(false);
  });

  it("rejects product data from another host", () => {
    expect(
      ebulsamchonCapturedProductSchema.safeParse({
        ...validProduct,
        url: "https://example.com/product/detail.html?product_no=652",
      }).success,
    ).toBe(false);
  });
});
